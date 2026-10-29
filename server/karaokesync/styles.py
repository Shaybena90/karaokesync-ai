"""Subtitle style: one definition used by the player preview (web) and the
video/ASS export (here). The web mirror lives in web/src/lib/subtitleStyle.ts —
keep both in sync (tests check the presets match)."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

# Fonts offered to users: all support Hebrew + Latin and are free (SIL OFL)
# on Google Fonts, so the browser and the video renderer use the same files.
FONTS: dict[str, int] = {  # family -> weight used
    "Heebo": 700,
    "Rubik": 700,
    "Assistant": 700,
    "Secular One": 400,
    "Varela Round": 400,
    "Frank Ruhl Libre": 700,
}

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

FontName = Literal["Heebo", "Rubik", "Assistant", "Secular One", "Varela Round", "Frank Ruhl Libre"]


class SubtitleStyle(BaseModel):
    preset: Literal["classic", "neon", "tiktok", "custom"] = "classic"
    font: FontName = "Heebo"
    size: int = Field(100, ge=50, le=160)  # percent of the base size
    text_color: str = "#ffffff"
    highlight_color: str = "#38bdf8"
    outline_color: str = "#000000"
    outline: int = Field(3, ge=0, le=10)
    shadow: int = Field(2, ge=0, le=10)
    glow: bool = False
    position: Literal["top", "center", "bottom"] = "bottom"
    text_box: bool = False
    background_color: str = "#0b1026"
    background_color2: str = "#3b0764"
    animation: Literal["fill", "word", "none"] = "fill"
    show_next_line: bool = True

    @field_validator("text_color", "highlight_color", "outline_color", "background_color", "background_color2")
    @classmethod
    def _hex(cls, v: str) -> str:
        if not HEX.match(v):
            raise ValueError("expected #rrggbb")
        return v.lower()


PRESETS: dict[str, SubtitleStyle] = {
    "classic": SubtitleStyle(),
    "neon": SubtitleStyle(
        preset="neon", font="Rubik", size=105, text_color="#f5d0fe", highlight_color="#22d3ee",
        outline_color="#a21caf", outline=2, shadow=0, glow=True, position="center",
        background_color="#05010d", background_color2="#1e0838", animation="fill",
    ),
    "tiktok": SubtitleStyle(
        preset="tiktok", font="Heebo", size=125, text_color="#ffffff", highlight_color="#facc15",
        outline_color="#000000", outline=6, shadow=0, position="center", background_color="#111111",
        background_color2="#111111", animation="word", show_next_line=False,
    ),
}


def parse_style(raw: Any) -> SubtitleStyle:
    """Parse a stored style; unknown/invalid input falls back to the defaults
    (or to the named preset) instead of failing an export."""
    if not isinstance(raw, dict) or not raw:
        return SubtitleStyle()
    try:
        return SubtitleStyle.model_validate(raw)
    except ValidationError:
        base = PRESETS.get(str(raw.get("preset")), SubtitleStyle())
        valid = {}
        for key, value in raw.items():
            if key in SubtitleStyle.model_fields:
                try:
                    SubtitleStyle.model_validate({**base.model_dump(), key: value})
                    valid[key] = value
                except ValidationError:
                    pass
        return SubtitleStyle.model_validate({**base.model_dump(), **valid})
