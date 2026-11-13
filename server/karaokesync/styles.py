"""Subtitle style: one definition used by the player preview (web) and the
video/ASS export (here). The web mirror lives in web/src/lib/subtitleStyle.ts —
keep both in sync (tests check the presets match)."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .animated_backgrounds import BACKGROUNDS as ANIMATED_BACKGROUNDS

# Fonts offered to users: all support Hebrew + Latin and are free (SIL OFL)
# on Google Fonts, so the browser and the video renderer use the same files.
FONTS: dict[str, int] = {  # family -> weight used
    "Heebo": 700,
    "Rubik": 700,
    "Assistant": 700,
    "Secular One": 400,
    "Varela Round": 400,
    "Frank Ruhl Libre": 700,
    "Alef": 700,
    "Amatic SC": 700,
    "Bellefair": 400,
    "Bona Nova": 700,
    "David Libre": 700,
    "Fredoka": 600,
    "IBM Plex Sans Hebrew": 700,
    "Karantina": 700,
    "Miriam Libre": 700,
    "Noto Sans Hebrew": 700,
    "Noto Serif Hebrew": 700,
    "Playpen Sans Hebrew": 700,
    "Solitreo": 400,
    "Suez One": 400,
    "Tinos": 700,
}

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MAX_BACKGROUNDS = 10


class BackgroundClip(BaseModel):
    """A background file shown behind the lyrics, looping, from start_ms to end_ms
    (None = from the beginning / to the end of the song). Later clips are on top."""

    media_id: str
    start_ms: int | None = Field(None, ge=0)
    end_ms: int | None = Field(None, ge=0)

    @field_validator("media_id")
    @classmethod
    def _uuid(cls, v: str) -> str:
        if not UUID.match(v.lower()):
            raise ValueError("expected a uuid")
        return v.lower()

    def window(self, song_ms: int) -> tuple[int, int] | None:
        """[start, end) in song time, or None when the clip covers nothing."""
        start = self.start_ms or 0
        end = song_ms if self.end_ms is None else min(self.end_ms, song_ms)
        return (start, end) if end > start else None


FontName = Literal[
    "Heebo", "Rubik", "Assistant", "Secular One", "Varela Round", "Frank Ruhl Libre",
    "Alef",
    "Amatic SC",
    "Bellefair",
    "Bona Nova",
    "David Libre",
    "Fredoka",
    "IBM Plex Sans Hebrew",
    "Karantina",
    "Miriam Libre",
    "Noto Sans Hebrew",
    "Noto Serif Hebrew",
    "Playpen Sans Hebrew",
    "Solitreo",
    "Suez One",
    "Tinos",
]

# What counts down before singing starts (after the intro or a long break).
Countdown = Literal["none", "dots", "numbers", "zoom", "bar", "pulse"]

# How a line comes on screen (same look in the player and in the video).
Entrance = Literal[
    "none",
    "fade",
    "rise",
    "drop",
    "slide",
    "zoom_in",
    "zoom_out",
    "pop",
    "blur",
    "swing",
    "flip",
    "spread",
    "wipe",
]


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
    entrance: Entrance = "rise"
    countdown: Countdown = "dots"
    show_next_line: bool = True
    backgrounds: list[BackgroundClip] = Field(default_factory=list)
    # A built-in moving background (animated_backgrounds.py) for the whole song,
    # under any uploaded backgrounds. None = the colour gradient only.
    animated_background: str | None = None

    @field_validator("animated_background", mode="before")
    @classmethod
    def _animated(cls, v: Any) -> str | None:
        return v if isinstance(v, str) and v in ANIMATED_BACKGROUNDS else None

    @field_validator("backgrounds", mode="before")
    @classmethod
    def _clips(cls, v: Any) -> list[BackgroundClip]:
        """Keep the valid clips, drop the rest (the style is edited in the browser)."""
        if not isinstance(v, list):
            return []
        clips = []
        for item in v[:MAX_BACKGROUNDS]:
            try:
                clips.append(BackgroundClip.model_validate(item))
            except ValidationError:
                continue
        return clips

    @field_validator("text_color", "highlight_color", "outline_color", "background_color", "background_color2")
    @classmethod
    def _hex(cls, v: str) -> str:
        if not HEX.match(v):
            raise ValueError("expected #rrggbb")
        return v.lower()


PRESETS: dict[str, SubtitleStyle] = {
    "classic": SubtitleStyle(),
    "neon": SubtitleStyle(
        preset="neon", entrance="blur", countdown="pulse", font="Rubik", size=105, text_color="#f5d0fe", highlight_color="#22d3ee",
        outline_color="#a21caf", outline=2, shadow=0, glow=True, position="center",
        background_color="#05010d", background_color2="#1e0838", animation="fill",
    ),
    "tiktok": SubtitleStyle(
        preset="tiktok", entrance="pop", countdown="numbers", font="Heebo", size=125, text_color="#ffffff", highlight_color="#facc15",
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
