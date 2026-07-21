from __future__ import annotations

import mimetypes
import hashlib
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore.config import Config

from .settings import Settings


class R2Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            region_name="auto",
            aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
            config=Config(signature_version="s3v4", retries={"max_attempts": 4, "mode": "standard"}),
        )

    @staticmethod
    def _safe_destination(root: Path, destination: Path) -> Path:
        resolved_root = root.resolve()
        resolved = destination.resolve()
        if resolved != resolved_root and resolved_root not in resolved.parents:
            raise ValueError("Temporary path escaped its job directory")
        return resolved

    def download_private(self, object_key: str, destination: Path, job_root: Path) -> Path:
        target = self._safe_destination(job_root, destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(self.settings.r2_private_bucket, object_key, str(target))
        return target

    def upload_private(self, source: Path, object_key: str, metadata: dict[str, str]) -> dict[str, Any]:
        content_type = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        checksum = hashlib.sha256()
        with source.open("rb") as checksum_stream:
            for chunk in iter(lambda: checksum_stream.read(1024 * 1024), b""):
                checksum.update(chunk)
        with source.open("rb") as stream:
            result = self.client.put_object(
                Bucket=self.settings.r2_private_bucket,
                Key=object_key,
                Body=stream,
                ContentType=content_type,
                Metadata={key.lower(): str(value)[:1000] for key, value in metadata.items()},
            )
        return {"etag": str(result.get("ETag", "")).strip('"'), "size": source.stat().st_size, "mimeType": content_type, "checksumSha256": checksum.hexdigest()}

    @staticmethod
    def output_key(business_id: str, product_id: str, kind: str, extension: str) -> str:
        safe = lambda value: "".join(character for character in value if character.isalnum() or character in "-_")
        return f"businesses/{safe(business_id)}/products/{safe(product_id)}/{safe(kind)}/{uuid4().hex}.{safe(extension.lower().lstrip('.'))}"
