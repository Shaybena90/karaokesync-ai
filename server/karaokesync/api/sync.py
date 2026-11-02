"""Automatic sync of words typed in the editor.

The browser sends the words of one line and the stretch of the song where they
are sung. A sync job is queued for the worker, which finds when each word is
heard; the browser reads the result (RLS: own jobs only) and applies it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from ..config import Settings
from ..supabase_client import AuthUser, SupabaseClient
from .common import iso, owned_project
from .deps import get_supabase, rate_limited_user, settings_dep

MAX_WINDOW_MS = 60_000
MAX_ACTIVE_SYNCS_PER_USER = 3


class SyncRequest(BaseModel):
    words: list[str] = Field(min_length=1, max_length=80)
    window_start_ms: int = Field(ge=0)
    window_end_ms: int = Field(gt=0)

    @field_validator("words")
    @classmethod
    def _clean_words(cls, words: list[str]) -> list[str]:
        cleaned = [w.strip() for w in words]
        if any(not w or len(w) > 100 for w in cleaned):
            raise ValueError("each word must be 1-100 characters")
        return cleaned


def sync_router() -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/sync-jobs", status_code=201)
    def create_sync_job(
        project_id: str,
        body: SyncRequest,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        project = owned_project(sb, project_id, user)
        if project["status"] != "ready":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="not_ready")
        audio = sb.select(
            "audio_files",
            {"project_id": f"eq.{project_id}", "status": "eq.verified", "select": "id,duration_ms", "limit": "1"},
        )
        if not audio:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="audio_missing")

        start = body.window_start_ms
        end = body.window_end_ms
        if end - start > MAX_WINDOW_MS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_sync_window")
        duration = audio[0].get("duration_ms")
        if duration:
            end = min(end, int(duration))
        if end - start < 200:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_sync_window")

        since = iso(datetime.now(timezone.utc) - timedelta(days=1))
        if sb.count("sync_jobs", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}"}) >= settings.max_syncs_per_day:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_sync_limit")
        if sb.count("sync_jobs", {"user_id": f"eq.{user.id}", "status": "in.(queued,running)"}) >= MAX_ACTIVE_SYNCS_PER_USER:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="too_many_active_syncs")

        return sb.insert(
            "sync_jobs",
            {
                "project_id": project_id,
                "user_id": user.id,
                "words": body.words,
                "window_start_ms": start,
                "window_end_ms": end,
                "language": project.get("language"),
            },
        )

    return router
