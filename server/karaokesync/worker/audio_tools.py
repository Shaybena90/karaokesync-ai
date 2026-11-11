"""FFmpeg / Demucs helpers. All commands run without a shell."""

from __future__ import annotations

import importlib.util
import re
import shutil
import subprocess
import sys
import threading
from collections.abc import Callable
from pathlib import Path

from .errors import PipelineError


def _ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise PipelineError("ffmpeg_missing", retryable=False)
    return path


def to_working_wav(
    src: Path, dest: Path, sample_rate: int = 16000, timeout: float = 600, start_ms: int | None = None, end_ms: int | None = None
) -> Path:
    """Convert any supported input to 16 kHz mono 16-bit PCM — the format speech models expect.

    With start_ms/end_ms only that part is kept. The cut is placed after the
    input (output seeking): FFmpeg decodes from the beginning, so the cut is
    sample-exact even for VBR MP3 files, matching what the full pipeline saw.
    """
    cut: list[str] = []
    if start_ms is not None:
        cut += ["-ss", f"{start_ms / 1000:.3f}"]
    if end_ms is not None:
        cut += ["-t", f"{(end_ms - (start_ms or 0)) / 1000:.3f}"]
    cmd = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
           "-i", str(src), *cut, "-vn", "-ac", "1", "-ar", str(sample_rate), "-c:a", "pcm_s16le", str(dest)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("convert_timeout", retryable=True) from exc
    if result.returncode != 0 or not dest.exists():
        raise PipelineError("convert_failed", retryable=False)
    return dest


_PERCENT = re.compile(r"(\d{1,3})%\|")


def separate_stems(
    src: Path, out_dir: Path, model: str, timeout: float = 7200, on_progress: Callable[[float], None] | None = None
) -> tuple[Path, Path]:
    """Split a song with Demucs into the singing (vocals.wav) and everything
    else (no_vocals.wav). Progress comes from Demucs's own progress bar."""
    if importlib.util.find_spec("demucs") is None:
        raise PipelineError("ai_dependencies_missing", retryable=False)
    cmd = [sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", model, "-o", str(out_dir), str(src)]
    # stderr in text mode: tqdm's carriage returns become line breaks.
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, errors="replace")
    # A watchdog, so a silent hang cannot block the worker forever.
    timed_out = threading.Event()

    def _kill() -> None:
        timed_out.set()
        proc.kill()

    watchdog = threading.Timer(timeout, _kill)
    watchdog.start()
    try:
        assert proc.stderr is not None
        for line in proc.stderr:
            match = _PERCENT.search(line)
            if match and on_progress:
                on_progress(min(1.0, int(match.group(1)) / 100))
        proc.wait()
    finally:
        watchdog.cancel()
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if timed_out.is_set():
        raise PipelineError("separation_timeout", retryable=True)
    folder = out_dir / model / src.stem
    vocals, rest = folder / "vocals.wav", folder / "no_vocals.wav"
    if proc.returncode != 0 or not vocals.exists() or not rest.exists():
        raise PipelineError("separation_failed", retryable=False)
    return vocals, rest


def separate_vocals(src: Path, out_dir: Path, model: str, timeout: float = 3600) -> Path:
    """Isolate the vocal stem with Demucs. Returns the path of vocals.wav."""
    return separate_stems(src, out_dir, model, timeout)[0]


def encode_mp3(src: Path, dest: Path, bitrate: str = "192k", timeout: float = 600) -> Path:
    cmd = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
           "-i", str(src), "-vn", "-c:a", "libmp3lame", "-b:a", bitrate, str(dest)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("convert_timeout", retryable=True) from exc
    if result.returncode != 0 or not dest.exists():
        raise PipelineError("convert_failed", retryable=False)
    return dest
