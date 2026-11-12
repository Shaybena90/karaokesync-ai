"""NVIDIA card support: CUDA library folders on Windows, NVENC choice and fallback."""

import sys

from karaokesync.exports.video import encoder_args
from karaokesync.worker import gpu


def test_cuda_library_folders_are_registered_on_windows(tmp_path, monkeypatch):
    for lib in ("cublas", "cudnn"):
        (tmp_path / "nvidia" / lib / "bin").mkdir(parents=True)
    (tmp_path / "nvidia" / "not-a-lib").mkdir()
    added_dirs: list[str] = []
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(gpu.site, "getsitepackages", lambda: [str(tmp_path)])
    monkeypatch.setattr(gpu.site, "getusersitepackages", lambda: str(tmp_path / "user"))
    monkeypatch.setattr(gpu.os, "add_dll_directory", added_dirs.append, raising=False)
    monkeypatch.setenv("PATH", "C:\\Windows")
    added = gpu.register_cuda_dlls()
    assert [p.split("nvidia")[1][1:].split("bin")[0].strip("/\\") for p in added] == ["cublas", "cudnn"]
    assert added_dirs == added and gpu.os.environ["PATH"].startswith(added[-1])


def test_nothing_to_register_elsewhere(monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    assert gpu.register_cuda_dlls() == []


def test_encoder_arguments_keep_the_size_cap():
    cap = ["-maxrate", "1500k", "-bufsize", "1500k"]
    nvenc = encoder_args("h264_nvenc", cap)
    assert nvenc[:2] == ["-c:v", "h264_nvenc"] and nvenc[-4:] == cap and "-cq" in nvenc
    assert encoder_args("libx264", cap)[:2] == ["-c:v", "libx264"]


def test_auto_encoder_falls_back_to_the_cpu(monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.export_pipeline import _video_encoder

    s = get_settings()
    monkeypatch.setattr(s, "video_encoder", "auto")
    monkeypatch.setattr(gpu, "nvenc_available", lambda: False)
    assert _video_encoder(s) == "libx264"
    monkeypatch.setattr(gpu, "nvenc_available", lambda: True)
    assert _video_encoder(s) == "h264_nvenc"
    monkeypatch.setattr(s, "video_encoder", "libx264")
    assert _video_encoder(s) == "libx264"  # an explicit choice wins


def test_summary_without_a_card(monkeypatch):
    monkeypatch.setattr(gpu, "whisper_gpus", lambda: 0)
    monkeypatch.setattr(gpu, "torch_gpu", lambda: None)
    monkeypatch.setattr(gpu, "nvenc_available", lambda: False)
    assert all("CPU" in line for line in gpu.summary())
    monkeypatch.setattr(gpu, "whisper_gpus", lambda: 1)
    monkeypatch.setattr(gpu, "torch_gpu", lambda: "NVIDIA RTX A5000")
    assert gpu.summary()[1] == "Demucs (vocal separation): GPU NVIDIA RTX A5000"
