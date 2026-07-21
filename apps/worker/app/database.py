from __future__ import annotations

from datetime import UTC, datetime
from socket import gethostname
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from .settings import Settings


class DatabaseGateway:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: MongoClient[dict[str, Any]] = MongoClient(
            settings.mongodb_uri.get_secret_value(),
            serverSelectionTimeoutMS=10_000,
            appname=f"bsocio-3d-worker/{settings.worker_version}",
        )
        self.db: Database[dict[str, Any]] = self.client[settings.mongodb_db_name]

    def ping(self) -> None:
        self.client.admin.command("ping")

    def ensure_indexes(self) -> None:
        self.db.threeDJobs.create_index([("status", ASCENDING), ("availableAt", ASCENDING), ("createdAt", ASCENDING)])
        self.db.threeDJobs.create_index([("businessId", ASCENDING), ("status", ASCENDING)])
        self.db.threeDJobs.create_index([("productId", ASCENDING)], unique=True)
        self.db.threeDJobs.create_index([("lockTimestamp", ASCENDING)])
        self.db.workerHeartbeats.create_index([("workerId", ASCENDING)], unique=True)
        self.db.workerHeartbeats.create_index([("lastHeartbeat", DESCENDING)])

    def heartbeat(self, worker_id: str, device: str, version: str, current_job_id: Any | None = None) -> None:
        queue_length = self.db.threeDJobs.count_documents({"status": "QUEUED"})
        now = datetime.now(UTC)
        self.db.workerHeartbeats.update_one(
            {"workerId": worker_id},
            {
                "$set": {
                    "workerId": worker_id,
                    "lastHeartbeat": now,
                    "currentJobId": current_job_id,
                    "queueLength": queue_length,
                    "deviceType": device,
                    "workerVersion": version,
                    "hostname": gethostname(),
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )

    def close(self) -> None:
        self.client.close()
