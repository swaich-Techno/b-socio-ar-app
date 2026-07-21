from __future__ import annotations

import secrets
import tempfile
import traceback
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bson import ObjectId
import qrcode
import qrcode.image.svg

from .database import DatabaseGateway
from .exceptions import CustomerInputError, LeaseLostError, ModelValidationError, WorkerConfigurationError
from .image_pipeline import generate_mask, generate_thumbnail, process_background, validate_image
from .mesh_pipeline import optimise_to_glb
from .queue import JobRepository
from .settings import Settings
from .statuses import JobStatus, PROGRESS
from .storage import R2Storage
from .triposr_adapter import TripoSRAdapter


class JobProcessor:
    def __init__(self, settings: Settings, database: DatabaseGateway, repository: JobRepository, storage: R2Storage, adapter: TripoSRAdapter, worker_id: str) -> None:
        self.settings = settings
        self.database = database
        self.repository = repository
        self.storage = storage
        self.adapter = adapter
        self.worker_id = worker_id

    def process(self, job: dict[str, Any]) -> None:
        try:
            self.settings.temp_root.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=f"job-{job['_id']}-", dir=self.settings.temp_root) as folder:
                root = Path(folder).resolve()
                self._process_in_directory(job, root)
        except LeaseLostError:
            return
        except CustomerInputError as error:
            self.repository.request_changes(job, self.worker_id, "INVALID_SOURCE_IMAGE", str(error), traceback.format_exc())
        except WorkerConfigurationError as error:
            self.repository.defer_configuration(job, self.worker_id, "WORKER_CONFIGURATION", "Waiting for 3D worker configuration. Your upload is safe and remains queued.", str(error))
        except ModelValidationError:
            self.repository.retry_or_request_changes(job, self.worker_id, "INVALID_MODEL_OUTPUT", "The generated model did not pass validation. A safe retry was attempted; choose another source image or contact support if requested.", traceback.format_exc())
        except Exception:
            self.repository.retry_or_request_changes(job, self.worker_id, "GENERATION_ERROR", "3D generation could not finish. A safe retry is scheduled when attempts remain; your source image is preserved.", traceback.format_exc())

    def _process_in_directory(self, job: dict[str, Any], root: Path) -> None:
        now = datetime.now(UTC)
        assets = self.database.db.assets
        source_asset = assets.find_one({"_id": job["sourceAssetId"], "productId": job["productId"], "status": "VALIDATED", "visibility": "PRIVATE"})
        if not source_asset:
            raise CustomerInputError("The authorized source image is no longer available.")

        source_suffix = Path(str(source_asset.get("originalName", "source.png"))).suffix.lower()
        if source_suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise CustomerInputError("The source image extension is unsupported.")
        source = root / f"source{source_suffix}"
        self.repository.update_status(job, self.worker_id, JobStatus.VALIDATING_IMAGE, "Downloading and validating the private source image.")
        self.storage.download_private(source_asset["objectKey"], source, root)
        width, height = validate_image(source, self.settings.max_image_size_mb)
        assets.update_one({"_id": source_asset["_id"]}, {"$set": {"width": width, "height": height, "updatedAt": now}})

        processed = root / "processed.png"
        self.repository.update_status(job, self.worker_id, JobStatus.PROCESSING_BACKGROUND, "Separating the product from its background.")
        process_background(source, processed)
        mask = root / "mask.png"
        generate_mask(processed, mask)

        self.repository.update_status(job, self.worker_id, JobStatus.LOADING_MODEL, f"Loading open-source TripoSR on {self.adapter.device.upper()}.")
        self.adapter.load()
        mesh_source = root / "triposr-output.obj"
        self.repository.update_status(job, self.worker_id, JobStatus.GENERATING_MESH, "Generating product geometry with TripoSR.")
        self.adapter.generate_mesh(processed, mesh_source)

        self.repository.update_status(job, self.worker_id, JobStatus.BAKING_TEXTURE, "Preserving generated vertex colour and material data.")
        glb = root / "model.glb"
        self.repository.update_status(job, self.worker_id, JobStatus.CONVERTING_GLB, "Converting the generated mesh to GLB.")
        self.repository.update_status(job, self.worker_id, JobStatus.OPTIMISING_MODEL, "Centring, scaling, reducing geometry and validating the GLB.")
        metrics = optimise_to_glb(mesh_source, glb, self.settings.demo_model_target_size_mb, self.settings.blender_executable, self.settings.texture_resolution)

        thumbnail = root / "thumbnail.webp"
        self.repository.update_status(job, self.worker_id, JobStatus.GENERATING_THUMBNAIL, "Generating a compressed product thumbnail.")
        generate_thumbnail(processed, thumbnail)

        self.repository.update_status(job, self.worker_id, JobStatus.UPLOADING_RESULTS, "Uploading private model results.")
        output = self._upload_outputs(job, processed, mask, glb, thumbnail, metrics)
        final_status = JobStatus.NEEDS_MANUAL_REVIEW if metrics["warnings"] else JobStatus.READY_FOR_REVIEW
        self.repository.complete(job, self.worker_id, final_status, output["modelId"])
        self.database.db.notifications.insert_one({"userId": job["ownerId"], "businessId": job["businessId"], "type": "MODEL_READY", "title": "Your 3D model is ready for review", "message": "Processing completed and the product is in the administrator review queue.", "createdAt": datetime.now(UTC), "updatedAt": datetime.now(UTC)})

    def _asset(self, job: dict[str, Any], asset_type: str, key: str, original_name: str, upload: dict[str, Any], **metadata: Any) -> ObjectId:
        now = datetime.now(UTC)
        result = self.database.db.assets.insert_one({"ownerId": job["ownerId"], "businessId": job["businessId"], "productId": job["productId"], "assetType": asset_type, "objectKey": key, "originalName": original_name, "mimeType": upload["mimeType"], "size": upload["size"], "checksumSha256": upload["checksumSha256"], "etag": upload.get("etag"), "visibility": "PRIVATE", "status": "VALIDATED", "metadata": metadata, "createdAt": now, "updatedAt": now})
        return result.inserted_id

    def _upload_outputs(self, job: dict[str, Any], processed: Path, mask: Path, glb: Path, thumbnail: Path, metrics: dict[str, Any]) -> dict[str, ObjectId]:
        business = str(job["businessId"]); product = str(job["productId"])
        processed_key = self.storage.output_key(business, product, "processed-image", "png")
        mask_key = self.storage.output_key(business, product, "mask", "png")
        glb_key = self.storage.output_key(business, product, "glb-model", "glb")
        thumbnail_key = self.storage.output_key(business, product, "thumbnail", "webp")
        processed_id = self._asset(job, "PROCESSED_IMAGE", processed_key, "processed.png", self.storage.upload_private(processed, processed_key, {"job": str(job["_id"])}))
        self._asset(job, "MASK", mask_key, "mask.png", self.storage.upload_private(mask, mask_key, {"job": str(job["_id"]), "source": "processed-image"}))
        glb_id = self._asset(job, "GLB_MODEL", glb_key, "model.glb", self.storage.upload_private(glb, glb_key, {"job": str(job["_id"]), "private": "true"}), polygons=metrics["polygons"])
        thumbnail_id = self._asset(job, "THUMBNAIL", thumbnail_key, "thumbnail.webp", self.storage.upload_private(thumbnail, thumbnail_key, {"job": str(job["_id"])}), source="processed-image")
        version = self.database.db.models3D.count_documents({"productId": job["productId"]}) + 1
        status = JobStatus.NEEDS_MANUAL_REVIEW.value if metrics["warnings"] else JobStatus.READY_FOR_REVIEW.value
        now = datetime.now(UTC)
        model_id = self.database.db.models3D.insert_one({"ownerId": job["ownerId"], "businessId": job["businessId"], "productId": job["productId"], "jobId": job["_id"], "glbAssetId": glb_id, "thumbnailAssetId": thumbnail_id, "processedAssetId": processed_id, "version": version, "status": status, "fileSize": metrics["size"], "polygonCount": metrics["polygons"], "validationWarnings": metrics["warnings"], "technicallyValid": True, "scale": metrics["scale"], "orientation": {"x": 0, "y": 0, "z": 0}, "createdAt": now, "updatedAt": now}).inserted_id
        self._ensure_draft_ar_qr(job, model_id, thumbnail_id)
        return {"modelId": model_id, "glbAssetId": glb_id, "thumbnailAssetId": thumbnail_id}

    def _ensure_draft_ar_qr(self, job: dict[str, Any], model_id: ObjectId, thumbnail_id: ObjectId) -> None:
        product = self.database.db.products.find_one({"_id": job["productId"]})
        business = self.database.db.businesses.find_one({"_id": job["businessId"]})
        if not product or not business:
            raise RuntimeError("Product or business disappeared while creating draft AR")
        now = datetime.now(UTC)
        ar = self.database.db.arExperiences.find_one({"productId": job["productId"]})
        if not ar:
            draft_slug = f"{business['slug']}/{product['slug']}-{secrets.token_hex(4)}"
            ar_id = self.database.db.arExperiences.insert_one({"ownerId": job["ownerId"], "businessId": job["businessId"], "productId": job["productId"], "modelId": model_id, "thumbnailAssetId": thumbnail_id, "draftSlug": draft_slug, "status": JobStatus.READY_FOR_REVIEW.value, "title": product["name"], "description": product["description"], "price": product.get("price"), "currency": product.get("currency"), "whatsappUrl": business.get("whatsapp"), "websiteUrl": business.get("website"), "instagramUrl": business.get("instagram"), "opens": 0, "createdAt": now, "updatedAt": now}).inserted_id
            self.database.db.businesses.update_one({"_id": job["businessId"]}, {"$inc": {"demoArCount": 1}})
        else:
            ar_id = ar["_id"]
            draft_slug = ar["draftSlug"]
            self.database.db.arExperiences.update_one({"_id": ar_id}, {"$set": {"modelId": model_id, "thumbnailAssetId": thumbnail_id, "updatedAt": now}})
        if self.database.db.qrCodes.find_one({"productId": job["productId"]}):
            return
        code = secrets.token_urlsafe(8)
        qr_files = self._generate_qr_files(self.settings.app_url + "/q/" + code, Path(tempfile.mkdtemp(prefix="qr-", dir=self.settings.temp_root)))
        try:
            asset_ids: dict[str, ObjectId] = {}
            mapping = {"png": "QR_PNG", "transparent": "QR_TRANSPARENT_PNG", "svg": "QR_SVG", "print": "QR_PRINT"}
            for label, file_path in qr_files.items():
                key = self.storage.output_key(str(job["businessId"]), str(job["productId"]), f"qr-{label}", file_path.suffix)
                asset_ids[label] = self._asset(job, mapping[label], key, file_path.name, self.storage.upload_private(file_path, key, {"dynamic-code": code}))
            self.database.db.qrCodes.insert_one({"ownerId": job["ownerId"], "businessId": job["businessId"], "productId": job["productId"], "arExperienceId": ar_id, "uniqueCode": code, "destinationPath": f"/ar/{draft_slug}", "foreground": "#0F172A", "background": "#FFFFFF", "errorCorrectionLevel": "H", "size": 1024, "callToAction": "View in AR", "pngAssetId": asset_ids["png"], "transparentPngAssetId": asset_ids["transparent"], "svgAssetId": asset_ids["svg"], "printAssetId": asset_ids["print"], "scans": 0, "active": False, "createdAt": now, "updatedAt": now})
            self.database.db.businesses.update_one({"_id": job["businessId"]}, {"$inc": {"demoQrCount": 1}})
        finally:
            import shutil
            shutil.rmtree(qr_files["png"].parent, ignore_errors=True)

    @staticmethod
    def _generate_qr_files(content: str, root: Path) -> dict[str, Path]:
        root.mkdir(parents=True, exist_ok=True)
        maker = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=16, border=4)
        maker.add_data(content); maker.make(fit=True)
        files = {"png": root / "qr.png", "transparent": root / "qr-transparent.png", "svg": root / "qr.svg", "print": root / "qr-print.png"}
        maker.make_image(fill_color="#0F172A", back_color="#FFFFFF").save(files["png"])
        maker.make_image(fill_color="#0F172A", back_color="transparent").save(files["transparent"])
        maker.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(files["svg"])
        print_qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=32, border=8); print_qr.add_data(content); print_qr.make(fit=True); print_qr.make_image(fill_color="#0F172A", back_color="#FFFFFF").save(files["print"])
        return files
