import os
import shutil
import subprocess
from pathlib import Path

import pytest

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from fastapi.testclient import TestClient  # noqa: E402

from karaokesync.api.deps import _write_limiter, get_supabase  # noqa: E402
from karaokesync.api.main import create_app  # noqa: E402

from .fake_supabase import FakeSupabase  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg not installed")


@pytest.fixture
def fake_sb():
    return FakeSupabase()


@pytest.fixture
def client(fake_sb):
    _write_limiter._hits.clear()
    app = create_app()
    app.dependency_overrides[get_supabase] = lambda: fake_sb
    return TestClient(app)


def make_audio(tmp_path: Path, ext: str, seconds: float = 1.0) -> Path:
    """Generate a real (sine tone) audio file with FFmpeg."""
    out = tmp_path / f"tone.{ext}"
    codec = {"mp3": ["-c:a", "libmp3lame"], "wav": ["-c:a", "pcm_s16le"], "m4a": ["-c:a", "aac"]}[ext]
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"sine=frequency=440:duration={seconds}", *codec, str(out)],
        check=True,
    )
    return out
