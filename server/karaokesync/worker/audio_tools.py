"""FFmpeg / Demucs helpers. All commands run without a shell."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from .errors import PipelineError


def _ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise PipelineError("ffmpeg_missing", retryable=False)
    return path


def to_working_wav(src: Path, dest: Path, sample_rate: int = 16000, timeout: float = 600) -> Path:
    """Convert any supported input to 16 kHz mono 16-bit PCM — the format speech models expect."""
    cmd = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
           "-i", str(src), "-vn", "-ac", "1", "-ar", str(sample_rate), "-c:a", "pcm_s16le", str(dest)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("convert_timeout", retryable=True) from exc
    if result.returncode != 0 or not dest.exists():
        raise PipelineError("convert_failed", retryable=False)
    return dest


def separate_vocals(src: Path, out_dir: Path, model: str, timeout: float = 3600) -> Path:
    """Isolate the vocal stem with Demucs. Returns the path of vocals.wav."""
    cmd = [sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", model, "-o", str(out_dir), str(src)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("separation_timeout", retryable=True) from exc
    vocals = out_dir / model / src.stem / "vocals.wav"
    if result.returncode != 0 or not vocals.exists():
        raise PipelineError("separation_failed", retryable=False)
    return vocals
