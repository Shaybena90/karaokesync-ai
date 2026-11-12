"""Video backgrounds: upload/verify/delete API, validation with real files, retention."""

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from karaokesync.media_validation import media_format_of, sniff_media

from .conftest import needs_ffmpeg

AUTH = {"Authorization": "Bearer alice-token"}
BOB = {"Authorization": "Bearer bob-token"}


def make_media(tmp_path: Path, name: str, seconds: float = 1.0, size: str = "64x36") -> Path:
    """Real files made by FFmpeg: an animated GIF, videos, still images."""
    out = tmp_path / name
    ext = name.rsplit(".", 1)[1]
    src = ["-f", "lavfi", "-i", f"testsrc=size={size}:rate=10:duration={seconds}"]
    extra = {"gif": [], "mp4": ["-c:v", "libx264", "-pix_fmt", "yuv420p"], "mov": ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
             "webm": ["-c:v", "libvpx", "-b:v", "200k"], "png": ["-frames:v", "1"], "jpg": ["-frames:v", "1"]}[ext]
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", *src, *extra, str(out)], check=True)
    return out


@pytest.fixture
def project(fake_sb):
    alice = fake_sb.add_user("alice-token")
    fake_sb.add_user("bob-token")
    return fake_sb.insert("projects", {"user_id": alice.id, "title": "שיר", "status": "ready", "language": "he"})


def upload(client, fake_sb, project, local: Path, name: str | None = None) -> dict:
    """Init + "upload" (the fake storage keeps the real file) + complete."""
    name = name or local.name
    init = client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": name, "size_bytes": local.stat().st_size},
                       headers=AUTH)
    assert init.status_code == 201, init.text
    fake_sb.put_object("backgrounds", init.json()["media"]["storage_path"], local)
    done = client.post(f"/backgrounds/{init.json()['media']['id']}/complete", headers=AUTH)
    assert done.status_code == 200, done.text
    return done.json()


# -------------------------------------------------------------- validation
def test_formats_and_magic_bytes():
    assert media_format_of("loop.GIF") == "gif" and media_format_of("a.jpeg") == "jpg" and media_format_of("x.m4v") == "mp4"
    assert media_format_of("evil.exe") is None and media_format_of("noext") is None
    assert sniff_media(b"GIF89a....") == {"gif"}
    assert sniff_media(b"\x00\x00\x00\x18ftypisom") == {"mp4", "mov"}
    assert sniff_media(b"MZ\x90\x00") == set()


# --------------------------------------------------------------------- API
def test_init_gives_a_private_upload(client, fake_sb, project):
    resp = client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": "לולאה.gif", "size_bytes": 1000}, headers=AUTH)
    assert resp.status_code == 201
    body = resp.json()
    assert body["content_type"] == "image/gif"
    assert body["media"]["storage_path"].startswith(f"{project['user_id']}/{project['id']}/")
    assert body["media"]["storage_path"].endswith(".gif") and body["media"]["status"] == "pending"


@pytest.mark.parametrize("body,status,code", [
    ({"file_name": "x.exe", "size_bytes": 10}, 415, "unsupported_background"),
    ({"file_name": "x.gif", "size_bytes": 31 * 1024 * 1024}, 413, "background_too_large"),
])
def test_init_rejects_bad_files(client, project, body, status, code):
    resp = client.post(f"/projects/{project['id']}/backgrounds", json=body, headers=AUTH)
    assert resp.status_code == status and resp.json()["detail"] == code


def test_only_the_owner(client, fake_sb, project):
    assert client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": "a.gif", "size_bytes": 1},
                       headers=BOB).status_code == 404
    media = client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": "a.gif", "size_bytes": 1},
                        headers=AUTH).json()["media"]
    assert client.post(f"/backgrounds/{media['id']}/complete", headers=BOB).status_code == 404
    assert client.delete(f"/backgrounds/{media['id']}", headers=BOB).status_code == 404
    assert client.delete("/backgrounds/not-a-uuid", headers=AUTH).status_code == 404


@needs_ffmpeg
@pytest.mark.parametrize("name,kind", [("loop.gif", "video"), ("clip.mp4", "video"), ("clip.mov", "video"),
                                       ("clip.webm", "video"), ("still.png", "image"), ("photo.jpg", "image")])
def test_real_files_are_verified(client, fake_sb, project, tmp_path, name, kind):
    media = upload(client, fake_sb, project, make_media(tmp_path, name, seconds=2))
    assert media["status"] == "verified" and media["kind"] == kind
    assert media["width"] == 64 and media["height"] == 36
    if kind == "video":
        assert 1500 < media["duration_ms"] < 2600
    else:
        assert media["duration_ms"] is None


@needs_ffmpeg
def test_fake_and_mismatched_files_are_rejected(client, fake_sb, project, tmp_path):
    text = tmp_path / "x.gif"
    text.write_text("not a picture at all")
    media = upload(client, fake_sb, project, text)
    assert media["status"] == "rejected" and media["error_code"] == "not_media"
    assert fake_sb.objects["backgrounds"] == {}  # the file is removed

    mp4 = make_media(tmp_path, "clip.mp4")
    media = upload(client, fake_sb, project, mp4, name="pretend.gif")
    assert media["status"] == "rejected" and media["error_code"] == "format_mismatch"


@needs_ffmpeg
def test_long_videos_are_rejected(client, fake_sb, project, tmp_path):
    media = upload(client, fake_sb, project, make_media(tmp_path, "long.mp4", seconds=61, size="16x16"))
    assert media["status"] == "rejected" and media["error_code"] == "media_too_long"


def test_limit_per_project(client, fake_sb, project, monkeypatch):
    from karaokesync.config import get_settings

    monkeypatch.setattr(get_settings(), "max_backgrounds_per_project", 2)
    url = f"/projects/{project['id']}/backgrounds"
    for _ in range(2):
        assert client.post(url, json={"file_name": "a.gif", "size_bytes": 1}, headers=AUTH).status_code == 201
    resp = client.post(url, json={"file_name": "a.gif", "size_bytes": 1}, headers=AUTH)
    assert resp.status_code == 429 and resp.json()["detail"] == "too_many_backgrounds"


def test_delete_background_and_project(client, fake_sb, project, tmp_path):
    first = client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": "a.gif", "size_bytes": 1}, headers=AUTH).json()
    second = client.post(f"/projects/{project['id']}/backgrounds", json={"file_name": "b.gif", "size_bytes": 1}, headers=AUTH).json()
    for m in (first, second):
        fake_sb.put_object("backgrounds", m["media"]["storage_path"], tmp_path / "x")
    assert client.delete(f"/backgrounds/{first['media']['id']}", headers=AUTH).status_code == 204
    assert list(fake_sb.objects["backgrounds"]) == [second["media"]["storage_path"]]
    assert [m["id"] for m in fake_sb.tables["background_media"]] == [second["media"]["id"]]
    # Deleting the project removes its backgrounds too.
    assert client.delete(f"/projects/{project['id']}", headers=AUTH).status_code == 204
    assert fake_sb.objects["backgrounds"] == {} and fake_sb.tables["background_media"] == []


def test_retention_removes_old_and_abandoned_backgrounds(fake_sb, project, tmp_path):
    from karaokesync.config import get_settings
    from karaokesync.worker.cleanup import run_retention

    now = datetime.now(timezone.utc)
    rows = [("old", "verified", now - timedelta(days=40)), ("stuck", "pending", now - timedelta(days=2)),
            ("fresh", "verified", now - timedelta(days=1))]
    for name, state, created in rows:
        m = fake_sb.insert("background_media", {"project_id": project["id"], "user_id": project["user_id"],
                                                "storage_path": f"u/p/{name}.gif", "status": state})
        m_row = next(r for r in fake_sb.tables["background_media"] if r["id"] == m["id"])
        m_row["created_at"] = created.isoformat()
        fake_sb.put_object("backgrounds", f"u/p/{name}.gif", tmp_path / name)
    run_retention(fake_sb, get_settings(), now)
    assert list(fake_sb.objects["backgrounds"]) == ["u/p/fresh.gif"]
    assert [r["storage_path"] for r in fake_sb.tables["background_media"]] == ["u/p/fresh.gif"]


def test_style_keeps_only_valid_clips():
    from karaokesync.styles import parse_style

    mid = "0b4f8f5e-3c1d-4b8a-9e2f-123456789abc"
    s = parse_style({"preset": "neon", "backgrounds": [{"media_id": mid, "start_ms": 1000, "end_ms": 5000},
                                                       {"media_id": "bad"}, "x", {"media_id": mid, "start_ms": -5}]})
    assert s.preset == "neon" and [c.model_dump() for c in s.backgrounds] == [
        {"media_id": mid, "start_ms": 1000, "end_ms": 5000}]
    assert parse_style({"backgrounds": "nope"}).backgrounds == []
    # A broken field elsewhere does not lose the backgrounds.
    assert len(parse_style({"size": 9999, "backgrounds": [{"media_id": mid}]}).backgrounds) == 1
    clip = s.backgrounds[0]
    assert clip.window(60_000) == (1000, 5000) and clip.window(800) is None


def pixel(video: Path, t: float) -> tuple[int, int, int]:
    """Average colour of a small patch near the top-left corner at time t."""
    out = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", str(t), "-i", str(video), "-frames:v", "1",
                          "-vf", "crop=w=8:h=8:x=8:y=8,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                         capture_output=True, check=True).stdout
    return out[0], out[1], out[2]


def solid(tmp_path: Path, name: str, color: str, seconds: float | None = None) -> Path:
    out = tmp_path / name
    src = f"color=c={color}:s=32x32" + (f":d={seconds}:r=10" if seconds else "")
    extra = [] if seconds else ["-frames:v", "1"]
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", src, *extra, str(out)], check=True)
    return out


@needs_ffmpeg
def test_video_export_shows_backgrounds_only_in_their_ranges(fake_sb, project, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.export_pipeline import run_export

    from .conftest import make_audio
    from .test_exports import HE, SYSTEM_FONT

    if SYSTEM_FONT is None:
        pytest.skip("no font with Hebrew glyphs")
    monkeypatch.setattr("karaokesync.worker.export_pipeline.ensure_font", lambda family: SYSTEM_FONT)
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    pid, uid = project["id"], project["user_id"]
    fake_sb.insert("audio_files", {"project_id": pid, "user_id": uid, "storage_path": "a.mp3", "status": "verified",
                                   "duration_ms": 6000})
    fake_sb.put_object("audio", "a.mp3", make_audio(tmp_path, "mp3", 6))
    for i, line in enumerate(HE):
        l = fake_sb.insert("lyric_lines", {"project_id": pid, "line_index": i, "start_ms": line["start_ms"], "end_ms": line["end_ms"]})
        for j, w in enumerate(line["words"]):
            fake_sb.insert("lyric_words", {"project_id": pid, "line_id": l["id"], "word_index": i * 10 + j, **w})

    def media(name: str, file: Path, kind: str, project_id: str = pid) -> str:
        row = fake_sb.insert("background_media", {"project_id": project_id, "user_id": uid, "storage_path": f"{uid}/{name}",
                                                  "format": name.rsplit(".", 1)[1], "status": "verified", "kind": kind})
        fake_sb.put_object("backgrounds", f"{uid}/{name}", file)
        return row["id"]

    green_gif = media("g.gif", solid(tmp_path, "g.gif", "0x00ff00", seconds=0.5), "video")  # loops 0.5 s clip
    red_png = media("r.png", solid(tmp_path, "r.png", "0xff0000"), "image")
    other = fake_sb.insert("projects", {"user_id": uid, "title": "אחר", "status": "ready"})
    foreign = media("x.png", solid(tmp_path, "x.png", "0xffffff"), "image", project_id=other["id"])

    style = {"preset": "classic", "background_color": "#000080", "background_color2": "#000080", "backgrounds": [
        {"media_id": green_gif, "start_ms": 1000, "end_ms": 3000},
        {"media_id": red_png, "start_ms": 4000, "end_ms": None},
        {"media_id": foreign, "start_ms": None, "end_ms": None},  # another project's file: ignored
    ]}
    job = fake_sb.insert("export_jobs", {"project_id": pid, "user_id": uid, "format": "mp4",
                                         "options": {"aspect": "16:9", "resolution": 720, "style": style}})
    path = run_export(job, fake_sb, settings, lambda p: None)
    video = fake_sb.objects["exports"][path]

    def near(rgb, target):
        return all(abs(a - b) < 40 for a, b in zip(rgb, target))

    assert near(pixel(video, 0.5), (0, 0, 128))     # base colour before the first range
    assert near(pixel(video, 1.2), (0, 255, 0))     # the GIF
    assert near(pixel(video, 2.8), (0, 255, 0))     # still there after several loops
    assert near(pixel(video, 3.5), (0, 0, 128))     # range ended
    assert near(pixel(video, 5.0), (255, 0, 0))     # image until the end of the song
    assert not fake_sb.objects["backgrounds"] == {}  # source files untouched
    assert not any((tmp_path / "work").iterdir())    # temp files removed


def test_project_delete_works_before_the_backgrounds_migration(client, fake_sb, project, monkeypatch):
    from karaokesync.supabase_client import SupabaseError

    real = fake_sb.list_objects

    def no_bucket(bucket, prefix):
        if bucket == "backgrounds":
            raise SupabaseError(400, "Bucket not found")
        return real(bucket, prefix)

    monkeypatch.setattr(fake_sb, "list_objects", no_bucket)
    assert client.delete(f"/projects/{project['id']}", headers=AUTH).status_code == 204
    assert fake_sb.tables["projects"] == []


# ------------------------------------------------------------ size limit
def test_bitrate_budget_fits_the_storage_limit():
    from karaokesync.exports.video import bitrates_for

    video, audio = bitrates_for(240_000, 48 * 1024 * 1024)  # a 4-minute song, 48 MB
    assert audio == 128 and 1300 < video < 1450
    total_bytes = (video + audio) * 1000 / 8 * 240
    assert total_bytes < 48 * 1024 * 1024 * 0.92
    assert bitrates_for(240_000, None) is None
    assert bitrates_for(3_600_000, 48 * 1024 * 1024)[0] == 150  # a floor, so text stays readable


def test_storage_too_large_error_is_recognised():
    import httpx

    from karaokesync.supabase_client import SupabaseClient, SupabaseError

    resp = httpx.Response(400, json={"statusCode": "413", "error": "Payload too large",
                                     "message": "The object exceeded the maximum allowed size"},
                          request=httpx.Request("POST", "https://x.supabase.co/storage/v1/object/exports/a.mp4"))
    with pytest.raises(SupabaseError) as err:
        SupabaseClient._raise_for(resp)
    assert err.value.status_code == 413 and err.value.path == "/storage/v1/object/exports/a.mp4"


@needs_ffmpeg
def test_video_with_a_busy_background_stays_under_the_limit(tmp_path):
    from karaokesync.exports.ass import Canvas
    from karaokesync.exports.video import BackgroundLayer, render_mp4
    from karaokesync.styles import SubtitleStyle

    from .conftest import make_audio
    from .test_exports import SYSTEM_FONT

    if SYSTEM_FONT is None:
        pytest.skip("no font")
    busy = tmp_path / "busy.mp4"  # noise: the hardest thing to compress
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi",
                    "-i", "testsrc2=s=640x360:r=30,noise=alls=40:allf=t", "-t", "2", "-c:v", "libx264", "-crf", "18", str(busy)],
                   check=True)
    ass = "[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\n" \
          "Format: Name, Fontname, Fontsize\nStyle: Default,DejaVu Sans,40\n\n[Events]\n" \
          "Format: Layer, Start, End, Style, Text\nDialogue: 0,0:00:00.00,0:00:06.00,Default,hello\n"
    limit = 600 * 1024
    workdir = tmp_path / "w"
    workdir.mkdir()
    out = render_mp4(workdir, make_audio(tmp_path, "mp3", 6), ass, SYSTEM_FONT, SubtitleStyle(), Canvas(1280, 720), 6000,
                     backgrounds=[BackgroundLayer(busy, "video", 0, 6000)], max_bytes=limit)
    assert out.stat().st_size <= limit


@needs_ffmpeg
def test_parallel_parts_match_a_single_render(tmp_path, monkeypatch):
    """The video is rendered in parts side by side; joined, it must be the same
    video: same length, subtitles at the same moments, and a looping GIF that
    continues across the seams instead of restarting."""
    from karaokesync.exports import video
    from karaokesync.exports.ass import Canvas, build_ass
    from karaokesync.exports.measure import measurer_for
    from karaokesync.styles import SubtitleStyle

    from .conftest import make_audio
    from .test_exports import SYSTEM_FONT

    if SYSTEM_FONT is None:
        pytest.skip("no font")
    # Red for 0.3 s, then green for 0.4 s: a wrong loop position shows as a wrong colour.
    gif = tmp_path / "rg.gif"
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x36:r=10:d=0.3",
                    "-f", "lavfi", "-i", "color=c=0x00ff00:s=64x36:r=10:d=0.4", "-filter_complex", "[0][1]concat=n=2:v=1",
                    str(gif)], check=True)
    lines = [{"start_ms": t, "end_ms": t + 900, "words": [{"text": "שלום", "start_ms": t, "end_ms": t + 400},
                                                           {"text": "עולם", "start_ms": t + 450, "end_ms": t + 900}]}
             for t in range(500, 8000, 1500)]
    canvas = Canvas(640, 360)
    ass = build_ass(lines, SubtitleStyle(), "he", canvas, measurer_for(str(SYSTEM_FONT)))
    song = make_audio(tmp_path, "mp3", 8)
    layers = [video.BackgroundLayer(gif, "video", 1000, 7000, 700)]
    from karaokesync.exports.video import plan_chunks as real_plan

    monkeypatch.setattr(video, "plan_chunks", lambda d, w: real_plan(d, w, min_chunk_ms=1500))
    assert len(video.plan_chunks(8000, 4)) == 4

    outs = {}
    for workers in (1, 4):
        work = tmp_path / f"w{workers}"
        work.mkdir()
        outs[workers] = video.render_mp4(work, song, ass, SYSTEM_FONT, SubtitleStyle(), canvas, 8000,
                                         backgrounds=layers, workers=workers)

    def duration(p):
        return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                    capture_output=True, text=True).stdout)

    def frame(p, t):
        return subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", str(t), "-i", str(p), "-frames:v", "1",
                               "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
                              capture_output=True, check=True).stdout

    assert abs(duration(outs[1]) - duration(outs[4])) < 0.05
    # Next to every seam (2 s, 4 s, 6 s), at moments in the middle of a red or green
    # stretch of the GIF (on the exact switch, one frame decides the colour).
    for t in (0.6, 1.85, 2.2, 3.95, 4.3, 5.0, 5.7, 6.05, 6.75, 7.5):
        a, b = frame(outs[1], t), frame(outs[4], t)
        diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)
        assert diff < 6, f"frames differ at {t}s (mean difference {diff:.1f})"
