"""Export endpoints.

SRT / LRC / ASS are small text files generated on the fly. MP4 rendering is
heavy, so it is queued as an export job for the worker; the finished file is
stored in the private "exports" bucket and downloaded with a signed URL.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from ..config import Settings
from ..exports.ass import build_ass
from ..exports.measure import measurer_for
from ..export_parts import part_paths
from ..exports.opening import PREVIEW_RESOLUTION, OpeningOptions
from ..exports.text_formats import to_lrc, to_srt
from ..exports.video import RESOLUTIONS, UHD_RESOLUTION, canvas_for
from ..fonts import ensure_font
from ..lyrics_data import load_lyrics
from ..animated_backgrounds import BACKGROUNDS as ANIMATED_BACKGROUNDS
from ..styles import parse_style
from ..supabase_client import AuthUser, SupabaseClient, SupabaseError
from .common import iso, owned_project
from .deps import get_supabase, rate_limited_user, settings_dep
from .instrumental import latest_instrumental

ACTIVE = "(queued,running)"
MAX_ACTIVE_EXPORTS_PER_USER = 2

MEDIA_TYPES = {
    "srt": "application/x-subrip; charset=utf-8",
    "lrc": "text/plain; charset=utf-8",
    "ass": "text/x-ssa; charset=utf-8",
}


class ExportRequest(BaseModel):
    format: Literal["mp4"] = "mp4"
    aspect: Literal["16:9", "9:16", "1:1"] = "16:9"
    resolution: Literal[720, 1080, 2160] = 1080   # 2160 = 4K
    # "instrumental" = the melody-only track (the singer's voice removed)
    audio: Literal["original", "instrumental"] = "original"
    # Opening: the KaraokeSync intro, a title card (song + singer) and the transition into the karaoke
    opening: OpeningOptions | None = None
    # A quick look before the real export: the opening and the song's first seconds, in 480p.
    preview: bool = False
    # "high": a bigger file (stored in parts) so 1080p stays sharp even for long songs
    quality: Literal["standard", "high"] = "standard"


# Workers older than this cannot make a video opening or a preview (their version is
# what they report in the `workers` table; see worker.runner.WORKER_VERSION).
MIN_OPENING_WORKER = "2026-11-14.2"   # the intro, transitions, previews
MIN_OWN_INTRO_WORKER = "2026-11-15.2"  # the user's own opening clip
MIN_UHD_WORKER = "2026-11-16.1"       # 4K videos and the 4K backgrounds
MIN_UHD_TITLE_WORKER = "2026-11-16.2"  # the title designs with a 4K backdrop
MIN_TITLE_WORKER = "2026-11-15.5"     # the title card as it is now: song on top, singer under it, the user's sizes


def _worker_too_old(sb: SupabaseClient, needed: str) -> bool:
    """True when a processing computer that is online is older than `needed`:
    any online worker may take the job, and an old one would make a video that
    is not what was chosen (e.g. another title design). Unknown (no workers
    table yet, nobody online) is not "too old": the job waits."""
    from .worker_status import ONLINE_SECONDS, _parse

    try:
        rows = sb.select("workers", {"select": "version,last_seen,activity"})
    except SupabaseError:
        return False
    now = datetime.now(timezone.utc)
    online = [w for w in rows if w.get("activity") != "stopped" and w.get("last_seen")
              and now - _parse(w["last_seen"]) < timedelta(seconds=ONLINE_SECONDS)]
    return any(str(w.get("version") or "").split(" ")[0] < needed for w in online)


def _require_lyrics(sb: SupabaseClient, project: dict) -> list[dict]:
    if project["status"] not in ("ready", "expired"):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="not_ready")
    lines = load_lyrics(sb, project["id"])
    if not lines:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="no_lyrics")
    return lines


def _download_name(title: str, ext: str) -> str:
    """RFC 6266 header with an ASCII fallback and the real (e.g. Hebrew) name."""
    clean = re.sub(r'[\\/:*?"<>|\r\n]+', " ", title).strip()[:80] or "karaoke"
    ascii_name = re.sub(r"[^A-Za-z0-9 ._-]", "", clean).strip() or "karaoke"
    return f"attachment; filename=\"{ascii_name}.{ext}\"; filename*=UTF-8''{quote(clean)}.{ext}"


def exports_router() -> APIRouter:
    router = APIRouter()

    @router.get("/projects/{project_id}/export/{fmt}")
    def export_text(
        project_id: str,
        fmt: Literal["srt", "lrc", "ass"],
        aspect: Literal["16:9", "9:16", "1:1"] = Query("16:9"),
        resolution: int = Query(1080),
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
    ) -> Response:
        if resolution not in RESOLUTIONS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_resolution")
        project = owned_project(sb, project_id, user)
        lines = _require_lyrics(sb, project)
        language = project.get("language")
        if fmt == "srt":
            body = to_srt(lines, language)
        elif fmt == "lrc":
            body = to_lrc(lines, language, project["title"])
        else:
            style = parse_style(project.get("style"))
            try:
                font = ensure_font(style.font)
            except RuntimeError as exc:
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="font_unavailable") from exc
            body = build_ass(
                lines, style, language, canvas_for(aspect, resolution), measurer_for(str(font)),
                title=project["title"], embed_font=True,
            )
        # UTF-8 BOM helps Windows tools (Notepad, older players) detect Hebrew text.
        return Response(
            content="﻿" + body,
            media_type=MEDIA_TYPES[fmt],
            headers={"Content-Disposition": _download_name(project["title"], fmt), "Cache-Control": "no-store"},
        )

    @router.post("/projects/{project_id}/exports", status_code=201)
    def create_export(
        project_id: str,
        body: ExportRequest,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        project = owned_project(sb, project_id, user)
        _require_lyrics(sb, project)
        audio = sb.select(
            "audio_files",
            {"project_id": f"eq.{project_id}", "status": "eq.verified", "select": "id", "limit": "1"},
        )
        if not audio:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="audio_missing")
        if body.audio == "instrumental":
            track = latest_instrumental(sb, project_id, audio[0]["id"])
            if not track or track["status"] != "succeeded" or not track.get("output_path"):
                raise HTTPException(status.HTTP_409_CONFLICT, detail="instrumental_not_ready")

        animated = parse_style(project.get("style")).animated_background
        needed = max(
            MIN_OPENING_WORKER if body.preview or (body.opening and body.opening.active) else "",
            MIN_TITLE_WORKER if body.opening and body.opening.active and body.opening.title else "",
            MIN_OWN_INTRO_WORKER if body.opening and body.opening.intro and body.opening.intro_media_id else "",
            MIN_UHD_WORKER if body.resolution == UHD_RESOLUTION or (animated and ANIMATED_BACKGROUNDS[animated].uhd) else "",
            MIN_UHD_TITLE_WORKER if body.opening and body.opening.title and body.opening.theme.uhd else "",
        )
        if body.opening and body.opening.intro and body.opening.intro_media_id:
            own = sb.select("background_media", {"id": f"eq.{body.opening.intro_media_id}", "user_id": f"eq.{user.id}",
                                                 "status": "eq.verified", "select": "id"})
            if not own:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="intro_missing")
        if needed and _worker_too_old(sb, needed):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="worker_outdated")
        existing = sb.select("export_jobs", {"project_id": f"eq.{project_id}", "status": f"in.{ACTIVE}", "select": "*"})
        if existing:
            return existing[0]  # idempotent: one active render per project
        since = iso(datetime.now(timezone.utc) - timedelta(days=1))
        # Previews have their own (larger) daily allowance, so trying things out does not use up exports.
        kind = {"options->>preview": "eq.true"} if body.preview else {"options->>preview": "is.null"}
        limit = settings.max_previews_per_day if body.preview else settings.max_exports_per_day
        if sb.count("export_jobs", {"user_id": f"eq.{user.id}", "created_at": f"gte.{since}", **kind}) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="daily_preview_limit" if body.preview else "daily_export_limit")
        if sb.count("export_jobs", {"user_id": f"eq.{user.id}", "status": f"in.{ACTIVE}"}) >= MAX_ACTIVE_EXPORTS_PER_USER:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="too_many_active_exports")

        options = {
            "aspect": body.aspect,
            "resolution": body.resolution,
            "audio": body.audio,
            "opening": body.opening.model_dump() if body.opening and body.opening.active else None,
            **({"preview": True, "resolution": PREVIEW_RESOLUTION} if body.preview else {}),
            **({"quality": "high"} if body.quality == "high" and not body.preview else {}),
            # Snapshot: later style edits do not change a render that is already queued.
            "style": parse_style(project.get("style")).model_dump(),
        }
        try:
            return sb.insert(
                "export_jobs",
                {"project_id": project_id, "user_id": user.id, "format": body.format, "options": options},
            )
        except SupabaseError as exc:
            if exc.code == "23505":
                again = sb.select("export_jobs", {"project_id": f"eq.{project_id}", "status": f"in.{ACTIVE}", "select": "*"})
                if again:
                    return again[0]
            raise

    @router.delete("/exports/{export_id}", status_code=204)
    def delete_export(
        export_id: str,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> None:
        try:
            uuid.UUID(export_id)
        except ValueError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="export_not_found") from exc
        rows = sb.select("export_jobs", {"id": f"eq.{export_id}", "user_id": f"eq.{user.id}", "select": "*"})
        if not rows:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="export_not_found")
        if rows[0].get("output_path"):
            sb.remove_objects(settings.exports_bucket, part_paths(rows[0]["output_path"]))
        sb.delete("export_jobs", {"id": f"eq.{export_id}", "user_id": f"eq.{user.id}"})

    return router
