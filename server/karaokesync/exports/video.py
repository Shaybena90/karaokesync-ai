"""Render an MP4 with burned-in karaoke subtitles (FFmpeg + libass)."""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from ..styles import SubtitleStyle
from ..worker.errors import PipelineError
from .ass import Canvas

ASPECTS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1)}
RESOLUTIONS = (720, 1080)


def canvas_for(aspect: str, resolution: int) -> Canvas:
    """`resolution` is the length of the short side (720p / 1080p)."""
    w, h = ASPECTS[aspect]
    short = resolution
    if w >= h:
        return Canvas(width=round(short * w / h / 2) * 2, height=short)
    return Canvas(width=short, height=round(short * h / w / 2) * 2)


def background_source(style: SubtitleStyle, canvas: Canvas, fps: int = 30) -> str:
    size = f"{canvas.width}x{canvas.height}"
    c0, c1 = style.background_color[1:], style.background_color2[1:]
    if c0 == c1:
        return f"color=c=0x{c0}:s={size}:r={fps}"
    # Diagonal gradient that rotates very slowly (FFmpeg's minimum speed).
    return (f"gradients=s={size}:r={fps}:c0=0x{c0}:c1=0x{c1}:x0=0:y0=0:"
            f"x1={canvas.width}:y1={canvas.height}:nb_colors=2:speed=0.00001")


def render_mp4(
    workdir: Path,
    audio: Path,
    ass_text: str,
    font_file: Path,
    style: SubtitleStyle,
    canvas: Canvas,
    duration_ms: int,
    out_name: str = "out.mp4",
    on_progress: Callable[[float], None] | None = None,
    timeout_s: int = 3600,
) -> Path:
    """Paths inside the filter graph are relative to `workdir` on purpose:
    Windows paths ("C:\\...") would need complex escaping in FFmpeg filters."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise PipelineError("ffmpeg_missing", retryable=False)
    fonts = workdir / "fonts"
    fonts.mkdir(exist_ok=True)
    shutil.copy(font_file, fonts / font_file.name)
    (workdir / "subs.ass").write_text(ass_text, encoding="utf-8")

    cmd = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", background_source(style, canvas),
        "-i", str(audio.resolve()),
        "-filter_complex", "[0:v]ass=filename=subs.ass:fontsdir=fonts[v]",
        "-map", "[v]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-t", f"{duration_ms / 1000:.3f}", "-shortest",
        "-movflags", "+faststart",
        "-progress", "pipe:1", "-nostats",
        out_name,
    ]
    proc = subprocess.Popen(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            key, _, value = raw.strip().partition("=")
            if key == "out_time_us" and value.isdigit() and on_progress and duration_ms > 0:
                on_progress(min(1.0, int(value) / 1000 / duration_ms))
        proc.wait(timeout=timeout_s)
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    out = workdir / out_name
    if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
        raise PipelineError("render_failed", retryable=False)
    return out
