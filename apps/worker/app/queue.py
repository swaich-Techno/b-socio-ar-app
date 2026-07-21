from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from bson import ObjectId
from pymongo import ReturnDocument

from .database import DatabaseGateway
from .exceptions import LeaseLostError
from .settings import Settings
from .statuses import JobStatus, PROCESSING_STATUSES, PROGRESS


class JobRepository:
    """Atomic queue and renewable per-business lease management."""

    def __init__(self, database: DatabaseGateway, settings: Settings) -> None:
        self.database = database
        self.settings = settings
        self.jobs = database.db.threeDJobs
        self.businesses = database.db.businesses

    @property
    def stale_before(self) -> datetime:
        return datetime.now(UTC) - timedelta(minutes=self.settings.lock_timeout_minutes)

    @staticmethod
    def _lease_filter(job: dict[str, Any], worker_id: str) -> dict[str, Any]:
        return {"_id": job["_id"], "workerId": worker_id, "leaseToken": job.get("leaseToken")}

    def recover_stale_locks(self) -> int:
        cutoff = self.stale_before
        stale_jobs = list(self.jobs.find(
            {"status": {"$in": [status.value for status in PROCESSING_STATUSES]}, "lockTimestamp": {"$lt": cutoff}},
            {"_id": 1, "businessId": 1, "productId": 1, "workerId": 1, "leaseToken": 1, "lockTimestamp": 1, "attempts": 1},
        ))
        recovered = 0
        now = datetime.now(UTC)
        for job in stale_jobs:
            lease_filter = {
                "_id": job["_id"], "workerId": job.get("workerId"), "leaseToken": job.get("leaseToken"),
                "lockTimestamp": job.get("lockTimestamp"), "status": {"$in": [status.value for status in PROCESSING_STATUSES]},
            }
            attempts = int(job.get("attempts", 0))
            if attempts >= self.settings.max_attempts:
                result = self.jobs.update_one(lease_filter, {
                    "$set": {"status": JobStatus.CHANGES_REQUESTED.value, "progress": 100, "currentStep": "Processing stopped after repeated safe retries.", "errorCode": "STALE_LOCK_MAX_ATTEMPTS", "customerSafeError": "Generation could not finish after several safe retries. Choose a source image and queue it again, or contact support.", "completedAt": now, "updatedAt": now},
                    "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": ""},
                })
                if result.modified_count:
                    self.database.db.products.update_one({"_id": job.get("productId")}, {"$set": {"approvalStatus": JobStatus.CHANGES_REQUESTED.value, "updatedAt": now}})
            else:
                result = self.jobs.update_one(lease_filter, {
                    "$set": {"status": JobStatus.QUEUED.value, "progress": PROGRESS[JobStatus.QUEUED], "currentStep": "Waiting for processing.", "availableAt": now, "updatedAt": now},
                    "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": ""},
                })
                recovered += result.modified_count
            if result.modified_count:
                self.release_business(job["businessId"], job.get("workerId"), job.get("leaseToken"), job["_id"])
        return recovered

    def claim_next(self, worker_id: str) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        candidates = self.jobs.find({"status": JobStatus.QUEUED.value, "availableAt": {"$lte": now}}).sort("createdAt", 1).limit(25)
        for candidate in candidates:
            business_id = candidate["businessId"]
            lease_token = uuid4().hex
            lease = self.businesses.find_one_and_update(
                {"_id": business_id, "$or": [{"threeDWorkerLock": {"$exists": False}}, {"threeDWorkerLock": None}, {"threeDWorkerLock.lockedAt": {"$lt": self.stale_before}}]},
                {"$set": {"threeDWorkerLock": {"workerId": worker_id, "jobId": candidate["_id"], "leaseToken": lease_token, "lockedAt": now}}},
                return_document=ReturnDocument.AFTER,
            )
            if not lease:
                continue
            job = self.jobs.find_one_and_update(
                {"_id": candidate["_id"], "status": JobStatus.QUEUED.value},
                {"$set": {"status": JobStatus.LOCKED.value, "progress": PROGRESS[JobStatus.LOCKED], "currentStep": "Worker reserved this job.", "workerId": worker_id, "leaseToken": lease_token, "lockTimestamp": now, "startedAt": candidate.get("startedAt") or now, "updatedAt": now}, "$inc": {"attempts": 1}},
                return_document=ReturnDocument.AFTER,
            )
            if job:
                return job
            self.release_business(business_id, worker_id, lease_token, candidate["_id"])
        return None

    def renew_lease(self, job: dict[str, Any], worker_id: str) -> None:
        now = datetime.now(UTC)
        result = self.jobs.update_one(
            {**self._lease_filter(job, worker_id), "status": {"$in": [status.value for status in PROCESSING_STATUSES]}},
            {"$set": {"lockTimestamp": now, "updatedAt": now}},
        )
        if result.matched_count != 1:
            raise LeaseLostError(f"Job lease was lost for {job['_id']}")
        business = self.businesses.update_one(
            {"_id": job["businessId"], "threeDWorkerLock.workerId": worker_id, "threeDWorkerLock.jobId": job["_id"], "threeDWorkerLock.leaseToken": job.get("leaseToken")},
            {"$set": {"threeDWorkerLock.lockedAt": now}},
        )
        if business.matched_count != 1:
            raise LeaseLostError(f"Business lease was lost for job {job['_id']}")
        job["lockTimestamp"] = now

    def update_status(self, job: dict[str, Any], worker_id: str, status: JobStatus, step: str, **extra: Any) -> None:
        self.renew_lease(job, worker_id)
        values = {"status": status.value, "progress": PROGRESS[status], "currentStep": step, "updatedAt": datetime.now(UTC), **extra}
        result = self.jobs.update_one(self._lease_filter(job, worker_id), {"$set": values})
        if result.matched_count != 1:
            raise LeaseLostError(f"Job status lease was lost for {job['_id']}")
        job["status"] = status.value

    def complete(self, job: dict[str, Any], worker_id: str, status: JobStatus, model_id: ObjectId) -> None:
        self.renew_lease(job, worker_id)
        now = datetime.now(UTC)
        result = self.jobs.update_one(self._lease_filter(job, worker_id), {
            "$set": {"status": status.value, "progress": 100, "currentStep": "Model is ready for administrator review." if status is JobStatus.READY_FOR_REVIEW else "Model generated with technical warnings.", "outputModelId": model_id, "completedAt": now, "updatedAt": now},
            "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": "", "internalTechnicalError": "", "customerSafeError": "", "errorCode": ""},
        })
        if result.modified_count != 1:
            raise LeaseLostError(f"Completion lease was lost for {job['_id']}")
        self.database.db.products.update_one({"_id": job["productId"]}, {"$set": {"approvalStatus": status.value, "updatedAt": now}})
        self.release_business(job["businessId"], worker_id, job.get("leaseToken"), job["_id"])

    def release_business(self, business_id: ObjectId, worker_id: str | None = None, lease_token: str | None = None, job_id: ObjectId | None = None) -> None:
        query: dict[str, Any] = {"_id": business_id}
        if worker_id:
            query["threeDWorkerLock.workerId"] = worker_id
        if lease_token:
            query["threeDWorkerLock.leaseToken"] = lease_token
        if job_id:
            query["threeDWorkerLock.jobId"] = job_id
        self.businesses.update_one(query, {"$unset": {"threeDWorkerLock": ""}})

    def request_changes(self, job: dict[str, Any], worker_id: str, code: str, safe_error: str, technical_error: str) -> None:
        now = datetime.now(UTC)
        result = self.jobs.update_one(self._lease_filter(job, worker_id), {
            "$set": {"status": JobStatus.CHANGES_REQUESTED.value, "progress": 100, "currentStep": "A different source image or support review is needed.", "errorCode": code, "customerSafeError": safe_error, "internalTechnicalError": technical_error[:8000], "completedAt": now, "updatedAt": now},
            "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": ""},
        })
        if result.modified_count:
            self.database.db.products.update_one({"_id": job["productId"]}, {"$set": {"approvalStatus": JobStatus.CHANGES_REQUESTED.value, "updatedAt": now}})
        self.release_business(job["businessId"], worker_id, job.get("leaseToken"), job["_id"])

    def retry_or_request_changes(self, job: dict[str, Any], worker_id: str, code: str, safe_error: str, technical_error: str) -> None:
        if int(job.get("attempts", 0)) >= self.settings.max_attempts:
            self.request_changes(job, worker_id, code, safe_error, technical_error)
            return
        now = datetime.now(UTC)
        delay = timedelta(seconds=min(60 * (2 ** max(int(job.get("attempts", 1)) - 1, 0)), 900))
        self.jobs.update_one(self._lease_filter(job, worker_id), {
            "$set": {"status": JobStatus.QUEUED.value, "progress": PROGRESS[JobStatus.QUEUED], "currentStep": "A safe retry is scheduled.", "errorCode": code, "customerSafeError": safe_error, "internalTechnicalError": technical_error[:8000], "availableAt": now + delay, "updatedAt": now},
            "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": ""},
        })
        self.release_business(job["businessId"], worker_id, job.get("leaseToken"), job["_id"])

    def defer_configuration(self, job: dict[str, Any], worker_id: str, code: str, safe_error: str, technical_error: str) -> None:
        now = datetime.now(UTC)
        self.jobs.update_one(self._lease_filter(job, worker_id), {
            "$set": {"status": JobStatus.QUEUED.value, "progress": PROGRESS[JobStatus.QUEUED], "currentStep": "Waiting for processing.", "errorCode": code, "customerSafeError": safe_error, "internalTechnicalError": technical_error[:8000], "availableAt": now + timedelta(minutes=10), "updatedAt": now},
            "$unset": {"workerId": "", "lockTimestamp": "", "leaseToken": ""}, "$inc": {"attempts": -1},
        })
        self.release_business(job["businessId"], worker_id, job.get("leaseToken"), job["_id"])
