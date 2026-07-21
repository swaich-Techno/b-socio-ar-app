from app.statuses import JobStatus, PROGRESS
from app.auth import worker_secret_matches


def test_status_vocabulary_is_exact() -> None:
    assert [status.value for status in JobStatus] == [
        "UPLOADED", "QUEUED", "LOCKED", "VALIDATING_IMAGE", "PROCESSING_BACKGROUND",
        "LOADING_MODEL", "GENERATING_MESH", "BAKING_TEXTURE", "CONVERTING_GLB",
        "OPTIMISING_MODEL", "GENERATING_THUMBNAIL", "UPLOADING_RESULTS",
        "READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW", "CHANGES_REQUESTED", "APPROVED_DEMO",
        "REJECTED", "AWAITING_PACKAGE", "AWAITING_PAYMENT", "PRODUCTION_APPROVED",
        "PUBLISHED", "FAILED", "CANCELLED",
    ]
    assert PROGRESS[JobStatus.QUEUED] < PROGRESS[JobStatus.GENERATING_MESH] < PROGRESS[JobStatus.READY_FOR_REVIEW]


def test_worker_secret_requires_exact_bearer_token() -> None:
    assert worker_secret_matches("Bearer correct-secret", "correct-secret") is True
    assert worker_secret_matches("Bearer wrong-secret", "correct-secret") is False
    assert worker_secret_matches(None, "correct-secret") is False
