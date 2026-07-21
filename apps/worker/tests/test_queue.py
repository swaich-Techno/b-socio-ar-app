from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import mongomock
from bson import ObjectId

from app.queue import JobRepository


def repository():
    db = mongomock.MongoClient().db
    gateway = SimpleNamespace(db=db)
    settings = SimpleNamespace(lock_timeout_minutes=45, max_attempts=3)
    return JobRepository(gateway, settings), db


def add_job(db, business_id, created_offset=0):
    now = datetime.now(UTC)
    job_id = ObjectId()
    db.threeDJobs.insert_one({"_id": job_id, "ownerId": ObjectId(), "businessId": business_id, "productId": ObjectId(), "sourceAssetId": ObjectId(), "status": "QUEUED", "attempts": 0, "availableAt": now - timedelta(seconds=1), "createdAt": now + timedelta(seconds=created_offset)})
    return job_id


def test_only_one_job_per_business_can_be_locked() -> None:
    repo, db = repository()
    business_id = ObjectId(); db.businesses.insert_one({"_id": business_id})
    first_id = add_job(db, business_id); second_id = add_job(db, business_id, 1)
    first = repo.claim_next("worker-a")
    assert first and first["_id"] == first_id and first["status"] == "LOCKED"
    assert repo.claim_next("worker-b") is None
    assert db.threeDJobs.find_one({"_id": second_id})["status"] == "QUEUED"
    repo.release_business(business_id, "worker-a")
    second = repo.claim_next("worker-b")
    assert second and second["_id"] == second_id


def test_stale_lock_returns_to_queue_without_data_loss() -> None:
    repo, db = repository()
    business_id = ObjectId(); job_id = ObjectId()
    db.businesses.insert_one({"_id": business_id, "threeDWorkerLock": {"workerId": "gone", "jobId": job_id, "lockedAt": datetime.now(UTC) - timedelta(hours=2)}})
    db.threeDJobs.insert_one({"_id": job_id, "businessId": business_id, "status": "GENERATING_MESH", "attempts": 1, "lockTimestamp": datetime.now(UTC) - timedelta(hours=2)})
    assert repo.recover_stale_locks() == 1
    recovered = db.threeDJobs.find_one({"_id": job_id})
    assert recovered["status"] == "QUEUED"
    assert "threeDWorkerLock" not in db.businesses.find_one({"_id": business_id})


def test_heartbeat_renews_job_and_matching_business_lease() -> None:
    repo, db = repository()
    business_id = ObjectId(); db.businesses.insert_one({"_id": business_id})
    add_job(db, business_id)
    job = repo.claim_next("worker-a")
    assert job
    original = job["lockTimestamp"]
    repo.renew_lease(job, "worker-a")
    renewed = db.threeDJobs.find_one({"_id": job["_id"]})
    business = db.businesses.find_one({"_id": business_id})
    assert renewed["lockTimestamp"] >= original
    assert business["threeDWorkerLock"]["leaseToken"] == job["leaseToken"]


def test_stale_recovery_does_not_clear_a_replacement_lease() -> None:
    repo, db = repository()
    business_id = ObjectId(); job_id = ObjectId(); stale = datetime.now(UTC) - timedelta(hours=2)
    db.businesses.insert_one({"_id": business_id, "threeDWorkerLock": {"workerId": "new", "jobId": ObjectId(), "leaseToken": "new-token", "lockedAt": datetime.now(UTC)}})
    db.threeDJobs.insert_one({"_id": job_id, "businessId": business_id, "productId": ObjectId(), "workerId": "gone", "leaseToken": "old-token", "status": "GENERATING_MESH", "attempts": 1, "lockTimestamp": stale})
    assert repo.recover_stale_locks() == 1
    assert db.businesses.find_one({"_id": business_id})["threeDWorkerLock"]["leaseToken"] == "new-token"
