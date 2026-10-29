"""Font files for subtitle rendering.

Fonts are downloaded once from Google Fonts (static TTF, SIL Open Font License)
into a local cache folder. If that is not possible, a system font with Hebrew
support is used instead so exports still work.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import httpx

from .config import get_settings
from .styles import FONTS

log = logging.getLogger("karaokesync.fonts")

_CSS_URL = "https://fonts.googleapis.com/css2?family={family}:wght@{weight}"
# An old user agent makes Google Fonts serve plain TTF instead of WOFF2.
_UA = "Mozilla/4.0"  # (an "MSIE" agent would get EOT files instead)
_ALLOWED_HOST = "https://fonts.gstatic.com/"

SYSTEM_FALLBACKS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def fonts_dir() -> Path:
    path = Path(get_settings().fonts_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def font_file_name(family: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", family) + ".ttf"


def ensure_font(family: str) -> Path:
    """Return a TTF path for the family, downloading it if needed."""
    if family not in FONTS:
        family = "Heebo"
    target = fonts_dir() / font_file_name(family)
    if target.exists() and target.stat().st_size > 1000:
        return target
    try:
        css = httpx.get(
            _CSS_URL.format(family=family.replace(" ", "+"), weight=FONTS[family]),
            headers={"User-Agent": _UA}, timeout=20,
        )
        css.raise_for_status()
        match = re.search(r"url\((https://[^)]+\.ttf)\)", css.text)
        if not match or not match.group(1).startswith(_ALLOWED_HOST):
            raise RuntimeError("no TTF in Google Fonts response")
        data = httpx.get(match.group(1), timeout=60).content
        if data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
            raise RuntimeError("downloaded file is not a font")
        tmp = target.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(target)
        log.info("downloaded font %s", family)
        return target
    except Exception as exc:  # network blocked, offline, ...
        log.warning("font %s unavailable (%s: %s); using a system font", family, type(exc).__name__, exc)
        for candidate in SYSTEM_FALLBACKS:
            if Path(candidate).exists():
                return Path(candidate)
        raise RuntimeError("font_unavailable") from exc
