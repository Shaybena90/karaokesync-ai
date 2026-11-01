"""הגדרות תצורה של SceneOps AI (נטענות ממשתני סביבה / קובץ .env)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_prefix="SCENEOPS_",
        extra="ignore",
    )

    # בסיס נתונים: SQLite כברירת מחדל. ל-PostgreSQL: postgresql+psycopg://user:pass@host/db
    database_url: str = Field(default="")
    data_dir: Path = Field(default=PROJECT_DIR / "data")

    # אחסון עותקי עבודה, תמונות ממוזערות, דוחות. חייב להיות נפרד מתיקיות המקור.
    storage_root: Path = Field(default=PROJECT_DIR / "data" / "storage")

    # תיקיות מקור מורשות בהתקנה ראשונית (מופרדות ב-;). ניתן לנהל בהמשך בממשק.
    initial_source_roots: str = Field(default=str(PROJECT_DIR / "sample_data" / "evidence"))

    # מצב הדגמה: מאפשר כניסה עם משתמשי דמו. אין להשתמש בייצור.
    demo_mode: bool = True
    session_hours: int = 8
    secret_key: str = "change-me-local-demo-only"

    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    max_upload_mb: int = 25
    hash_chunk_mb: int = 4

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    display_timezone: str = "Asia/Jerusalem"

    worker_poll_seconds: float = 1.0
    worker_lease_seconds: int = 60

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(self.data_dir / 'sceneops.db').as_posix()}"

    @property
    def fonts_dir(self) -> Path:
        return Path(__file__).resolve().parent / "assets" / "fonts"


@lru_cache
def get_settings() -> Settings:
    return Settings()
