"""NVIDIA graphics card support for the worker.

Whisper (CTranslate2) needs the CUDA libraries cuBLAS 12 and cuDNN 9. On
Windows they are installed with pip (nvidia-cublas-cu12, nvidia-cudnn-cu12,
see scripts/windows/7-enable-gpu.bat) into site-packages/nvidia/*/bin, which
Windows does not search by itself: register_cuda_dlls() adds those folders.
Demucs uses PyTorch, whose CUDA build carries its own libraries.

Run `python -m karaokesync.worker.gpu` to see what works on this computer.
"""

from __future__ import annotations

import os
import shutil
import site
import subprocess
import sys
from functools import lru_cache
from pathlib import Path


def register_cuda_dlls() -> list[str]:
    """Windows only: make pip-installed CUDA libraries findable. Returns the folders added."""
    if sys.platform != "win32":
        return []
    roots = [*site.getsitepackages(), site.getusersitepackages()]
    added = []
    for root in roots:
        for bin_dir in sorted((Path(root) / "nvidia").glob("*/bin")):
            os.add_dll_directory(str(bin_dir))
            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
            added.append(str(bin_dir))
    return added


def whisper_gpus() -> int:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count()
    except Exception:
        return 0


def torch_gpu() -> str | None:
    """Name of the card PyTorch (Demucs) can use, or None."""
    try:
        import torch

        return torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    except Exception:
        return None


@lru_cache(maxsize=1)
def nvenc_available() -> bool:
    """True if FFmpeg can really encode on the card (a tiny test, done once)."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=256x256:d=0.2",
           "-c:v", "h264_nvenc", "-f", "null", "-"]
    try:
        return subprocess.run(cmd, capture_output=True, timeout=30, check=False).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def summary() -> list[str]:
    gpus = whisper_gpus()
    card = torch_gpu()
    return [
        f"Whisper (speech recognition): {'GPU x' + str(gpus) if gpus else 'CPU'}",
        f"Demucs (vocal separation): {'GPU ' + card if card else 'CPU'}",
        f"Video encoding: {'GPU (NVENC)' if nvenc_available() else 'CPU (libx264)'}",
    ]


def main() -> None:
    added = register_cuda_dlls()
    if sys.platform == "win32":
        print(f"CUDA library folders found: {len(added)}")
    lines = summary()
    for line in lines:
        print(("OK   " if "GPU" in line else "--   ") + line)
    if "CPU" in lines[0]:
        print("Whisper on CPU: run scripts\\windows\\7-enable-gpu.bat, and make sure the NVIDIA driver is up to date.")
    if "CPU" in lines[1]:
        print("Demucs on CPU: PyTorch without CUDA is installed (7-enable-gpu.bat installs the CUDA build),"
              " or the NVIDIA driver is too old for it.")


if __name__ == "__main__":
    main()
