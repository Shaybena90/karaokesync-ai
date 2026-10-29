"""Measure text exactly like libass lays it out (HarfBuzz shaping, same font
file, same size convention), so the karaoke highlight can be clipped to the
real position of every word."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont

RTL_CHARS = re.compile(r"[֐-ࣿיִ-﷿ﹰ-﻿]")
LTR_CHARS = re.compile(r"[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]")


@dataclass(frozen=True)
class FontInfo:
    path: Path
    family: str
    bold: bool


class TextMeasurer:
    def __init__(self, font_path: Path):
        tt = TTFont(str(font_path), lazy=True)
        os2 = tt["OS/2"]
        # libass (like VSFilter/GDI) sizes fonts so that winAscent + winDescent == font size.
        height_units = os2.usWinAscent + os2.usWinDescent
        if height_units <= 0:
            height_units = tt["hhea"].ascent - tt["hhea"].descent
        self.height_units = height_units
        names = tt["name"]
        family = names.getDebugName(1) or font_path.stem
        subfamily = (names.getDebugName(2) or "").lower()
        self.info = FontInfo(path=font_path, family=family, bold="bold" in subfamily)
        tt.close()
        self._font = hb.Font(hb.Face(hb.Blob.from_file_path(str(font_path))))

    def width(self, text: str, size: float) -> float:
        """Advance width in pixels of `text` at ASS font size `size`."""
        if not text:
            return 0.0
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self._font, buf, {"kern": True, "liga": True})
        units = sum(pos.x_advance for pos in buf.glyph_positions)
        return units * size / self.height_units


@lru_cache(maxsize=8)
def measurer_for(font_path: str) -> TextMeasurer:
    return TextMeasurer(Path(font_path))


def word_direction(text: str) -> str | None:
    """'R', 'L', or None for neutral (digits, punctuation)."""
    if RTL_CHARS.search(text):
        return "R"
    if LTR_CHARS.search(text):
        return "L"
    return None


def resolve_directions(words: list[str], base_rtl: bool) -> list[str]:
    """'R'/'L' per word. Neutral words (numbers, punctuation) take the direction
    of the previous strong word (like Unicode bidi rule W7 for numbers after
    Latin text), or the line direction at the start."""
    resolved: list[str] = []
    last = "R" if base_rtl else "L"
    for w in words:
        last = word_direction(w) or last
        resolved.append(last)
    return resolved


def visual_order(words: list[str], base_rtl: bool) -> list[int]:
    """Word-level bidi: indexes of `words` from the visual LEFT to RIGHT."""
    resolved = resolve_directions(words, base_rtl)
    # Lay out in base order, then reverse every run that goes against it.
    order = list(reversed(range(len(words)))) if base_rtl else list(range(len(words)))
    against = "L" if base_rtl else "R"
    i = 0
    while i < len(order):
        j = i
        while j < len(order) and resolved[order[j]] == against:
            j += 1
        if j - i > 1:
            order[i:j] = reversed(order[i:j])
        i = max(j, i + 1)
    return order
