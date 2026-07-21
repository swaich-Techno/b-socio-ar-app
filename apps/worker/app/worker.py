from __future__ import annotations

import logging
import os
import threading
import time
from socket import gethostname
from uuid import uuid4

from .database import DatabaseGateway
from .pipeline import JobProcessor
from .queue import JobRepository
from .settings import Settings, get_settings
from .storage import R2Storage
from .triposr_adapter import TripoSRAdapter

logger = logging.getLogger("bsocio.worker")


class WorkerRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.worker_id = settings.worker_id or f"{gethostname()}-{os.getpid()}-{uuid4().hex[:8]}"
        self.database = DatabaseGateway(settings)
        self.repository = JobRepository(self.database, settings)
        self.storage = R2Storage(settings)
        self.adapter = TripoSRAdapter(settings)
        self.processor = JobProcessor(settings, self.database, self.repository, self.storage, self.adapter, self.worker_id)
        self.stop_event = threading.Event()
        self.current_job = None
        self.current_job_id = None
        self.last_healthy_at = 0.0

    def run_once(self) -> bool:
        self.repository.recover_stale_locks()
        job = self.repository.claim_next(self.worker_id)
        if not job:
            self.database.heartbeat(self.worker_id, self.adapter.device, self.settings.worker_version)
            return False
        self.current_job_id = job["_id"]
        self.current_job = job
        self.database.heartbeat(self.worker_id, self.adapter.device, self.settings.worker_version, self.current_job_id)
        self.last_healthy_at = time.time()
        try:
            self.processor.process(job)
        finally:
            self.current_job = None
            self.current_job_id = None
            self.database.heartbeat(self.worker_id, self.adapter.device, self.settings.worker_version)
            self.last_healthy_at = time.time()
        return True

    def run_forever(self) -> None:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
        while not self.stop_event.is_set():
            try:
                self.database.ping(); self.database.ensure_indexes(); self.last_healthy_at = time.time()
                break
            except Exception:
                logger.exception("worker_startup_dependency_error")
                self.stop_event.wait(self.settings.poll_seconds)
        if self.stop_event.is_set():
            self.database.close()
            return
        logger.info("worker_started", extra={"worker_id": self.worker_id, "device": self.adapter.device})
        heartbeat = threading.Thread(target=self._heartbeat_loop, name="bsocio-heartbeat", daemon=True)
        heartbeat.start()
        try:
            while not self.stop_event.is_set():
                try:
                    worked = self.run_once()
                except Exception:
                    logger.exception("worker_loop_error")
                    worked = False
                if not worked:
                    self.stop_event.wait(self.settings.poll_seconds)
        finally:
            self.stop_event.set()
            heartbeat.join(timeout=self.settings.heartbeat_seconds + 1)
            self.database.close()

    def _heartbeat_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                job = self.current_job
                if job:
                    self.repository.renew_lease(job, self.worker_id)
                self.database.heartbeat(self.worker_id, self.adapter.device, self.settings.worker_version, self.current_job_id)
                self.last_healthy_at = time.time()
            except Exception:
                logger.exception("worker_heartbeat_error")
            self.stop_event.wait(self.settings.heartbeat_seconds)

    def stop(self) -> None:
        self.stop_event.set()


def main() -> None:
    WorkerRunner(get_settings()).run_forever()


if __name__ == "__main__":
    main()
