"""Retention policy: delete old audio and abandoned uploads."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from ..config import Settings
from ..supabase_client import SupabaseClient

log = logging.getLogger("karaokesync.cleanup")


def run_retention(sb: SupabaseClient, settings: Settings, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    removed = 0

    # 1. Uploads that were started but never completed: remove the whole project.
    abandoned_before = (now - timedelta(hours=settings.abandoned_upload_hours)).isoformat()
    for project in sb.select(
        "projects",
        {"status": "eq.awaiting_upload", "created_at": f"lt.{abandoned_before}", "select": "id,user_id", "limit": "200"},
    ):
        prefix = f"{project['user_id']}/{project['id']}"
        sb.remove_objects(settings.audio_bucket, sb.list_objects(settings.audio_bucket, prefix))
        sb.delete("projects", {"id": f"eq.{project['id']}"})
        removed += 1

    # 2. Audio older than the retention period: delete the file, keep the lyrics.
    expire_before = (now - timedelta(days=settings.audio_retention_days)).isoformat()
    for audio in sb.select(
        "audio_files",
        {"status": "neq.deleted", "created_at": f"lt.{expire_before}", "select": "id,project_id,storage_path", "limit": "200"},
    ):
        sb.remove_objects(settings.audio_bucket, [audio["storage_path"]])
        sb.update("audio_files", {"id": f"eq.{audio['id']}"}, {"status": "deleted", "deleted_at": now.isoformat()})
        sb.update(
            "projects",
            {"id": f"eq.{audio['project_id']}", "status": "not.in.(queued,processing)"},
            {"status": "expired"},
        )
        removed += 1

    # 3. Rendered videos older than the export retention period.
    exports_before = (now - timedelta(days=settings.export_retention_days)).isoformat()
    for export in sb.select(
        "export_jobs",
        {"status": "eq.succeeded", "output_path": "not.is.null", "finished_at": f"lt.{exports_before}",
         "select": "id,output_path", "limit": "200"},
    ):
        sb.remove_objects(settings.exports_bucket, [export["output_path"]])
        sb.update("export_jobs", {"id": f"eq.{export['id']}"}, {"output_path": None, "error_code": "expired"})
        removed += 1

    if removed:
        log.info("retention removed %d item(s)", removed)
    return removed
