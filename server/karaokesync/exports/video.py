"""Render an MP4 with burned-in karaoke subtitles (FFmpeg + libass)."""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
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


@dataclass(frozen=True)
class BackgroundLayer:
    """A downloaded background file shown from start_ms to end_ms, looping."""

    file: Path
    kind: str  # "image" | "video" (an animated GIF is a video)
    start_ms: int
    end_ms: int


def background_inputs_and_filters(layers: list[BackgroundLayer], canvas: Canvas, fps: int = 30) -> tuple[list[str], str, str]:
    """FFmpeg input arguments and filter chains that put each layer over the
    base background ([0:v]) during its time range. Inputs start at index 2
    (0 = base background, 1 = song). Returns (inputs, filters, last_label)."""
    inputs: list[str] = []
    chains: list[str] = []
    label = "0:v"
    w, h = canvas.width, canvas.height
    for i, layer in enumerate(layers):
        if layer.kind == "image":
            inputs += ["-loop", "1", "-framerate", str(fps), "-i", str(layer.file)]
        else:  # loop the clip for as long as its range lasts
            inputs += ["-stream_loop", "-1", "-i", str(layer.file)]
        start, end = layer.start_ms / 1000, layer.end_ms / 1000
        chains.append(
            f"[{i + 2}:v]fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,"
            f"trim=duration={end - start:.3f},setpts=PTS-STARTPTS+{start:.3f}/TB[bg{i}]"
        )
        chains.append(f"[{label}][bg{i}]overlay=eof_action=pass:enable='between(t,{start:.3f},{end:.3f})'[base{i}]")
        label = f"base{i}"
    return inputs, ";".join(chains), label


def bitrates_for(duration_ms: int, max_bytes: int | None) -> tuple[int, int] | None:
    """(video kbps, audio kbps) that keep the whole file under max_bytes, or
    None for no cap. 10% is kept for the container, and one second of video
    for the encoder's buffer (it may spend that much above the rate)."""
    if not max_bytes or duration_ms <= 0:
        return None
    seconds = duration_ms / 1000
    budget_kbit = max_bytes * 8 / 1000 * 0.9
    per_second = budget_kbit / seconds
    audio = 192 if per_second >= 2000 else 128 if per_second >= 600 else 96
    video = (budget_kbit - audio * seconds) / (seconds + 1)
    return max(150, int(video)), audio


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
    backgrounds: list[BackgroundLayer] | None = None,
    max_bytes: int | None = None,
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

    # Quality first (CRF), but never above the bitrate that fits the storage limit.
    rates = bitrates_for(duration_ms, max_bytes)
    video_cap = ["-maxrate", f"{rates[0]}k", "-bufsize", f"{rates[0]}k"] if rates else []
    audio_kbps = rates[1] if rates else 192
    bg_inputs, bg_filters, base = background_inputs_and_filters(backgrounds or [], canvas)
    graph = f"{bg_filters};" if bg_filters else ""
    graph += f"[{base}]ass=filename=subs.ass:fontsdir=fonts[v]"
    cmd = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", background_source(style, canvas),
        "-i", str(audio.resolve()),
        *bg_inputs,
        "-filter_complex", graph,
        "-map", "[v]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", *video_cap, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", f"{audio_kbps}k",
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
    if max_bytes and out.stat().st_size > max_bytes:
        raise PipelineError("export_too_large", retryable=False)
    return out
