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
from ..export_parts import upload_in_parts
from ..exports.ass import build_ass
from ..exports.measure import measurer_for
from ..exports.opening import (
    INTRO_MS, PREVIEW_RESOLUTION, PREVIEW_SONG_MS, CustomIntro, OpeningOptions, backdrop_file, custom_intro_length, opening_files,
    plan_opening, title_ass,
)
from ..exports.video import ASPECTS, RESOLUTIONS, UHD_RESOLUTION, BackgroundLayer, best_resolution, canvas_for, render_mp4
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
        duration_ms = int(audio.get("duration_ms") or (max(l["end_ms"] for l in lines) + 3000))
        if preview:
            duration_ms = min(duration_ms, PREVIEW_SONG_MS)
        # The file must fit the storage limit: a long song gets 720p, which looks
        # sharper at the same size than a starved 1080p.
        lead_ms = plan_opening(opening, INTRO_MS).karaoke_start_ms if opening.active else 0
        high = options.get("quality") == "high" and not preview
        limit_mb = (settings.uhd_export_mb if resolution == UHD_RESOLUTION
                    else settings.high_quality_export_mb if high else settings.max_export_mb)
        chosen = best_resolution(resolution, duration_ms + lead_ms, limit_mb * 1024 * 1024)
        if chosen != resolution:
            log.info("export job=%s %sp -> %sp to keep the picture sharp within %s MB", job["id"], resolution, chosen, limit_mb)
            resolution = chosen
        canvas = canvas_for(aspect, resolution)
        ass_text = build_ass(lines, style, project.get("language"), canvas, measurer_for(str(font)), title=project["title"])
        report(4)
        title_subs, extra_fonts, custom_intro, backdrop = None, [], None, None
        if opening.active:
            opening_files(opening, aspect)
            if opening.intro and opening.intro_media_id:
                custom_intro = _download_custom_intro(sb, settings, project, opening.intro_media_id, workdir)
            log.info("export job=%s opening: intro=%s title=%s transition=%s", job["id"],
                     ("own" if custom_intro else "karaokesync") if opening.intro else "none",
                     f"{opening.title_theme} (singer {opening.title.artist_size}%, song {opening.title.song_size}%)"
                     if opening.title else "none", opening.transition)
            if opening.title and opening.theme.uhd:
                backdrop = backdrop_file(opening.theme, resolution, Path(settings.worker_tmp_dir) / "animated-backgrounds",
                                         settings.assets_4k_url)
            if opening.title:
                try:
                    title_font, artist_font = ensure_font(opening.theme.name_font), ensure_font(opening.theme.song_font)
                except RuntimeError as exc:
                    raise PipelineError("font_unavailable", retryable=True) from exc
                extra_fonts = [title_font, artist_font]
                title_subs = title_ass(opening.title, canvas, measurer_for(str(title_font)), measurer_for(str(artist_font)),
                                       project.get("language"), opening.theme)
        layers = _animated_layer(settings, style, duration_ms, resolution) + _download_backgrounds(
            sb, settings, project, style, duration_ms, workdir
        )
        report(6)
        out = render_mp4(
            workdir, source, ass_text, font, style, canvas, duration_ms,
            on_progress=lambda frac: report(6 + int(frac * 87)),
            backgrounds=layers,
            max_bytes=limit_mb * 1024 * 1024,
            encoder=_video_encoder(settings),
            opening=opening if opening.active else None,
            aspect=aspect,
            title_subs=title_subs,
            extra_fonts=extra_fonts,
            custom_intro=custom_intro,
            backdrop=backdrop,
            timeout_s=4 * 3600 if resolution == UHD_RESOLUTION else 3600,   # 4K takes much longer
        )

        report(95)
        path = f"{project['user_id']}/{project['id']}/{job['id']}{'-preview' if preview else ''}.mp4"
        size_mb = out.stat().st_size / 1024 / 1024
        log.info("export job=%s uploading %.1f MB", job["id"], size_mb)
        try:
            path = upload_in_parts(sb, settings.exports_bucket, path, out)
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


def _download_custom_intro(sb: SupabaseClient, settings: Settings, project: dict, media_id: str, workdir: Path) -> CustomIntro:
    """The user's own opening clip: only a verified file of the same user."""
    rows = sb.select("background_media", {
        "id": f"eq.{media_id}", "user_id": f"eq.{project['user_id']}", "status": "eq.verified",
        "select": "storage_path,format,kind,duration_ms",
    })
    if not rows:
        raise PipelineError("intro_missing", retryable=False)
    row = rows[0]
    local = workdir / f"intro-own.{row['format']}"
    try:
        url = sb.create_signed_url(settings.backgrounds_bucket, row["storage_path"], 300)
        sb.download_to(url, str(local), settings.max_background_mb * 1024 * 1024)
    except SupabaseError as exc:
        raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0",
                            str(local)], capture_output=True, text=True, timeout=60, check=False)
    kind = row.get("kind") or "video"
    return CustomIntro(local, custom_intro_length(kind, row.get("duration_ms")), kind == "image",
                       has_audio=bool(probe.stdout.strip()) and row["format"] != "gif")


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


def _animated_layer(settings: Settings, style: SubtitleStyle, duration_ms: int,
                    resolution: int = 1080) -> list[BackgroundLayer]:
    """The chosen built-in moving background, for the whole song, under the uploaded ones.
    Drawn once on this computer and kept for the next exports."""
    if not style.animated_background:
        return []
    bg = ANIMATED_BACKGROUNDS[style.animated_background]
    try:
        clip = clip_for(bg.id, Path(settings.worker_tmp_dir) / "animated-backgrounds", resolution=resolution,
                        assets_url=settings.assets_4k_url)
    except PipelineError:
        raise   # a 4K file that could not be downloaded
    except (subprocess.SubprocessError, OSError, ValueError) as exc:
        log.warning("animated background %s could not be drawn: %s", bg.id, type(exc).__name__)
        raise PipelineError("background_failed", retryable=True) from exc
    return [BackgroundLayer(clip, "video", 0, duration_ms, bg.duration_ms)]


def _video_encoder(settings: Settings) -> str:
    if settings.video_encoder != "auto":
        return settings.video_encoder
    from .gpu import nvenc_available

    return "h264_nvenc" if nvenc_available() else "libx264"
