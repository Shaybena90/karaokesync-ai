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
    backgrounds_bucket: str = "backgrounds"

    # API
    cors_origins: str = "http://localhost:5173"
    # Who may see the processing servers and pause them from the website (comma separated).
    admin_emails: str = ""
    # Online lyrics search (LRCLIB: a free, open lyrics database; no key needed).
    lyrics_search_url: str = "https://lrclib.net"

    # Upload limits (also returned to the browser through GET /limits)
    max_upload_mb: int = 50
    max_audio_duration_seconds: int = 600
    max_uploads_per_day: int = 20
    max_active_jobs_per_user: int = 2
    max_retries_per_day: int = 10
    max_syncs_per_day: int = 300

    # Video backgrounds (animated GIF / short video / image)
    max_background_mb: int = 30
    max_background_seconds: int = 60
    max_backgrounds_per_project: int = 10
    max_background_uploads_per_day: int = 30

    # Melody only (vocals removed with Demucs on the worker)
    max_instrumentals_per_day: int = 10

    # Retention
    audio_retention_days: int = 30
    abandoned_upload_hours: int = 24

    # Worker
    worker_id: str = ""
    worker_poll_seconds: float = 3.0
    worker_lease_seconds: int = 120
    worker_tmp_dir: str = str(ROOT_DIR / "server" / "tmp")
    whisper_model: str = "large-v3-turbo"
    # Better models for specific languages, e.g. "he=ivrit-ai/whisper-large-v3-turbo-ct2".
    # Comma separated; a model that cannot be loaded falls back to WHISPER_MODEL.
    whisper_language_models: str = ""
    whisper_device: Literal["auto", "cpu", "cuda"] = "auto"
    whisper_compute_type: str = "auto"
    fonts_dir: str = str(ROOT_DIR / "server" / "fonts")
    max_exports_per_day: int = 10
    # Supabase's free plan stores files of up to 50 MB: videos are encoded to fit.
    # Raise it after raising the storage upload limit (Supabase Pro).
    max_export_mb: int = 48
    # auto = the NVIDIA card's encoder (NVENC) when it works, else the CPU (libx264)
    video_encoder: Literal["auto", "libx264", "h264_nvenc"] = "auto"
    export_retention_days: int = 7
    # Recognise the singing on the vocals alone (Demucs). "auto" = when Demucs is installed.
    # The rest of the music is kept as the song's melody-only track at the same time.
    vocal_separation: Literal["auto", "on", "off"] = "auto"
    enable_vocal_separation: bool = False  # older setting: true = "on"
    demucs_model: str = "htdemucs"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def is_admin(self, email: str | None) -> bool:
        admins = {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}
        return bool(email) and email.lower() in admins

    def language_models(self) -> dict[str, str]:
        out = {}
        for item in self.whisper_language_models.split(","):
            lang, _, model = item.partition("=")
            if lang.strip() and model.strip():
                out[lang.strip().lower()] = model.strip()
        return out

    def production_problems(self) -> list[str]:
        """Configuration mistakes that must stop a production server from starting."""
        problems = []
        if not self.supabase_url.startswith("https://"):
            problems.append("SUPABASE_URL must be the https:// address of your Supabase project")
        if not self.supabase_service_role_key:
            problems.append("SUPABASE_SERVICE_ROLE_KEY is missing")
        origins = self.cors_origin_list
        if not origins:
            problems.append("CORS_ORIGINS must list the website address (e.g. https://your-site.vercel.app)")
        for origin in origins:
            if origin == "*" or "localhost" in origin or "127.0.0.1" in origin or not origin.startswith("https://"):
                problems.append(f"CORS_ORIGINS contains {origin!r}: in production only https:// website addresses are allowed")
        return problems

    def require_supabase(self) -> None:
        if not self.supabase_url or not self.supabase_service_role_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env (see .env.example)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
