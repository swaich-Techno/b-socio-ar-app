from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    mongodb_uri: SecretStr = Field(validation_alias="MONGODB_URI")
    mongodb_db_name: str = Field(default="bsocio_ar", validation_alias="MONGODB_DB_NAME")
    r2_endpoint: str = Field(validation_alias="R2_ENDPOINT")
    r2_access_key_id: SecretStr = Field(validation_alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: SecretStr = Field(validation_alias="R2_SECRET_ACCESS_KEY")
    r2_private_bucket: str = Field(validation_alias="R2_PRIVATE_BUCKET")
    r2_public_bucket: str = Field(validation_alias="R2_PUBLIC_BUCKET")
    worker_secret: SecretStr = Field(validation_alias="THREE_D_WORKER_SECRET")
    app_url: str = Field(default="http://localhost:3000", validation_alias="NEXT_PUBLIC_APP_URL")

    worker_id: str = Field(default="", validation_alias="THREE_D_WORKER_ID")
    device: Literal["auto", "cuda", "cpu"] = Field(default="auto", validation_alias="THREE_D_DEVICE")
    poll_seconds: float = Field(default=5.0, ge=0.25, le=300, validation_alias="THREE_D_POLL_SECONDS")
    heartbeat_seconds: float = Field(default=20.0, ge=5, le=300, validation_alias="THREE_D_HEARTBEAT_SECONDS")
    lock_timeout_minutes: int = Field(default=45, ge=5, le=1440, validation_alias="THREE_D_LOCK_TIMEOUT_MINUTES")
    max_attempts: int = Field(default=3, ge=1, le=10, validation_alias="THREE_D_MAX_ATTEMPTS")
    worker_version: str = Field(default="0.1.0", validation_alias="THREE_D_WORKER_VERSION")
    run_loop_in_api: bool = Field(default=False, validation_alias="WORKER_RUN_LOOP_IN_API")

    triposr_repository_path: Path | None = Field(default=None, validation_alias="TRIPOSR_REPOSITORY_PATH")
    triposr_model_id: str = Field(default="stabilityai/TripoSR", validation_alias="TRIPOSR_MODEL_ID")
    triposr_chunk_size: int = Field(default=8192, ge=1024, le=65536, validation_alias="TRIPOSR_CHUNK_SIZE")
    bake_texture: bool = Field(default=True, validation_alias="TRIPOSR_BAKE_TEXTURE")
    texture_resolution: int = Field(default=1024, ge=256, le=4096, validation_alias="TRIPOSR_TEXTURE_RESOLUTION")
    blender_executable: Path | None = Field(default=None, validation_alias="BLENDER_EXECUTABLE")
    temp_root: Path = Field(default=Path("tmp"), validation_alias="WORKER_TEMP_ROOT")
    demo_model_target_size_mb: int = Field(default=15, ge=1, le=250, validation_alias="DEMO_MODEL_TARGET_SIZE_MB")
    max_image_size_mb: int = Field(default=15, ge=1, le=100, validation_alias="MAX_IMAGE_SIZE_MB")

    @field_validator("app_url", "r2_endpoint")
    @classmethod
    def strip_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("must be an HTTP(S) URL")
        return value.rstrip("/")

    @field_validator("temp_root")
    @classmethod
    def absolute_temp_root(cls, value: Path) -> Path:
        return value.expanduser().resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
