"""The opening of a video: intro clip, 3D title card and transitions."""

import re
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

from karaokesync.exports import opening as op
from karaokesync.exports import video
from karaokesync.exports.ass import Canvas, build_ass
from karaokesync.exports.measure import measurer_for
from karaokesync.styles import SubtitleStyle

from .conftest import needs_ffmpeg
from .test_exports import AUTH, SYSTEM_FONT, ready_project  # noqa: F401 - fixture

ROOT = Path(__file__).resolve().parents[2]


def test_plans():
    both = op.plan_opening(op.OpeningOptions(intro=True, title=op.TitleCard(song="שיר"), transition="radial"))
    assert both.segments == [("intro", 8000), ("title", 5000)]
    assert both.karaoke_start_ms == 8000 + 5000 - 1000 - 1000 and both.head_ms == 1000
    intro_only = op.plan_opening(op.OpeningOptions(intro=True, transition="none"))
    assert intro_only.karaoke_start_ms == 8000 - op.CUT_MS and intro_only.head_ms == op.CUT_MS
    assert not op.OpeningOptions().active


def test_options_are_checked():
    with pytest.raises(ValidationError):
        op.OpeningOptions(transition="explode")
    with pytest.raises(ValidationError):
        op.TitleCard(song="")
    assert op.TitleCard(song="  שיר \n חדש ", artist=" זמר ").song == "שיר חדש"
    assert set(op.TRANSITIONS) >= {"none", "fade", "circleopen", "pixelize", "zoomin", "radial"}
    assert len(op.TRANSITIONS) >= 15


def test_title_card_subtitles():
    m = measurer_for(str(SYSTEM_FONT))
    ass = op.title_ass(op.TitleCard(song="ירושלים {של} זהב", artist="נעמי שמר"), Canvas(1920, 1080), m, m, "he")
    assert "ירושלים ｛של｝ זהב" in ass and "{של}" not in ass   # typed text never becomes ASS codes
    assert "נעמי שמר" in ass
    song_lines = [l for l in ass.splitlines() if l.startswith("Dialogue:") and "ירושלים" in l]
    assert len(song_lines) == 1 + 16 + 1 + 1 + 1   # shadow + extrusion, face, light half, light sweep
    assert "‏" in ass   # right-to-left mark for Hebrew
    no_artist = op.title_ass(op.TitleCard(song="Song"), Canvas(1280, 720), m, m, "en")
    assert sum("Dialogue:" in l for l in no_artist.splitlines()) == len(song_lines) + 1   # + the gold line


def test_a_very_long_title_is_made_smaller():
    m = measurer_for(str(SYSTEM_FONT))
    ass = op.title_ass(op.TitleCard(song="מילה " * 20), Canvas(1280, 720), m, m, "he")
    size = float(re.search(r"Style: T,[^,]+,([\d.]+)", ass).group(1))
    assert m.width(("מילה " * 20).strip(), size) <= 1280 * 0.85


def test_missing_clips_are_reported(monkeypatch, tmp_path):
    from karaokesync.worker.errors import PipelineError

    monkeypatch.setattr(op, "INTRO_DIR", tmp_path)
    with pytest.raises(PipelineError) as err:
        op.opening_files(op.OpeningOptions(intro=True), "16:9")
    assert err.value.code == "opening_missing"


def test_the_committed_clips():
    for name in [*op.INTRO_FILES.values(), op.BACKDROP_FILE]:
        assert (op.INTRO_DIR / name).is_file(), name
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration",
                            "-of", "json", str(op.intro_file("16:9"))], capture_output=True, text=True, check=True).stdout
    assert '"audio"' in probe and '"width": 1280' in probe
    assert abs(float(re.search(r'"duration": "([\d.]+)"', probe).group(1)) - op.INTRO_MS / 1000) < 0.1


def _fake_clips(folder: Path) -> None:
    """Stand-ins for the intro (red, with a 300 Hz sound) and the title backdrop (blue)."""
    folder.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=8",
                    "-f", "lavfi", "-i", "sine=f=300:d=8", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    str(folder / "intro.mp4")], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=10",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(folder / op.BACKDROP_FILE)], check=True)


@needs_ffmpeg
def test_a_video_with_intro_title_and_transitions(tmp_path, monkeypatch):
    clips = tmp_path / "intro"
    _fake_clips(clips)
    monkeypatch.setattr(op, "INTRO_DIR", clips)
    song = tmp_path / "song.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=1000:d=6", str(song)], check=True)
    canvas = Canvas(640, 360)
    m = measurer_for(str(SYSTEM_FONT))
    lines = [{"start_ms": 500, "end_ms": 5000, "words": [{"text": "שלום", "start_ms": 500, "end_ms": 2000},
                                                         {"text": "עולם", "start_ms": 2100, "end_ms": 5000}]}]
    style = SubtitleStyle(background_color="#00ff00", background_color2="#00ff00")
    options = op.OpeningOptions(intro=True, title=op.TitleCard(song="שיר בדיקה", artist="זמרת"), transition="circleopen")
    work = tmp_path / "w"
    work.mkdir()
    out = video.render_mp4(work, song, build_ass(lines, style, "he", canvas, m), SYSTEM_FONT, style, canvas, 6000,
                           opening=options, aspect="16:9", title_subs=op.title_ass(options.title, canvas, m, m, "he"),
                           extra_fonts=[SYSTEM_FONT], workers=2)
    start = op.plan_opening(options).karaoke_start_ms / 1000   # 11 s

    duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
                                    capture_output=True, text=True).stdout)
    assert abs(duration - (start + 6)) < 0.15

    def color(t):
        px = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", str(t), "-i", str(out), "-frames:v", "1",
                             "-vf", "crop=8:8:4:4,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            capture_output=True, check=True).stdout
        return tuple(px)

    r, g, b = color(3.0)
    assert r > 150 and g < 80 and b < 80, "the intro first"
    r, g, b = color(9.0)
    assert b > 150 and r < 80, "then the title card"
    r, g, b = color(start + 3.0)
    assert g > 150 and r < 80 and b < 80, "then the karaoke"

    def level(t0, t1, freq):
        res = subprocess.run(["ffmpeg", "-nostdin", "-ss", str(t0), "-t", str(t1 - t0), "-i", str(out), "-af",
                              f"bandpass=f={freq}:w=60,volumedetect", "-f", "null", "-"], capture_output=True, text=True)
        return float(re.search(r"mean_volume: (-?[\d.]+) dB", res.stderr).group(1))

    assert level(1, 7, 1000) < -45, "the song does not start during the intro"
    assert level(start + 0.5, start + 5, 1000) > -30, "the song plays with the karaoke"
    assert level(1, 7, 300) > -30, "the intro has its own sound"


def test_the_api_keeps_the_choice(client, ready_project):  # noqa: F811
    pid = ready_project["id"]
    body = {"aspect": "16:9", "opening": {"intro": True, "transition": "pixelize", "title": {"song": "שיר", "artist": "זמר"}}}
    job = client.post(f"/projects/{pid}/exports", json=body, headers=AUTH).json()
    assert job["options"]["opening"] == {"intro": True, "transition": "pixelize", "title": {"song": "שיר", "artist": "זמר"}}
    bad = {"opening": {"intro": True, "transition": "spin"}}
    assert client.post(f"/projects/{pid}/exports", json=bad, headers=AUTH).status_code == 422


def test_previews_are_short_jobs_with_their_own_allowance(client, fake_sb, ready_project, monkeypatch):  # noqa: F811
    from karaokesync.config import get_settings

    pid = ready_project["id"]
    monkeypatch.setattr(get_settings(), "max_exports_per_day", 1)
    monkeypatch.setattr(get_settings(), "max_previews_per_day", 2)
    body = {"aspect": "9:16", "resolution": 1080, "preview": True, "opening": {"intro": True}}
    job = client.post(f"/projects/{pid}/exports", json=body, headers=AUTH).json()
    assert job["options"]["preview"] is True and job["options"]["resolution"] == 480
    fake_sb.update("export_jobs", {"id": f"eq.{job['id']}"}, {"status": "succeeded"})
    # a preview does not use up the day's real export
    real = client.post(f"/projects/{pid}/exports", json={"aspect": "9:16"}, headers=AUTH)
    assert real.status_code == 201 and "preview" not in real.json()["options"]
    fake_sb.update("export_jobs", {"id": f"eq.{real.json()['id']}"}, {"status": "succeeded"})
    assert client.post(f"/projects/{pid}/exports", json={}, headers=AUTH).json()["detail"] == "daily_export_limit"
    second = client.post(f"/projects/{pid}/exports", json=body, headers=AUTH).json()
    fake_sb.update("export_jobs", {"id": f"eq.{second['id']}"}, {"status": "succeeded"})
    assert client.post(f"/projects/{pid}/exports", json=body, headers=AUTH).json()["detail"] == "daily_preview_limit"


@needs_ffmpeg
def test_the_worker_makes_a_short_small_preview(fake_sb, ready_project, tmp_path, monkeypatch):  # noqa: F811
    import json

    from karaokesync.config import get_settings
    from karaokesync.worker.export_pipeline import run_export

    from .conftest import make_audio

    clips = tmp_path / "intro"
    _fake_clips(clips)
    monkeypatch.setattr(op, "INTRO_DIR", clips)
    monkeypatch.setattr(op, "PREVIEW_SONG_MS", 4000)
    monkeypatch.setattr("karaokesync.worker.export_pipeline.PREVIEW_SONG_MS", 4000)
    monkeypatch.setattr("karaokesync.worker.export_pipeline.ensure_font", lambda family: SYSTEM_FONT)
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    audio = fake_sb.tables["audio_files"][0]
    audio["duration_ms"] = 9000
    fake_sb.put_object("audio", audio["storage_path"], make_audio(tmp_path, "mp3", 9))
    job = fake_sb.insert("export_jobs", {"project_id": ready_project["id"], "user_id": ready_project["user_id"], "format": "mp4",
                                         "options": {"aspect": "16:9", "resolution": 480, "preview": True,
                                                     "opening": {"intro": True, "transition": "fade", "title": None}}})
    path = run_export(job, fake_sb, settings, lambda p: None)
    assert path.endswith(f"{job['id']}-preview.mp4")
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=height:format=duration", "-of", "json",
                                      str(fake_sb.objects["exports"][path])], capture_output=True, text=True).stdout)
    assert info["streams"][0]["height"] == 480
    assert abs(float(info["format"]["duration"]) - (7.0 + 4.0)) < 0.2   # the intro (8 s - 1 s blend) + 4 s of the song
    # a real export never accepts 480p
    job["options"].pop("preview")
    with pytest.raises(Exception):
        run_export(job, fake_sb, settings, lambda p: None)


def test_an_old_worker_is_reported_before_queueing(client, fake_sb, ready_project):  # noqa: F811
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    fake_sb.tables["workers"] = [{"id": "pc", "version": "2026-11-14 (remote control)", "last_seen": now, "activity": "idle"}]
    pid = ready_project["id"]
    r = client.post(f"/projects/{pid}/exports", json={"preview": True}, headers=AUTH)
    assert r.status_code == 409 and r.json()["detail"] == "worker_outdated"
    r = client.post(f"/projects/{pid}/exports", json={"opening": {"intro": True}}, headers=AUTH)
    assert r.json()["detail"] == "worker_outdated"
    # a plain export still works with the old worker
    assert client.post(f"/projects/{pid}/exports", json={}, headers=AUTH).status_code == 201
    fake_sb.tables["export_jobs"].clear()
    # once an up-to-date worker is online, previews go through
    from karaokesync.worker.runner import WORKER_VERSION

    fake_sb.tables["workers"].append({"id": "pc2", "version": WORKER_VERSION, "last_seen": now, "activity": "idle"})
    assert client.post(f"/projects/{pid}/exports", json={"preview": True}, headers=AUTH).status_code == 201


def test_every_worker_error_has_a_message():
    import re as _re

    codes = set()
    for f in (ROOT / "server" / "karaokesync").rglob("*.py"):
        codes |= set(_re.findall(r'PipelineError\("([a-z_]+)"', f.read_text(encoding="utf-8")))
    he = (ROOT / "web" / "src" / "i18n" / "he.ts").read_text(encoding="utf-8")
    missing = sorted(c for c in codes if f"'error.{c}'" not in he)
    assert not missing, f"no Hebrew message for: {missing}"
