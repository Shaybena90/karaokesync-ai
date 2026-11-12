"""Render an MP4 with burned-in karaoke subtitles (FFmpeg + libass)."""

from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
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


def background_source(style: SubtitleStyle, canvas: Canvas) -> str:
    """FFmpeg source for one frame of the base background (colour or gradient)."""
    size = f"{canvas.width}x{canvas.height}"
    c0, c1 = style.background_color[1:], style.background_color2[1:]
    if c0 == c1:
        return f"color=c=0x{c0}:s={size}"
    # A fixed seed: FFmpeg's gradient is otherwise random and would differ between parts.
    return (f"gradients=s={size}:c0=0x{c0}:c1=0x{c1}:x0=0:y0=0:"
            f"x1={canvas.width}:y1={canvas.height}:nb_colors=2:seed=1")


@dataclass(frozen=True)
class BackgroundLayer:
    """A downloaded background file shown from start_ms to end_ms, looping."""

    file: Path
    kind: str  # "image" | "video" (an animated GIF is a video)
    start_ms: int
    end_ms: int
    duration_ms: int | None = None  # length of one loop (videos), to continue it across chunks


def background_inputs_and_filters(
    layers: list[BackgroundLayer], canvas: Canvas, fps: int = 30, chunk: tuple[int, int] | None = None, first_input: int = 1
) -> tuple[list[str], str, str]:
    """FFmpeg input arguments and filter chains that put each layer over the
    base background ([0:v]) during its time range. With `chunk` = (t0, t1) the
    graph covers only that part of the song, in local time starting at 0, and a
    looping video continues exactly where it would be at t0.
    Returns (inputs, filters, last_label)."""
    t0, t1 = chunk if chunk else (0, max((layer.end_ms for layer in layers), default=0))
    inputs: list[str] = []
    # The base background is a single picture, repeated from memory for every frame
    # (generating a gradient for each frame cost more than everything else).
    chains: list[str] = [f"[0:v]loop=loop=-1:size=1,setpts=N/{fps}/TB[base]"]
    label = "base"
    w, h = canvas.width, canvas.height
    index = first_input
    for i, layer in enumerate(layers):
        start, end = max(layer.start_ms, t0), min(layer.end_ms, t1)
        if end <= start:
            continue  # not visible in this part
        if layer.kind == "image":
            inputs += ["-loop", "1", "-framerate", str(fps), "-i", str(layer.file)]
        else:  # loop the clip, starting at the point it has reached at this part's start
            phase = ((start - layer.start_ms) % layer.duration_ms) / 1000 if layer.duration_ms else 0.0
            inputs += ["-stream_loop", "-1", *(["-ss", f"{phase:.3f}"] if phase else []), "-i", str(layer.file)]
        a, b = (start - t0) / 1000, (end - t0) / 1000
        chains.append(
            f"[{index}:v]fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,"
            f"trim=duration={b - a:.3f},setpts=PTS-STARTPTS+{a:.3f}/TB[bg{i}]"
        )
        chains.append(f"[{label}][bg{i}]overlay=eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[base{i}]")
        label = f"base{i}"
        index += 1
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


def plan_chunks(duration_ms: int, workers: int, min_chunk_ms: int = 15_000) -> list[tuple[int, int]]:
    """Split the song into equal parts on whole frames (1/30 s) for parallel rendering."""
    count = max(1, min(workers, duration_ms // min_chunk_ms))
    frame_ms = 1000 / 30
    edges = [round(round(duration_ms * k / count / frame_ms) * frame_ms) for k in range(count + 1)]
    edges[-1] = duration_ms
    return [(edges[k], edges[k + 1]) for k in range(count) if edges[k + 1] > edges[k]]


def default_workers() -> int:
    """libass draws the subtitles on one core, so parts render side by side;
    four parts already use a typical computer well."""
    return max(1, min(4, os.cpu_count() or 1))


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
    workers: int | None = None,
) -> Path:
    """Render the video in parts at the same time (one FFmpeg per part), join
    them without re-encoding and add the song once.

    Paths inside the filter graph are relative to `workdir` on purpose:
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
    base = workdir / "base.png"
    made = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                           "-i", background_source(style, canvas), "-frames:v", "1", str(base)],
                          capture_output=True, timeout=120, check=False)
    if made.returncode != 0 or not base.exists():
        raise PipelineError("render_failed", retryable=False)
    chunks = plan_chunks(duration_ms, workers or default_workers())
    threads = max(1, (os.cpu_count() or 1) // len(chunks))
    deadline = time.monotonic() + timeout_s

    done_ms = [0] * len(chunks)
    lock = threading.Lock()

    def follow(k: int, proc: subprocess.Popen) -> None:
        assert proc.stdout is not None
        for raw in proc.stdout:
            key, _, value = raw.strip().partition("=")
            if key == "out_time_us" and value.isdigit():
                with lock:
                    done_ms[k] = min(int(value) // 1000, chunks[k][1] - chunks[k][0])
                    total = sum(done_ms)
                if on_progress and duration_ms > 0:
                    on_progress(min(0.97, total / duration_ms))

    procs: list[subprocess.Popen] = []
    readers: list[threading.Thread] = []
    try:
        for k, (t0, t1) in enumerate(chunks):
            bg_inputs, bg_filters, last = background_inputs_and_filters(backgrounds or [], canvas, chunk=(t0, t1))
            # The subtitles are drawn in song time, then the part starts again at 0.
            graph = (f"{bg_filters};[{last}]setpts=PTS+{t0 / 1000:.3f}/TB,"
                     f"ass=filename=subs.ass:fontsdir=fonts,setpts=PTS-STARTPTS[v]")
            cmd = [
                ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "30", "-i", "base.png",
                *bg_inputs,
                "-filter_complex", graph, "-map", "[v]", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", *video_cap, "-pix_fmt", "yuv420p",
                "-threads", str(threads), "-r", "30",
                "-t", f"{(t1 - t0) / 1000:.3f}",
                "-progress", "pipe:1", "-nostats",
                f"part{k}.mp4",
            ]
            log_file = open(workdir / f"part{k}.log", "w")  # noqa: SIM115 - closed with the process below
            proc = subprocess.Popen(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=log_file, text=True)
            proc.log_file = log_file  # type: ignore[attr-defined]
            procs.append(proc)
            reader = threading.Thread(target=follow, args=(k, proc), daemon=True)
            reader.start()
            readers.append(reader)
        for proc in procs:
            proc.wait(timeout=max(1.0, deadline - time.monotonic()))
    except BaseException:
        for proc in procs:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
        raise
    finally:
        for proc in procs:
            proc.log_file.close()  # type: ignore[attr-defined]
    for reader in readers:
        reader.join(timeout=5)
    for k, proc in enumerate(procs):
        part = workdir / f"part{k}.mp4"
        if proc.returncode != 0 or not part.exists() or part.stat().st_size == 0:
            raise PipelineError("render_failed", retryable=False)

    # Join the parts as they are and add the song.
    (workdir / "parts.txt").write_text("".join(f"file 'part{k}.mp4'\n" for k in range(len(chunks))), encoding="utf-8")
    join = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", "parts.txt",
        "-i", str(audio.resolve()),
        "-map", "0:v", "-map", "1:a:0", "-c:v", "copy",
        "-c:a", "aac", "-b:a", f"{audio_kbps}k",
        "-t", f"{duration_ms / 1000:.3f}",
        "-movflags", "+faststart",
        out_name,
    ]
    try:
        result = subprocess.run(join, cwd=workdir, capture_output=True, timeout=max(60.0, deadline - time.monotonic()), check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("render_failed", retryable=False) from exc
    out = workdir / out_name
    if result.returncode != 0 or not out.exists() or out.stat().st_size == 0:
        raise PipelineError("render_failed", retryable=False)
    if on_progress:
        on_progress(1.0)
    if max_bytes and out.stat().st_size > max_bytes:
        raise PipelineError("export_too_large", retryable=False)
    return out
