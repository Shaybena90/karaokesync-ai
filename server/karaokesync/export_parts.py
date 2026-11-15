"""Big exported videos, stored in parts.

Supabase's free plan accepts files up to 50 MB. A "high quality" video can be
bigger, so it is stored as several parts of up to 45 MB ("<path>.part0",
"<path>.part1", ...) and its recorded path says how many ("<path>.parts3").
The browser downloads the parts and joins them back into one MP4 (plain byte
concatenation: the parts are slices of the same file).
"""

from __future__ import annotations

import re
from pathlib import Path

from .supabase_client import SupabaseClient

PART_BYTES = 45 * 1024 * 1024
_PARTS = re.compile(r"^(.*)\.parts(\d+)$")


def part_paths(output_path: str) -> list[str]:
    """Every stored object of an export (one, or its parts)."""
    m = _PARTS.match(output_path)
    if not m:
        return [output_path]
    return [f"{m.group(1)}.part{k}" for k in range(int(m.group(2)))]


def upload_in_parts(sb: SupabaseClient, bucket: str, path: str, local: Path, content_type: str = "video/mp4") -> str:
    """Upload the file whole when it fits in one part, else in parts. Returns the path to record."""
    size = local.stat().st_size
    if size <= PART_BYTES:
        sb.upload_file(bucket, path, str(local), content_type)
        return path
    count = (size + PART_BYTES - 1) // PART_BYTES
    with open(local, "rb") as src:
        for k in range(count):
            piece = local.with_name(f"{local.name}.part{k}")
            piece.write_bytes(src.read(PART_BYTES))
            try:
                sb.upload_file(bucket, f"{path}.part{k}", str(piece), "application/octet-stream")
            finally:
                piece.unlink(missing_ok=True)
    return f"{path}.parts{count}"
