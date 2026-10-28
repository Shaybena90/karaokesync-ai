"""Verify that an uploaded file really is MP3 / WAV / M4A audio.

Two independent checks are applied — the file extension or the browser's MIME
type are never trusted on their own:
  1. "magic bytes" at the start of the file
  2. ffprobe, which parses the container and reports codecs and duration
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass

ALLOWED_EXTENSIONS = {"mp3": "mp3", "wav": "wav", "m4a": "m4a"}
ALLOWED_MIME_TYPES = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave",
    "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac",
}
# The browser sometimes sends an empty or generic type; the real check is server-side.
TOLERATED_MIME_TYPES = {"", "application/octet-stream"}

STORAGE_CONTENT_TYPE = {"mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4"}

_M4A_BRANDS = {b"M4A ", b"M4B ", b"mp42", b"mp41", b"isom", b"iso2", b"dash", b"MSNV", b"M4V "}

SNIFF_BYTES = 64


class AudioValidationError(Exception):
    """Raised with a machine readable code that the UI translates."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def extension_of(file_name: str) -> str | None:
    if "." not in file_name:
        return None
    return ALLOWED_EXTENSIONS.get(file_name.rsplit(".", 1)[1].lower())


def sniff_format(head: bytes) -> str | None:
    """Detect the container from the first bytes of the file."""
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    if len(head) >= 12 and head[4:8] == b"ftyp" and head[8:12] in _M4A_BRANDS:
        return "m4a"
    if head[:3] == b"ID3":
        return "mp3"
    # MPEG audio frame sync: 11 set bits, layer bits != 00 (reserved)
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0 and (head[1] & 0x06) != 0:
        return "mp3"
    return None


@dataclass(frozen=True)
class ProbeResult:
    format: str
    duration_ms: int
    codec: str


def _ffprobe_binary() -> str:
    path = shutil.which("ffprobe")
    if not path:
        raise RuntimeError("ffprobe was not found. Install FFmpeg and make sure it is on PATH.")
    return path


def probe(source: str, timeout: float = 60.0) -> ProbeResult:
    """Run ffprobe on a local path or a (signed) URL."""
    cmd = [
        _ffprobe_binary(), "-v", "error",
        "-show_entries", "format=format_name,duration:stream=codec_type,codec_name:stream_disposition=attached_pic",
        "-of", "json", source,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise AudioValidationError("probe_timeout") from exc
    if out.returncode != 0:
        raise AudioValidationError("not_audio")
    try:
        data = json.loads(out.stdout or b"{}")
    except json.JSONDecodeError as exc:
        raise AudioValidationError("not_audio") from exc

    fmt_names = set((data.get("format", {}).get("format_name") or "").split(","))
    streams = data.get("streams", [])
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    real_video = [
        s for s in streams
        if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")
    ]
    if not audio or real_video:
        raise AudioValidationError("not_audio")

    codec = audio[0].get("codec_name", "")
    if "mp3" in fmt_names and codec == "mp3":
        fmt = "mp3"
    elif "wav" in fmt_names:
        fmt = "wav"
    elif "m4a" in fmt_names or "mp4" in fmt_names:
        if codec not in {"aac", "alac", "mp3"}:
            raise AudioValidationError("unsupported_codec")
        fmt = "m4a"
    else:
        raise AudioValidationError("unsupported_format")

    try:
        duration_ms = int(float(data["format"]["duration"]) * 1000)
    except (KeyError, TypeError, ValueError) as exc:
        raise AudioValidationError("unknown_duration") from exc
    if duration_ms <= 0:
        raise AudioValidationError("unknown_duration")
    return ProbeResult(format=fmt, duration_ms=duration_ms, codec=codec)


def verify_audio(head: bytes, source: str, max_duration_ms: int) -> ProbeResult:
    """Full verification: magic bytes must agree with what ffprobe finds."""
    sniffed = sniff_format(head)
    if sniffed is None:
        raise AudioValidationError("not_audio")
    result = probe(source)
    if result.format != sniffed:
        raise AudioValidationError("format_mismatch")
    if result.duration_ms > max_duration_ms:
        raise AudioValidationError("too_long")
    return result
