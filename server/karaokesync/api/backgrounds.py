"""Video backgrounds: upload, verify and delete a project's background files.

Same flow as song uploads: the API creates the row and a one-time signed
upload URL, the browser uploads straight to the private "backgrounds" bucket,
then asks the API to verify the file (magic bytes + ffprobe). Which file
shows when is part of the project's style (style.backgrounds).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import Settings
from ..media_validation import CONTENT_TYPES, SNIFF_BYTES, MediaValidationError, media_format_of, verify_media
from ..supabase_client import AuthUser, SupabaseClient, SupabaseError
from .common import iso, owned_project
from .deps import get_supabase, rate_limited_user, settings_dep

log = logging.getLogger("karaokesync.api")

SIGNED_READ_SECONDS = 300


class BackgroundInit(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)


def _owned_media(sb: SupabaseClient, media_id: str, user: AuthUser) -> dict:
    try:
        uuid.UUID(media_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="background_not_found") from exc
    rows = sb.select("background_media", {"id": f"eq.{media_id}", "user_id": f"eq.{user.id}", "select": "*"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="background_not_found")
    return rows[0]


def backgrounds_router() -> APIRouter:
    router = APIRouter()

    @router.post("/projects/{project_id}/backgrounds", status_code=201)
    def init_background(
        project_id: str,
        body: BackgroundInit,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        project = owned_project(sb, project_id, user)
        fmt = media_format_of(body.file_name)
        if fmt is None:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_background")
        if body.size_bytes > settings.max_background_mb * 1024 * 1024:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="background_too_large")
        in_project = sb.count("background_media", {"project_id": f"eq.{project_id}", "status": "neq.rejected"})
        if in_project >= settings.max_backgrounds_per_project:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="too_many_backgrounds")
        since = iso(datetime.now(timezone.utc) - timedelta(days=1))
        if sb.count("background_media", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}"}) >= settings.max_background_uploads_per_day:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_background_limit")

        media_id = str(uuid.uuid4())
        path = f"{user.id}/{project['id']}/{media_id}.{fmt}"
        row = sb.insert("background_media", {
            "id": media_id, "project_id": project["id"], "user_id": user.id, "storage_path": path,
            "original_name": body.file_name[:255], "format": fmt, "size_bytes": body.size_bytes,
        })
        try:
            upload_url = sb.create_signed_upload_url(settings.backgrounds_bucket, path)
        except Exception:
            sb.delete("background_media", {"id": f"eq.{media_id}"})
            raise
        return {"media": row, "upload_url": upload_url, "content_type": CONTENT_TYPES[fmt]}

    @router.post("/backgrounds/{media_id}/complete")
    def complete_background(
        media_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        media = _owned_media(sb, media_id, user)
        if media["status"] != "pending":
            return media  # idempotent
        try:
            signed = sb.create_signed_url(settings.backgrounds_bucket, media["storage_path"], SIGNED_READ_SECONDS)
            head, total_size = sb.read_range(signed, SNIFF_BYTES)
        except SupabaseError as exc:
            if exc.status_code in (400, 404):
                raise HTTPException(status.HTTP_409_CONFLICT, detail="upload_missing") from exc
            raise
        try:
            if total_size is not None and total_size > settings.max_background_mb * 1024 * 1024:
                raise MediaValidationError("background_too_large")
            info = verify_media(head, signed, media["format"], settings.max_background_seconds * 1000)
        except MediaValidationError as exc:
            sb.remove_objects(settings.backgrounds_bucket, [media["storage_path"]])
            rows = sb.update("background_media", {"id": f"eq.{media_id}"}, {"status": "rejected", "error_code": exc.code})
            log.info("background rejected media=%s code=%s", media_id, exc.code)
            return rows[0] if rows else {**media, "status": "rejected", "error_code": exc.code}
        verified = {
            "status": "verified", "kind": info.kind, "duration_ms": info.duration_ms, "width": info.width,
            "height": info.height, "verified_at": iso(datetime.now(timezone.utc)),
        }
        if total_size:
            verified["size_bytes"] = total_size
        rows = sb.update("background_media", {"id": f"eq.{media_id}", "status": "eq.pending"}, verified)
        log.info("background verified media=%s kind=%s", media_id, info.kind)
        return rows[0] if rows else {**media, **verified}

    @router.delete("/backgrounds/{media_id}", status_code=204)
    def delete_background(
        media_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> None:
        media = _owned_media(sb, media_id, user)
        sb.remove_objects(settings.backgrounds_bucket, [media["storage_path"]])
        sb.delete("background_media", {"id": f"eq.{media_id}", "user_id": f"eq.{user.id}"})

    return router
