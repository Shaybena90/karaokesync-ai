"""Application settings, loaded from environment variables / the root .env file."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", Path.cwd() / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "production", "test"] = "development"

    # Supabase (server side). The service role key must NEVER reach the browser.
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    audio_bucket: str = "audio"
    exports_bucket: str = "exports"

    # API
    cors_origins: str = "http://localhost:5173"

    # Upload limits (also returned to the browser through GET /limits)
    max_upload_mb: int = 50
    max_audio_duration_seconds: int = 600
    max_uploads_per_day: int = 20
    max_active_jobs_per_user: int = 2
    max_retries_per_day: int = 10

    # Retention
    audio_retention_days: int = 30
    abandoned_upload_hours: int = 24

    # Worker
    worker_id: str = ""
    worker_poll_seconds: float = 3.0
    worker_lease_seconds: int = 120
    worker_tmp_dir: str = str(ROOT_DIR / "server" / "tmp")
    whisper_model: str = "large-v3"
    whisper_device: Literal["auto", "cpu", "cuda"] = "auto"
    whisper_compute_type: str = "auto"
    enable_vocal_separation: bool = False
    demucs_model: str = "htdemucs"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def require_supabase(self) -> None:
        if not self.supabase_url or not self.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env (see .env.example)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
