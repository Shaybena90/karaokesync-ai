"""The opening of an exported video: the KaraokeSync intro clip, a luxurious 3D
title card with the song and the singer, and a transition into the karaoke.

    [intro 8 s] ~transition~ [title 5 s] ~transition~ [karaoke ...]

The intro clip and the title backdrop are pre-drawn 3D clips committed to the
repository (web/public/intro, made by web/scripts/render-3d-backgrounds.mjs).
The title itself is drawn per song by libass, in gold 3D letters. Transitions
are FFmpeg's xfade; the last one blends into the first second of the karaoke,
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
TITLE_MS = 5000
TRANSITION_MS = 1000
CUT_MS = 34  # "no transition": a one-frame blend, i.e. a cut

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

TITLE_FONT = "Frank Ruhl Libre"   # an elegant serif with Hebrew letters
ARTIST_FONT = "Heebo"
GOLD_FACE = "#f7d67c"
GOLD_LIGHT = "#fff0b8"
GOLD_DEEP = "#7a5414"


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


def title_ass(card: TitleCard, canvas: Canvas, title_font: TextMeasurer, artist_font: TextMeasurer,
              language: str | None) -> str:
    """The title card's subtitles: the song in gold 3D letters (deep extrusion,
    a lighter upper half, a light sweeping across) and the singer below a gold
    line, all coming in with a short animation. Times are 0..TITLE_MS."""
    W, H = canvas.width, canvas.height
    unit = min(W, H) / 720
    song, artist = escape_text(card.song), escape_text(card.artist)
    fs = _fit(title_font, song, min(W, H) * 0.15, W * 0.84)
    afs = _fit(artist_font, artist, min(W, H) * 0.055, W * 0.8) if artist else 0
    cx, cy = W / 2, H * (0.45 if artist else 0.5)
    ay = cy + fs * 0.98
    line_y = cy + fs * 0.62
    mark = RLM if is_rtl(language, song.split()) else LRM
    amark = RLM if is_rtl(language, artist.split()) else LRM
    end = "0:00:%05.2f" % (TITLE_MS / 1000)
    tname, aname = title_font.info.family, artist_font.info.family
    tbold = -1 if title_font.info.bold else 0
    out = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "WrapStyle: 2",
        "ScaledBorderAndShadow: yes", "Kerning: yes", "YCbCr Matrix: TV.709", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        f"Style: T,{tname},{fs:.1f},{ass_color(GOLD_FACE)},{ass_color(GOLD_FACE)},{ass_color(GOLD_LIGHT)},"
        f"&HFF000000,{tbold},0,0,0,100,100,0,0,1,{1.3 * unit:.1f},0,5,0,0,0,-1",
        f"Style: A,{aname},{max(afs, 1):.1f},{ass_color('#f4f1ea')},{ass_color('#f4f1ea')},{ass_color('#000000', 0x80)},"
        f"&HFF000000,0,0,0,0,100,100,0,0,1,{0.8 * unit:.1f},0,5,0,0,0,-1",
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    grow = "\\fscx112\\fscy112\\t(0,1000,0.5,\\fscx100\\fscy100)"
    fade = "\\fad(450,450)"

    def ev(layer: int, style: str, tags: str, text: str) -> None:
        out.append(f"Dialogue: {layer},0:00:00.00,{end},{style},,0,0,0,,{{\\an5{tags}}}{text}")

    # 1. the deep gold extrusion and a soft shadow, behind the letters
    for ox, oy, color, alpha, blur in text_3d_layers("deep", GOLD_DEEP):
        soft = f"\\blur{blur * fs:.1f}" if blur else ""
        ev(0, "T", f"\\pos({cx + ox * fs:.1f},{cy + oy * fs:.1f})\\1c{tag_color(color)}\\3c{tag_color(color)}"
                   f"\\1a&H{alpha:02X}&\\3a&H{alpha:02X}&{soft}{fade}{grow}", mark + song)
    # 2. the gold face, coming into focus
    ev(1, "T", f"\\pos({cx:.1f},{cy:.1f})\\blur6\\t(0,900,\\blur0.6){fade}{grow}", mark + song)
    # 3. a lighter gold on the upper half: a metal gradient
    top = f"\\clip(0,{cy - fs:.0f},{W},{cy - fs * 0.05:.0f})"
    ev(2, "T", f"\\pos({cx:.1f},{cy:.1f})\\1c{tag_color(GOLD_LIGHT)}\\bord0\\1a&H50&{top}\\blur6\\t(0,900,\\blur0.6){fade}{grow}",
       mark + song)
    # 4. a light sweeping across the letters
    band = W * 0.1
    ya, yb = cy - fs * 0.8, cy + fs * 0.8
    ev(3, "T", f"\\pos({cx:.1f},{cy:.1f})\\1c&HFFFFFF&\\3c&HFFFFFF&\\1a&H30&\\3a&H60&\\blur{fs * 0.06:.1f}"
               f"\\clip({-band:.0f},{ya:.0f},0,{yb:.0f})\\t(1300,2400,\\clip({W:.0f},{ya:.0f},{W + band:.0f},{yb:.0f})){fade}",
       mark + song)
    # 5. a thin gold line that opens from the middle
    half, thick = W * 0.2, max(2.0, 2 * unit)
    ev(1, "A", f"\\pos({cx:.1f},{line_y:.1f})\\p1\\1c{tag_color(GOLD_FACE)}\\bord0\\blur{unit:.1f}\\fscx0"
               f"\\t(500,1400,0.6,\\fscx100){fade}",
       f"m 0 0 l {2 * half:.0f} 0 l {2 * half:.0f} {thick:.0f} l 0 {thick:.0f}")   # libass centres the drawn box
    # 6. the singer, letters closing in
    if artist:
        ev(1, "A", f"\\pos({cx:.1f},{ay:.1f})\\fsp{afs * 0.45:.1f}\\t(700,1700,0.6,\\fsp{afs * 0.06:.1f})"
                   f"\\fad(900,450)", amark + artist)
    return "\n".join(out) + "\n"


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
