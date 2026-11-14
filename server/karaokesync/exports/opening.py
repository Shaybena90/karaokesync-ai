"""The opening of an exported video: the KaraokeSync intro clip, a luxurious 3D
title card with the song and the singer, and a transition into the karaoke.

    [intro 8 s] ~transition~ [title 6.5 s] ~transition~ [karaoke ...]

The intro clip and the title backdrop are pre-drawn 3D clips committed to the
repository (web/public/intro, made by web/scripts/render-3d-backgrounds.mjs).
The title itself is drawn per song by libass, in the intro's colours: the
singer in white 3D letters with a purple depth, the song under it. Transitions
are FFmpeg's xfade; the last one blends into the first moment of the karaoke,
so the karaoke parts themselves never need to be encoded twice.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from ..worker.errors import PipelineError
from .ass import RLM, LRM, Canvas, ass_color, escape_text, is_rtl, tag_color, text_3d_layers
from .measure import TextMeasurer

INTRO_DIR = Path(__file__).resolve().parents[3] / "web" / "public" / "intro"
INTRO_FILES = {"16:9": "intro.mp4", "9:16": "intro-9x16.mp4", "1:1": "intro-1x1.mp4"}
BACKDROP_FILE = "title-backdrop.mp4"
INTRO_MS = 8000
TITLE_MS = 6500
TRANSITION_MS = 1800   # long, soft transitions
CUT_MS = 34  # "no transition": a one-frame blend, i.e. a cut
# A preview video: the opening + the start of the song, small and quick to make.
PREVIEW_SONG_MS = 20_000
PREVIEW_RESOLUTION = 480

# Our name -> FFmpeg xfade transition (all exist since FFmpeg 5).
TRANSITIONS: dict[str, str] = {
    "none": "fade",
    "fade": "fade",
    "fadeblack": "fadeblack",
    "fadewhite": "fadewhite",
    "dissolve": "dissolve",
    "circleopen": "circleopen",
    "circleclose": "circleclose",
    "radial": "radial",
    "pixelize": "pixelize",
    "zoomin": "zoomin",
    "slideleft": "slideleft",
    "smoothleft": "smoothleft",
    "hblur": "hblur",
    "diagtl": "diagtl",
    "squeezeh": "squeezeh",
    "horzopen": "horzopen",
}
Transition = Literal[
    "none", "fade", "fadeblack", "fadewhite", "dissolve", "circleopen", "circleclose", "radial", "pixelize",
    "zoomin", "slideleft", "smoothleft", "hblur", "diagtl", "squeezeh", "horzopen",
]

NAME_FONT = "Rubik"      # the singer (big): the same letters as "Karaoke Sync" in the intro
SONG_FONT = "Heebo"      # the song, under it
# The colours of the intro (the logo's purple and blue), so the title follows it smoothly.
FACE_TOP = "#ffffff"
FACE_LOW = "#e4d9ff"
EDGE = "#c4b5fd"
DEPTH = "#8b5cf6"
SONG_COLOR = "#cfd8ff"
GLOW_PURPLE = "#a855f7"
GLOW_BLUE = "#3b82f6"
TITLE_DELAY_MS = 900     # the words come in once the transition has mostly shown the card

class TitleCard(BaseModel):
    song: str = Field(min_length=1, max_length=120)
    artist: str = Field(default="", max_length=120)

    @field_validator("song", "artist")
    @classmethod
    def _one_line(cls, v: str) -> str:
        return " ".join(v.split())


class OpeningOptions(BaseModel):
    """What the user chose before the export (all optional)."""

    intro: bool = False
    title: TitleCard | None = None
    transition: Transition = "fade"

    @property
    def active(self) -> bool:
        return self.intro or self.title is not None


@dataclass
class OpeningPlan:
    segments: list[tuple[str, int]]  # ("intro" | "title", ms)
    blend_ms: int                    # length of each transition
    karaoke_start_ms: int            # where the karaoke's time 0 is in the final video

    @property
    def head_ms(self) -> int:
        """The first part of the karaoke that the last transition blends into."""
        return self.blend_ms


def plan_opening(options: OpeningOptions) -> OpeningPlan:
    segments = ([("intro", INTRO_MS)] if options.intro else []) + ([("title", TITLE_MS)] if options.title else [])
    blend = CUT_MS if options.transition == "none" else TRANSITION_MS
    length = sum(ms for _, ms in segments) - blend * (len(segments) - 1)
    return OpeningPlan(segments, blend, length - blend)


def intro_file(aspect: str) -> Path:
    return INTRO_DIR / INTRO_FILES.get(aspect, INTRO_FILES["16:9"])


def opening_files(options: OpeningOptions, aspect: str) -> list[Path]:
    files = ([intro_file(aspect)] if options.intro else []) + ([INTRO_DIR / BACKDROP_FILE] if options.title else [])
    missing = [f for f in files if not f.is_file()]
    if missing:
        # An older copy of the project on this computer: the clips come with the update.
        raise PipelineError("opening_missing", retryable=False)
    return files


def _fit(measurer: TextMeasurer, text: str, size: float, max_width: float) -> float:
    width = measurer.width(text, size)
    return size * min(1.0, max_width / width) if width > 0 else size


def title_ass(card: TitleCard, canvas: Canvas, name_font: TextMeasurer, song_font: TextMeasurer,
              language: str | None) -> str:
    """The title card's subtitles, in the intro's colours: the singer big, in
    white 3D letters with a purple depth and a soft purple glow, and just under
    it the song, smaller, in light blue. A light sweeps across the singer's name.
    Without a singer, the song takes the big place. Times are 0..TITLE_MS."""
    W, H = canvas.width, canvas.height
    unit = min(W, H) / 720
    artist, song = escape_text(card.artist), escape_text(card.song)
    big, small = (artist, song) if artist else (song, "")
    fs = _fit(name_font, big, min(W, H) * 0.19, W * 0.86)
    sfs = _fit(song_font, small, fs * 0.5, W * 0.84) if small else 0
    gap = fs * 0.14                                   # a little space between the two lines
    block = fs + (gap + sfs if small else 0)
    cy = H * 0.5 - block / 2 + fs / 2                 # the two lines together are centred
    sy = cy + fs / 2 + gap + sfs / 2
    mark = RLM if is_rtl(language, big.split()) else LRM
    smark = RLM if is_rtl(language, small.split()) else LRM
    start = "0:00:%05.2f" % (TITLE_DELAY_MS / 1000)
    end = "0:00:%05.2f" % (TITLE_MS / 1000)
    nbold = -1 if name_font.info.bold else 0
    out = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 2",
        "ScaledBorderAndShadow: yes", "Kerning: yes", "YCbCr Matrix: TV.709", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        f"Style: N,{name_font.info.family},{fs:.1f},{ass_color(FACE_LOW)},{ass_color(FACE_LOW)},{ass_color(EDGE)},"
        f"&HFF000000,{nbold},0,0,0,100,100,0,0,1,{1.2 * unit:.1f},0,5,0,0,0,-1",
        f"Style: S,{song_font.info.family},{max(sfs, 1):.1f},{ass_color(SONG_COLOR)},{ass_color(SONG_COLOR)},"
        f"{ass_color('#1e1b4b', 0x40)},&HFF000000,-1,0,0,0,100,100,0,0,1,{1.0 * unit:.1f},0,5,0,0,0,-1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    grow = "\\fscx108\\fscy108\\t(0,1100,0.5,\\fscx100\\fscy100)"
    fade = "\\fad(700,500)"

    def ev(layer: int, style: str, tags: str, text: str) -> None:
        out.append(f"Dialogue: {layer},{start},{end},{style},,0,0,0,,{{\\an5{tags}}}{text}")

    # 1. a soft purple-blue glow behind the name
    ev(0, "N", f"\\pos({cx_(W)},{cy:.1f})\\1c{tag_color(GLOW_PURPLE)}\\3c{tag_color(GLOW_BLUE)}\\bord{fs * 0.08:.1f}"
               f"\\1a&H90&\\3a&HB0&\\blur{fs * 0.22:.1f}{fade}{grow}", mark + big)
    # 2. the purple 3D depth and its shadow
    for ox, oy, color, alpha, blur in text_3d_layers("deep", DEPTH):
        soft = f"\\blur{blur * fs:.1f}" if blur else ""
        ev(1, "N", f"\\pos({W / 2 + ox * fs:.1f},{cy + oy * fs:.1f})\\1c{tag_color(color)}\\3c{tag_color(color)}"
                   f"\\1a&H{alpha:02X}&\\3a&H{alpha:02X}&{soft}{fade}{grow}", mark + big)
    # 3. the white face coming into focus, brighter on its upper half (like the chrome letters of the intro)
    ev(2, "N", f"\\pos({cx_(W)},{cy:.1f})\\blur6\\t(0,1000,\\blur0.5){fade}{grow}", mark + big)
    top = f"\\clip(0,{cy - fs:.0f},{W},{cy - fs * 0.04:.0f})"
    ev(3, "N", f"\\pos({cx_(W)},{cy:.1f})\\1c{tag_color(FACE_TOP)}\\bord0{top}\\blur6\\t(0,1000,\\blur0.5){fade}{grow}",
       mark + big)
    # 4. a light sweeping across the name
    band = W * 0.1
    ya, yb = cy - fs * 0.8, cy + fs * 0.8
    ev(4, "N", f"\\pos({cx_(W)},{cy:.1f})\\1c&HFFFFFF&\\3c&HFFFFFF&\\1a&H40&\\3a&H70&\\blur{fs * 0.06:.1f}"
               f"\\clip({-band:.0f},{ya:.0f},0,{yb:.0f})\\t(1500,2700,\\clip({W:.0f},{ya:.0f},{W + band:.0f},{yb:.0f})){fade}",
       mark + big)
    # 5. the song, just under the name, coming in a moment later
    if small:
        ev(2, "S", f"\\pos({cx_(W)},{sy:.1f})\\3c{tag_color(GLOW_BLUE)}\\3a&HA0&\\blur{1.5 * unit:.1f}"
                   f"\\fsp{sfs * 0.3:.1f}\\t(300,1400,0.6,\\fsp{sfs * 0.03:.1f})\\fad(1000,500)", smark + small)
    return "\n".join(out) + "\n"


def cx_(width: int) -> str:
    return f"{width / 2:.1f}"


def render_opening(
    ffmpeg: str,
    workdir: Path,
    canvas: Canvas,
    options: OpeningOptions,
    aspect: str,
    plan: OpeningPlan,
    head: str,
    title_subs: str | None,
    encoder: list[str],
    threads: int,
    timeout: float,
) -> str:
    """Encode the opening (intro, title, transitions and the karaoke's first
    moment) into one silent clip with the same settings as the karaoke parts."""
    W, H = canvas.width, canvas.height
    inputs: list[str] = []
    chains: list[str] = []
    labels: list[tuple[str, int]] = []
    fit = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30,format=yuv420p"
    index = 0
    for kind, ms in plan.segments:
        if kind == "intro":
            inputs += ["-i", str(intro_file(aspect).resolve())]
            chains.append(f"[{index}:v]{fit},trim=duration={ms / 1000:.3f},setpts=PTS-STARTPTS[s{index}]")
        else:
            inputs += ["-stream_loop", "-1", "-i", str((INTRO_DIR / BACKDROP_FILE).resolve())]
            chains.append(f"[{index}:v]{fit},trim=duration={ms / 1000:.3f},setpts=PTS-STARTPTS,"
                          f"ass=filename={title_subs}:fontsdir=fonts[s{index}]")
        labels.append((f"s{index}", ms))
        index += 1
    inputs += ["-i", head]
    chains.append(f"[{index}:v]setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[head]")
    labels.append(("head", plan.head_ms))

    kind = TRANSITIONS[options.transition]
    blend = plan.blend_ms / 1000
    current, length = labels[0]
    for k, (label, ms) in enumerate(labels[1:], start=1):
        offset = length / 1000 - blend
        out = "v" if k == len(labels) - 1 else f"x{k}"
        chains.append(f"[{current}][{label}]xfade=transition={kind}:duration={blend:.3f}:offset={offset:.3f}[{out}]")
        current, length = out, length + ms - plan.blend_ms
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *inputs,
           "-filter_complex", ";".join(chains), "-map", "[v]", "-an",
           *encoder, "-pix_fmt", "yuv420p", "-threads", str(threads), "-r", "30",
           "-t", f"{(plan.karaoke_start_ms + plan.head_ms) / 1000:.3f}", "opening.mp4"]
    try:
        done = subprocess.run(cmd, cwd=workdir, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("render_failed", retryable=False) from exc
    out_file = workdir / "opening.mp4"
    if done.returncode != 0 or not out_file.exists() or out_file.stat().st_size == 0:
        (workdir / "opening.log").write_bytes(done.stderr or b"")
        raise PipelineError("render_failed", retryable=False)
    return "opening.mp4"
