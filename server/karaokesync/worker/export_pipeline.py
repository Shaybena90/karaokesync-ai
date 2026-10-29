"""MP4 export: lyrics + style → ASS → FFmpeg render → private storage."""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path

from ..config import Settings
from ..exports.ass import build_ass
from ..exports.measure import measurer_for
from ..exports.video import ASPECTS, RESOLUTIONS, canvas_for, render_mp4
from ..fonts import ensure_font
from ..lyrics_data import load_lyrics
from ..styles import parse_style
from ..supabase_client import SupabaseClient, SupabaseError
from .errors import PipelineError

log = logging.getLogger("karaokesync.export")


def run_export(job: dict, sb: SupabaseClient, settings: Settings, report) -> str:
    """Render the job's video and upload it. Returns the storage path."""
    if job["format"] != "mp4":
        raise PipelineError("unsupported_export", retryable=False)
    options = job.get("options") or {}
    aspect = options.get("aspect", "16:9")
    resolution = int(options.get("resolution", 1080))
    if aspect not in ASPECTS or resolution not in RESOLUTIONS:
        raise PipelineError("invalid_export_options", retryable=False)
    style = parse_style(options.get("style"))

    projects = sb.select("projects", {"id": f"eq.{job['project_id']}", "select": "id,user_id,title,language"})
    audio_rows = sb.select(
        "audio_files",
        {"project_id": f"eq.{job['project_id']}", "status": "eq.verified", "select": "*",
         "order": "created_at.desc", "limit": "1"},
    )
    if not projects or not audio_rows:
        raise PipelineError("audio_missing", retryable=False)
    project, audio = projects[0], audio_rows[0]
    lines = load_lyrics(sb, project["id"])
    if not lines:
        raise PipelineError("no_lyrics", retryable=False)

    Path(settings.worker_tmp_dir).mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"export-{job['id'][:8]}-", dir=settings.worker_tmp_dir))
    try:
        report(3)
        source = workdir / f"audio.{audio['storage_path'].rsplit('.', 1)[-1]}"
        try:
            url = sb.create_signed_url(settings.audio_bucket, audio["storage_path"], 300)
            sb.download_to(url, str(source), settings.max_upload_bytes)
        except SupabaseError as exc:
            raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc

        try:
            font = ensure_font(style.font)
        except RuntimeError as exc:
            raise PipelineError("font_unavailable", retryable=True) from exc
        canvas = canvas_for(aspect, resolution)
        ass_text = build_ass(lines, style, project.get("language"), canvas, measurer_for(str(font)), title=project["title"])

        duration_ms = int(audio.get("duration_ms") or (max(l["end_ms"] for l in lines) + 3000))
        report(5)
        out = render_mp4(
            workdir, source, ass_text, font, style, canvas, duration_ms,
            on_progress=lambda frac: report(5 + int(frac * 88)),
        )

        report(95)
        path = f"{project['user_id']}/{project['id']}/{job['id']}.mp4"
        try:
            sb.upload_file(settings.exports_bucket, path, str(out), "video/mp4")
        except SupabaseError as exc:
            if exc.status_code == 413:
                raise PipelineError("export_too_large", retryable=False) from exc
            raise PipelineError("export_upload_failed", retryable=True) from exc
        log.info("export job=%s rendered %s %sp (%d bytes)", job["id"], aspect, resolution, out.stat().st_size)
        return path
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
