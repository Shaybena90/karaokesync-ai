"""KaraokeSync AI — HTTP API.

The API is intentionally thin: it authorises requests, enforces quotas, issues
short-lived storage permissions and puts jobs on the queue. Heavy audio work
happens in the separate worker process (karaokesync.worker.runner).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..audio_validation import (
    ALLOWED_MIME_TYPES,
    SNIFF_BYTES,
    STORAGE_CONTENT_TYPE,
    TOLERATED_MIME_TYPES,
    AudioValidationError,
    extension_of,
    verify_audio,
)
from ..config import Settings, get_settings
from ..logging_setup import setup_logging
from ..supabase_client import AuthUser, SupabaseClient, SupabaseError
from .common import iso as _iso
from .common import owned_project as _owned_project
from .deps import get_supabase, rate_limited_user, settings_dep
from .exports import exports_router

log = logging.getLogger("karaokesync.api")

ACTIVE_JOB_STATUSES = "(queued,running)"
SIGNED_READ_SECONDS = 120


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging()
    app = FastAPI(
        title="KaraokeSync AI API",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
    )
    app.include_router(_router())
    app.include_router(exports_router())
    return app


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class UploadInitRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    mime_type: str = Field(default="", max_length=100)
    title: str | None = Field(default=None, max_length=200)


class UploadInitResponse(BaseModel):
    project_id: str
    audio_file_id: str
    upload_url: str
    content_type: str


class ProjectStateResponse(BaseModel):
    project_id: str
    status: str
    job_id: str | None = None
    duration_ms: int | None = None
    error_code: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _latest_audio(sb: SupabaseClient, project_id: str) -> dict:
    rows = sb.select(
        "audio_files",
        {"project_id": f"eq.{project_id}", "select": "*", "order": "created_at.desc", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="audio_missing")
    return rows[0]


def _active_job(sb: SupabaseClient, audio_file_id: str) -> dict | None:
    rows = sb.select(
        "processing_jobs",
        {"audio_file_id": f"eq.{audio_file_id}", "status": f"in.{ACTIVE_JOB_STATUSES}", "select": "*"},
    )
    return rows[0] if rows else None


def _enqueue(sb: SupabaseClient, project: dict, audio: dict) -> dict:
    """Create a processing job. The partial unique index in the database makes
    this safe against double clicks and concurrent requests."""
    try:
        job = sb.insert(
            "processing_jobs",
            {"project_id": project["id"], "audio_file_id": audio["id"], "user_id": project["user_id"]},
        )
    except SupabaseError as exc:
        if exc.code == "23505":  # unique_violation -> a job is already active
            existing = _active_job(sb, audio["id"])
            if existing:
                return existing
        raise
    sb.update("projects", {"id": f"eq.{project['id']}"}, {"status": "queued", "error_code": None})
    return job


def _check_active_jobs_quota(sb: SupabaseClient, user: AuthUser, settings: Settings) -> None:
    active = sb.count("processing_jobs", {"user_id": f"eq.{user.id}", "status": f"in.{ACTIVE_JOB_STATUSES}"})
    if active >= settings.max_active_jobs_per_user:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="too_many_active_jobs")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
def _router() -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict:
        return {"ok": True}

    @router.get("/limits")
    def limits(settings: Settings = Depends(settings_dep)) -> dict:
        return {
            "max_upload_bytes": settings.max_upload_bytes,
            "max_audio_duration_seconds": settings.max_audio_duration_seconds,
            "allowed_extensions": ["mp3", "wav", "m4a"],
            "max_uploads_per_day": settings.max_uploads_per_day,
        }

    @router.post("/uploads", response_model=UploadInitResponse, status_code=201)
    def init_upload(
        body: UploadInitRequest,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> UploadInitResponse:
        ext = extension_of(body.file_name)
        if ext is None:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_extension")
        mime = body.mime_type.lower()
        if mime not in ALLOWED_MIME_TYPES and mime not in TOLERATED_MIME_TYPES:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_mime")
        if body.size_bytes > settings.max_upload_bytes:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="file_too_large")

        since = _iso(datetime.now(timezone.utc) - timedelta(days=1))
        uploads_today = sb.count("projects", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}"})
        if uploads_today >= settings.max_uploads_per_day:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_upload_limit")
        _check_active_jobs_quota(sb, user, settings)

        title = (body.title or body.file_name.rsplit(".", 1)[0]).strip()[:200] or "Untitled"
        project = sb.insert("projects", {"user_id": user.id, "title": title})
        audio_id = str(uuid.uuid4())
        path = f"{user.id}/{project['id']}/{audio_id}.{ext}"
        try:
            audio = sb.insert(
                "audio_files",
                {
                    "id": audio_id,
                    "project_id": project["id"],
                    "user_id": user.id,
                    "storage_path": path,
                    "original_name": body.file_name[:255],
                    "declared_mime": mime or "unknown",
                    "size_bytes": body.size_bytes,
                },
            )
            upload_url = sb.create_signed_upload_url(settings.audio_bucket, path)
        except Exception:
            sb.delete("projects", {"id": f"eq.{project['id']}"})
            raise
        log.info("upload initialised project=%s user=%s", project["id"], user.id)
        return UploadInitResponse(
            project_id=project["id"],
            audio_file_id=audio["id"],
            upload_url=upload_url,
            content_type=STORAGE_CONTENT_TYPE[ext],
        )

    @router.post("/uploads/{project_id}/complete", response_model=ProjectStateResponse)
    def complete_upload(
        project_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> ProjectStateResponse:
        project = _owned_project(sb, project_id, user)
        audio = _latest_audio(sb, project_id)

        # Idempotent: calling "complete" twice returns the current state.
        if audio["status"] == "verified":
            job = _active_job(sb, audio["id"])
            return ProjectStateResponse(
                project_id=project_id, status=project["status"], job_id=job["id"] if job else None,
                duration_ms=audio["duration_ms"], error_code=project.get("error_code"),
            )
        if audio["status"] != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="audio_" + audio["status"])

        try:
            signed = sb.create_signed_url(settings.audio_bucket, audio["storage_path"], SIGNED_READ_SECONDS)
            head, total_size = sb.read_range(signed, SNIFF_BYTES)
        except SupabaseError as exc:
            if exc.status_code in (400, 404):
                raise HTTPException(status.HTTP_409_CONFLICT, detail="upload_missing") from exc
            raise

        try:
            if total_size is not None and total_size > settings.max_upload_bytes:
                raise AudioValidationError("file_too_large")
            result = verify_audio(head, signed, settings.max_audio_duration_seconds * 1000)
            if result.format != extension_of(audio["storage_path"]):
                raise AudioValidationError("format_mismatch")
        except AudioValidationError as exc:
            sb.remove_objects(settings.audio_bucket, [audio["storage_path"]])
            sb.update("audio_files", {"id": f"eq.{audio['id']}"},
                      {"status": "rejected", "deleted_at": _iso(datetime.now(timezone.utc))})
            sb.update("projects", {"id": f"eq.{project_id}"}, {"status": "failed", "error_code": exc.code})
            log.info("upload rejected project=%s code=%s", project_id, exc.code)
            return ProjectStateResponse(project_id=project_id, status="failed", error_code=exc.code)

        verified = {
            "status": "verified",
            "detected_format": result.format,
            "duration_ms": result.duration_ms,
            "verified_at": _iso(datetime.now(timezone.utc)),
        }
        if total_size:
            verified["size_bytes"] = total_size
        audio = sb.update("audio_files", {"id": f"eq.{audio['id']}", "status": "eq.pending"}, verified)[0]
        job = _enqueue(sb, project, audio)
        log.info("upload verified project=%s format=%s job=%s", project_id, result.format, job["id"])
        return ProjectStateResponse(
            project_id=project_id, status="queued", job_id=job["id"], duration_ms=result.duration_ms
        )

    @router.post("/projects/{project_id}/retry", response_model=ProjectStateResponse)
    def retry_project(
        project_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> ProjectStateResponse:
        project = _owned_project(sb, project_id, user)
        audio = _latest_audio(sb, project_id)
        if audio["status"] != "verified":
            # The file itself was rejected or deleted: the user must upload again.
            raise HTTPException(status.HTTP_409_CONFLICT, detail="reupload_required")
        existing = _active_job(sb, audio["id"])
        if existing:
            return ProjectStateResponse(project_id=project_id, status=project["status"], job_id=existing["id"])
        if project["status"] != "failed":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="not_retryable")

        since = _iso(datetime.now(timezone.utc) - timedelta(days=1))
        jobs_today = sb.count("processing_jobs", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}"})
        if jobs_today >= settings.max_uploads_per_day + settings.max_retries_per_day:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_processing_limit")
        _check_active_jobs_quota(sb, user, settings)

        job = _enqueue(sb, project, audio)
        return ProjectStateResponse(project_id=project_id, status="queued", job_id=job["id"])

    @router.delete("/projects/{project_id}", status_code=204)
    def delete_project(
        project_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> None:
        _owned_project(sb, project_id, user)
        prefix = f"{user.id}/{project_id}"
        for bucket in (settings.audio_bucket, settings.exports_bucket):
            sb.remove_objects(bucket, sb.list_objects(bucket, prefix))
        # Cascades to audio_files, jobs, lyrics. A worker holding a job for this
        # project loses its lease on the next heartbeat and stops.
        sb.delete("projects", {"id": f"eq.{project_id}", "user_id": f"eq.{user.id}"})
        log.info("project deleted project=%s", project_id)

    return router


app = create_app()
