from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from . import __version__
from .auth import worker_secret_matches
from .settings import get_settings
from .triposr_adapter import resolve_device
from .worker import WorkerRunner

runner: WorkerRunner | None = None
thread: threading.Thread | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global runner, thread
    settings = get_settings()
    if settings.run_loop_in_api:
        runner = WorkerRunner(settings)
        thread = threading.Thread(target=runner.run_forever, name="bsocio-queue", daemon=True)
        thread.start()
    yield
    if runner:
        runner.stop()
    if thread:
        thread.join(timeout=15)


app = FastAPI(title="bsocio-3d-worker", version=__version__, docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {"service": "bsocio-3d-worker", "version": settings.worker_version, "device": resolve_device(settings.device), "healthy": True}


@app.get("/ready")
def ready(authorization: str | None = Header(default=None)) -> dict[str, str | bool]:
    settings = get_settings()
    if not worker_secret_matches(authorization, settings.worker_secret.get_secret_value()):
        raise HTTPException(status_code=401, detail="Worker authentication failed")
    if settings.run_loop_in_api and (thread is None or not thread.is_alive() or runner is None):
        raise HTTPException(status_code=503, detail="Queue processor is not running")
    if runner is not None:
        if runner.last_healthy_at and time.time() - runner.last_healthy_at > settings.heartbeat_seconds * 3:
            raise HTTPException(status_code=503, detail="Queue processor heartbeat is stale")
        try:
            runner.database.ping()
        except Exception as error:
            raise HTTPException(status_code=503, detail="MongoDB is unavailable") from error
    return {"service": "bsocio-3d-worker", "ready": True, "queueProcessor": bool(thread and thread.is_alive())}
