"""Melody only: API, worker (with a stand-in Demucs run as a real subprocess), retention."""

import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from karaokesync.worker.errors import PipelineError

from .conftest import make_audio, needs_ffmpeg

AUTH = {"Authorization": "Bearer alice-token"}

# Behaves like `python -m demucs --two-stems vocals -n MODEL -o OUT SONG`: prints a
# tqdm-style bar on stderr and writes OUT/MODEL/<song name>/{vocals,no_vocals}.wav.
FAKE_DEMUCS = r'''
import subprocess, sys
from pathlib import Path
args = sys.argv[1:]
assert args[:2] == ["--two-stems", "vocals"], args
model, out, song = args[args.index("-n") + 1], Path(args[args.index("-o") + 1]), Path(args[-1])
folder = out / model / song.stem
folder.mkdir(parents=True)
for p in (10, 55, 100):
    sys.stderr.write(f"\r {p}%|#####     | {p}/100 [00:01<00:01]")
    sys.stderr.flush()
for name, src in (("vocals.wav", "anullsrc=r=44100:cl=stereo"), ("no_vocals.wav", None)):
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y"]
    cmd += ["-f", "lavfi", "-i", src, "-t", "1"] if src else ["-i", str(song)]
    subprocess.run(cmd + [str(folder / name)], check=True)
'''


@pytest.fixture
def fake_demucs(tmp_path, monkeypatch):
    pkg = tmp_path / "fakepkgs" / "demucs"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text("")
    (pkg / "__main__.py").write_text(FAKE_DEMUCS)
    monkeypatch.syspath_prepend(str(pkg.parent))
    monkeypatch.setenv("PYTHONPATH", os.pathsep.join([str(pkg.parent), os.environ.get("PYTHONPATH", "")]))
    import importlib

    importlib.invalidate_caches()
    return pkg


@pytest.fixture
def project(fake_sb):
    alice = fake_sb.add_user("alice-token")
    fake_sb.add_user("bob-token")
    p = fake_sb.insert("projects", {"user_id": alice.id, "title": "שיר", "status": "ready", "language": "he"})
    audio = fake_sb.insert("audio_files", {"project_id": p["id"], "user_id": alice.id, "storage_path": f"{alice.id}/{p['id']}/s.mp3",
                                           "status": "verified", "duration_ms": 3000})
    return {**p, "audio_id": audio["id"], "audio_path": audio["storage_path"]}


# --------------------------------------------------------------------- API
def test_request_is_idempotent(client, fake_sb, project):
    url = f"/projects/{project['id']}/instrumental"
    first = client.post(url, headers=AUTH)
    assert first.status_code == 200, first.text
    job = first.json()
    assert job["status"] == "queued" and job["audio_file_id"] == project["audio_id"]
    assert client.post(url, headers=AUTH).json()["id"] == job["id"]  # in progress: the same job
    # Done: the finished track is returned, nothing is separated twice.
    fake_sb.update("instrumental_jobs", {"id": f"eq.{job['id']}"}, {"status": "succeeded", "output_path": "u/p/i.mp3"})
    assert client.post(url, headers=AUTH).json()["id"] == job["id"]
    assert len(fake_sb.tables["instrumental_jobs"]) == 1
    # Failed: asking again starts a new attempt.
    fake_sb.update("instrumental_jobs", {"id": f"eq.{job['id']}"}, {"status": "failed", "output_path": None})
    assert client.post(url, headers=AUTH).json()["id"] != job["id"]


def test_request_checks_owner_and_audio(client, fake_sb, project):
    url = f"/projects/{project['id']}/instrumental"
    assert client.post(url, headers={"Authorization": "Bearer bob-token"}).status_code == 404
    assert client.post(url).status_code == 401
    fake_sb.update("audio_files", {"id": f"eq.{project['audio_id']}"}, {"status": "deleted"})
    assert client.post(url, headers=AUTH).json()["detail"] == "audio_missing"


def test_daily_limit(client, fake_sb, project, monkeypatch):
    from karaokesync.config import get_settings

    monkeypatch.setattr(get_settings(), "max_instrumentals_per_day", 1)
    url = f"/projects/{project['id']}/instrumental"
    job = client.post(url, headers=AUTH).json()
    fake_sb.update("instrumental_jobs", {"id": f"eq.{job['id']}"}, {"status": "failed"})
    resp = client.post(url, headers=AUTH)
    assert resp.status_code == 429 and resp.json()["detail"] == "daily_instrumental_limit"


# ------------------------------------------------------------------ worker
@needs_ffmpeg
def test_worker_creates_the_melody_only_track(fake_sb, project, fake_demucs, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.instrumental import run_instrumental

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    fake_sb.put_object("audio", project["audio_path"], make_audio(tmp_path, "mp3", 3))
    job = fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                               "user_id": project["user_id"]})
    progress: list[int] = []
    path = run_instrumental(job, fake_sb, settings, progress.append)

    assert path == f"{project['user_id']}/{project['id']}/instrumental-{job['id']}.mp3"
    stored = fake_sb.objects["audio"][path]
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name:format=duration", "-of", "csv=p=0",
                            str(stored)], capture_output=True, text=True).stdout.split()
    assert probe[0] == "mp3" and 2.8 < float(probe[1]) < 3.3  # same length as the song: lyrics stay in sync
    assert 55 < max(p for p in progress if p < 92) <= 90   # Demucs's own progress bar was followed
    assert progress == sorted(progress)
    assert not any((tmp_path / "work").iterdir())  # temporary files removed


def test_missing_demucs_is_reported(fake_sb, project, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker import audio_tools
    from karaokesync.worker.instrumental import run_instrumental

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    monkeypatch.setattr(audio_tools.importlib.util, "find_spec", lambda name: None)
    song = tmp_path / "s.mp3"
    song.write_bytes(b"x")
    fake_sb.put_object("audio", project["audio_path"], song)
    job = fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                               "user_id": project["user_id"]})
    with pytest.raises(PipelineError) as err:
        run_instrumental(job, fake_sb, settings, lambda p: None)
    assert err.value.code == "ai_dependencies_missing" and not err.value.retryable


def test_failed_separation_is_not_retried(fake_sb, project, fake_demucs, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.instrumental import run_instrumental

    (fake_demucs / "__main__.py").write_text("import sys; sys.exit(3)")
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    song = tmp_path / "s.mp3"
    song.write_bytes(b"x")
    fake_sb.put_object("audio", project["audio_path"], song)
    job = fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                               "user_id": project["user_id"]})
    with pytest.raises(PipelineError) as err:
        run_instrumental(job, fake_sb, settings, lambda p: None)
    assert err.value.code == "separation_failed"


def test_separation_timeout_kills_a_hung_demucs(fake_demucs, tmp_path):
    from karaokesync.worker.audio_tools import separate_stems

    (fake_demucs / "__main__.py").write_text("import time; time.sleep(60)")
    with pytest.raises(PipelineError) as err:
        separate_stems(tmp_path / "s.mp3", tmp_path / "out", "htdemucs", timeout=1)
    assert err.value.code == "separation_timeout"


def test_retention_removes_old_tracks(fake_sb, project, tmp_path):
    from karaokesync.config import get_settings
    from karaokesync.worker.cleanup import run_retention

    now = datetime.now(timezone.utc)
    for name, age in (("old", 40), ("new", 1)):
        job = fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                                   "user_id": project["user_id"], "status": "succeeded",
                                                   "output_path": f"u/p/{name}.mp3"})
        next(r for r in fake_sb.tables["instrumental_jobs"] if r["id"] == job["id"])["created_at"] = (now - timedelta(days=age)).isoformat()
        fake_sb.put_object("audio", f"u/p/{name}.mp3", Path(tmp_path / name))
    run_retention(fake_sb, get_settings(), now)
    assert "u/p/old.mp3" not in fake_sb.objects["audio"] and "u/p/new.mp3" in fake_sb.objects["audio"]
    assert sorted(str(r["output_path"]) for r in fake_sb.tables["instrumental_jobs"]) == ["None", "u/p/new.mp3"]


# ------------------------------------------------------------------ export
def test_export_without_vocals_needs_the_track(client, fake_sb, project):
    from .test_exports import HE

    for i, line in enumerate(HE):
        l = fake_sb.insert("lyric_lines", {"project_id": project["id"], "line_index": i, "start_ms": line["start_ms"], "end_ms": line["end_ms"]})
        for j, w in enumerate(line["words"]):
            fake_sb.insert("lyric_words", {"project_id": project["id"], "line_id": l["id"], "word_index": i * 10 + j, **w})
    url = f"/projects/{project['id']}/exports"
    resp = client.post(url, json={"audio": "instrumental"}, headers=AUTH)
    assert resp.status_code == 409 and resp.json()["detail"] == "instrumental_not_ready"
    fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                         "user_id": project["user_id"], "status": "succeeded", "output_path": "u/p/i.mp3"})
    resp = client.post(url, json={"audio": "instrumental"}, headers=AUTH)
    assert resp.status_code == 201 and resp.json()["options"]["audio"] == "instrumental"
    assert client.post(url, json={"audio": "karaoke"}, headers=AUTH).status_code == 422


def mean_volume(path: Path) -> float:
    out = subprocess.run(["ffmpeg", "-nostdin", "-i", str(path), "-vn", "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(out.split("mean_volume:")[1].split("dB")[0])


@needs_ffmpeg
def test_video_without_vocals_uses_the_melody_only_track(fake_sb, project, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.export_pipeline import run_export

    from .test_exports import HE, SYSTEM_FONT

    if SYSTEM_FONT is None:
        pytest.skip("no font with Hebrew glyphs")
    monkeypatch.setattr("karaokesync.worker.export_pipeline.ensure_font", lambda family: SYSTEM_FONT)
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    for i, line in enumerate(HE):
        l = fake_sb.insert("lyric_lines", {"project_id": project["id"], "line_index": i, "start_ms": line["start_ms"], "end_ms": line["end_ms"]})
        for j, w in enumerate(line["words"]):
            fake_sb.insert("lyric_words", {"project_id": project["id"], "line_id": l["id"], "word_index": i * 10 + j, **w})
    fake_sb.put_object("audio", project["audio_path"], make_audio(tmp_path, "mp3", 3))  # the song: a loud tone
    silence = tmp_path / "instr.mp3"
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-t", "3", str(silence)], check=True)
    fake_sb.put_object("audio", "u/p/instr.mp3", silence)
    fake_sb.insert("instrumental_jobs", {"project_id": project["id"], "audio_file_id": project["audio_id"],
                                         "user_id": project["user_id"], "status": "succeeded", "output_path": "u/p/instr.mp3"})

    def render(audio_choice: str) -> float:
        job = fake_sb.insert("export_jobs", {"project_id": project["id"], "user_id": project["user_id"], "format": "mp4",
                                             "options": {"aspect": "16:9", "resolution": 720, "audio": audio_choice}})
        return mean_volume(fake_sb.objects["exports"][run_export(job, fake_sb, settings, lambda p: None)])

    assert render("original") > -30
    fake_sb.tables["export_jobs"].clear()
    assert render("instrumental") < -80  # the silent melody-only track, not the song


# ------------------------------------------------------------------ cancel
def test_cancel_stops_waiting_and_running_requests(client, fake_sb, project):
    url = f"/projects/{project['id']}/instrumental"
    job = client.post(url, headers=AUTH).json()
    assert client.delete(url, headers={"Authorization": "Bearer bob-token"}).status_code == 404
    assert client.delete(url, headers=AUTH).status_code == 204
    row = fake_sb.tables["instrumental_jobs"][0]
    assert row["status"] == "cancelled" and row["locked_by"] is None
    # A finished track is not touched, and asking again starts a new request.
    assert client.post(url, headers=AUTH).json()["id"] != job["id"]


@needs_ffmpeg
def test_worker_stops_demucs_when_the_request_is_cancelled(fake_sb, project, fake_demucs, tmp_path, monkeypatch):
    """Through the real worker code: the heartbeat is refused once the job is
    cancelled, Demucs is killed within seconds, and nothing is saved."""
    import time

    from karaokesync.config import get_settings
    from karaokesync.worker import runner

    # A slow Demucs: 100 progress steps over ~20 s.
    (fake_demucs / "__main__.py").write_text(
        "import sys, time\n"
        "for p in range(1, 101):\n"
        "    sys.stderr.write(f'\\r {p}%|##| {p}/100'); sys.stderr.flush(); time.sleep(0.2)\n"
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    fake_sb.put_object("audio", project["audio_path"], make_audio(tmp_path, "mp3", 1))
    calls = []

    def rpc(fn, args):
        calls.append(fn)
        return False if fn == "heartbeat_instrumental_job" else True  # cancelled: "you no longer own this job"

    monkeypatch.setattr(fake_sb, "rpc", rpc)
    job = {"id": "abcdef01-0000-0000-0000-000000000000", "project_id": project["id"], "audio_file_id": project["audio_id"],
           "user_id": project["user_id"], "attempts": 1}
    started = time.monotonic()
    runner._run_instrumental(fake_sb, settings, "w1", job)
    assert time.monotonic() - started < 8  # stopped long before the 20 s run would end
    assert "complete_instrumental_job" not in calls and "fail_instrumental_job" not in calls
    assert not any(p.startswith(f"{project['user_id']}/{project['id']}/instrumental") for p in fake_sb.objects["audio"])
    assert not any((tmp_path / "work").iterdir())
