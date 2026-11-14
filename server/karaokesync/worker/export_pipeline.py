"""MP4 export: lyrics + style → ASS → FFmpeg render → private storage."""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx

from ..animated_backgrounds import BACKGROUNDS as ANIMATED_BACKGROUNDS
from ..animated_backgrounds import clip_for
from ..config import Settings
from ..exports.ass import build_ass
from ..exports.measure import measurer_for
from ..exports.opening import ARTIST_FONT, PREVIEW_RESOLUTION, PREVIEW_SONG_MS, TITLE_FONT, OpeningOptions, opening_files, title_ass
from ..exports.video import ASPECTS, RESOLUTIONS, BackgroundLayer, canvas_for, render_mp4
from ..fonts import ensure_font
from ..lyrics_data import load_lyrics
from ..styles import SubtitleStyle, parse_style
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
    preview = options.get("preview") is True
    if aspect not in ASPECTS or resolution not in (*RESOLUTIONS, *((PREVIEW_RESOLUTION,) if preview else ())):
        raise PipelineError("invalid_export_options", retryable=False)
    style = parse_style(options.get("style"))
    try:
        opening = OpeningOptions.model_validate(options.get("opening") or {})
    except ValueError as exc:
        raise PipelineError("invalid_export_options", retryable=False) from exc

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
        track = audio["storage_path"]
        if options.get("audio") == "instrumental":
            # The melody-only track: same timeline as the song, without the singer.
            rows = sb.select("instrumental_jobs", {
                "project_id": f"eq.{project['id']}", "audio_file_id": f"eq.{audio['id']}", "status": "eq.succeeded",
                "output_path": "not.is.null", "select": "output_path", "order": "created_at.desc", "limit": "1",
            })
            if not rows:
                raise PipelineError("instrumental_not_ready", retryable=False)
            track = rows[0]["output_path"]
        source = workdir / f"audio.{track.rsplit('.', 1)[-1]}"
        try:
            url = sb.create_signed_url(settings.audio_bucket, track, 300)
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
        if preview:
            duration_ms = min(duration_ms, PREVIEW_SONG_MS)
        report(4)
        title_subs, extra_fonts = None, []
        if opening.active:
            opening_files(opening, aspect)
            if opening.title:
                try:
                    title_font, artist_font = ensure_font(TITLE_FONT), ensure_font(ARTIST_FONT)
                except RuntimeError as exc:
                    raise PipelineError("font_unavailable", retryable=True) from exc
                extra_fonts = [title_font, artist_font]
                title_subs = title_ass(opening.title, canvas, measurer_for(str(title_font)), measurer_for(str(artist_font)),
                                       project.get("language"))
        layers = _animated_layer(settings, style, duration_ms) + _download_backgrounds(
            sb, settings, project, style, duration_ms, workdir
        )
        report(6)
        out = render_mp4(
            workdir, source, ass_text, font, style, canvas, duration_ms,
            on_progress=lambda frac: report(6 + int(frac * 87)),
            backgrounds=layers,
            max_bytes=settings.max_export_mb * 1024 * 1024,
            encoder=_video_encoder(settings),
            opening=opening if opening.active else None,
            aspect=aspect,
            title_subs=title_subs,
            extra_fonts=extra_fonts,
        )

        report(95)
        path = f"{project['user_id']}/{project['id']}/{job['id']}{'-preview' if preview else ''}.mp4"
        size_mb = out.stat().st_size / 1024 / 1024
        log.info("export job=%s uploading %.1f MB", job["id"], size_mb)
        try:
            sb.upload_file(settings.exports_bucket, path, str(out), "video/mp4")
        except SupabaseError as exc:
            # Storage's own words (no secrets in them), so the reason shows in the worker window.
            log.warning("export job=%s upload refused: %s (%.1f MB)", job["id"], exc, size_mb)
            if exc.status_code == 413:
                raise PipelineError("export_too_large", retryable=False) from exc
            raise PipelineError("export_upload_failed", retryable=True) from exc
        except httpx.HTTPError as exc:
            log.warning("export job=%s upload interrupted: %s (%.1f MB)", job["id"], type(exc).__name__, size_mb)
            raise PipelineError("export_upload_failed", retryable=True) from exc
        log.info("export job=%s rendered %s %sp (%d bytes)", job["id"], aspect, resolution, out.stat().st_size)
        return path
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _download_backgrounds(
    sb: SupabaseClient, settings: Settings, project: dict, style: SubtitleStyle, duration_ms: int, workdir: Path
) -> list[BackgroundLayer]:
    """The style is edited in the browser, so a clip is only used if its file is
    verified AND belongs to this project. Missing files are skipped, not fatal."""
    clips = [(clip, clip.window(duration_ms)) for clip in style.backgrounds]
    clips = [(clip, window) for clip, window in clips if window]
    if not clips:
        return []
    ids = sorted({clip.media_id for clip, _ in clips})
    rows = sb.select("background_media", {
        "id": f"in.({','.join(ids)})", "project_id": f"eq.{project['id']}", "status": "eq.verified",
        "select": "id,storage_path,format,kind,duration_ms",
    })
    media = {row["id"]: row for row in rows}
    files: dict[str, Path] = {}
    layers = []
    for clip, (start, end) in clips:
        row = media.get(clip.media_id)
        if not row:
            log.warning("background %s skipped (missing or not this project's)", clip.media_id)
            continue
        if row["id"] not in files:
            local = workdir / f"bg-{len(files)}.{row['format']}"
            try:
                url = sb.create_signed_url(settings.backgrounds_bucket, row["storage_path"], 300)
                sb.download_to(url, str(local), settings.max_background_mb * 1024 * 1024)
            except SupabaseError as exc:
                raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc
            files[row["id"]] = local
        layers.append(BackgroundLayer(files[row["id"]], row["kind"] or "video", start, end, row.get("duration_ms")))
    return layers


def _animated_layer(settings: Settings, style: SubtitleStyle, duration_ms: int) -> list[BackgroundLayer]:
    """The chosen built-in moving background, for the whole song, under the uploaded ones.
    Drawn once on this computer and kept for the next exports."""
    if not style.animated_background:
        return []
    bg = ANIMATED_BACKGROUNDS[style.animated_background]
    try:
        clip = clip_for(bg.id, Path(settings.worker_tmp_dir) / "animated-backgrounds")
    except (subprocess.SubprocessError, OSError, ValueError) as exc:
        log.warning("animated background %s could not be drawn: %s", bg.id, type(exc).__name__)
        raise PipelineError("background_failed", retryable=True) from exc
    return [BackgroundLayer(clip, "video", 0, duration_ms, bg.duration_ms)]


def _video_encoder(settings: Settings) -> str:
    if settings.video_encoder != "auto":
        return settings.video_encoder
    from .gpu import nvenc_available

    return "h264_nvenc" if nvenc_available() else "libx264"
