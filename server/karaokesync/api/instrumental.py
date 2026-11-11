"""Melody only: ask the worker to remove the singer's voice from a song.

One job per song file. Asking again returns the job in progress, or the
finished track, instead of separating the same song twice.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings
from ..supabase_client import AuthUser, SupabaseClient, SupabaseError
from .common import iso, owned_project
from .deps import get_supabase, rate_limited_user, settings_dep

MAX_ACTIVE_PER_USER = 2


def latest_instrumental(sb: SupabaseClient, project_id: str, audio_file_id: str) -> dict | None:
    rows = sb.select("instrumental_jobs", {
        "project_id": f"eq.{project_id}", "audio_file_id": f"eq.{audio_file_id}", "select": "*",
        "order": "created_at.desc", "limit": "1",
    })
    return rows[0] if rows else None


def instrumental_router() -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/instrumental")
    def request_instrumental(
        project_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        project = owned_project(sb, project_id, user)
        audio = sb.select("audio_files", {"project_id": f"eq.{project_id}", "status": "eq.verified", "select": "id",
                                          "order": "created_at.desc", "limit": "1"})
        if not audio:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="audio_missing")
        current = latest_instrumental(sb, project_id, audio[0]["id"])
        if current and (current["status"] in ("queued", "running") or (current["status"] == "succeeded" and current.get("output_path"))):
            return current  # idempotent: in progress, or already done

        since = iso(datetime.now(timezone.utc) - timedelta(days=1))
        if sb.count("instrumental_jobs", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}"}) >= settings.max_instrumentals_per_day:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_instrumental_limit")
        if sb.count("instrumental_jobs", {"user_id": f"eq.{user.id}", "status": "in.(queued,running)"}) >= MAX_ACTIVE_PER_USER:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="too_many_active_instrumentals")
        try:
            return sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": audio[0]["id"], "user_id": user.id})
        except SupabaseError as exc:
            if exc.code == "23505":  # a double click: return the job the other request created
                again = latest_instrumental(sb, project_id, audio[0]["id"])
                if again:
                    return again
            raise

    return router
