"""Verify that an uploaded video background really is a GIF / video / image.

Same approach as audio_validation: the extension and the browser's MIME type
are never trusted. The first bytes must match the extension, and ffprobe
must find a single picture stream with a supported codec and sane size.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass

from .audio_validation import _ffprobe_binary

EXTENSIONS = {"gif": "gif", "mp4": "mp4", "m4v": "mp4", "webm": "webm", "mov": "mov", "png": "png", "jpg": "jpg",
              "jpeg": "jpg"}
CONTENT_TYPES = {"gif": "image/gif", "mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
                 "png": "image/png", "jpg": "image/jpeg"}
STILL_FORMATS = {"png", "jpg"}
VIDEO_CODECS = {"h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "gif", "png", "mjpeg"}
MAX_SIDE = 4096
SNIFF_BYTES = 32


class MediaValidationError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def media_format_of(file_name: str) -> str | None:
    if "." not in file_name:
        return None
    return EXTENSIONS.get(file_name.rsplit(".", 1)[1].lower())


def sniff_media(head: bytes) -> set[str]:
    """Formats the first bytes are compatible with (MP4 and MOV share a container)."""
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return {"gif"}
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return {"png"}
    if head[:3] == b"\xff\xd8\xff":
        return {"jpg"}
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return {"webm"}
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return {"mp4", "mov"}
    return set()


@dataclass(frozen=True)
class MediaInfo:
    kind: str  # "image" | "video"
    duration_ms: int | None
    width: int
    height: int


def probe_media(source: str, fmt: str, timeout: float = 60.0) -> MediaInfo:
    cmd = [
        _ffprobe_binary(), "-v", "error",
        "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height",
        "-of", "json", source,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise MediaValidationError("probe_timeout") from exc
    try:
        data = json.loads(out.stdout or b"{}") if out.returncode == 0 else {}
    except json.JSONDecodeError:
        data = {}
    pictures = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
    if not pictures:
        raise MediaValidationError("not_media")
    stream = pictures[0]
    if stream.get("codec_name") not in VIDEO_CODECS:
        raise MediaValidationError("unsupported_media")
    width, height = int(stream.get("width") or 0), int(stream.get("height") or 0)
    if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE):
        raise MediaValidationError("media_dimensions")
    if fmt in STILL_FORMATS:
        return MediaInfo("image", None, width, height)
    try:
        duration_ms = int(float(data["format"]["duration"]) * 1000)
    except (KeyError, TypeError, ValueError):
        duration_ms = 0
    if duration_ms <= 0:
        # A single-frame GIF has no duration: it is a still picture.
        if fmt == "gif":
            return MediaInfo("image", None, width, height)
        raise MediaValidationError("unknown_duration")
    return MediaInfo("video", duration_ms, width, height)


def verify_media(head: bytes, source: str, fmt: str, max_duration_ms: int) -> MediaInfo:
    if fmt not in sniff_media(head):
        raise MediaValidationError("format_mismatch" if sniff_media(head) else "not_media")
    info = probe_media(source, fmt)
    if info.duration_ms is not None and info.duration_ms > max_duration_ms:
        raise MediaValidationError("media_too_long")
    return info
