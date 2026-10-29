"""Stage 8: styles, SRT/LRC/ASS generation, burned-in video, export API."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from karaokesync.exports.ass import Canvas, _encode_font, ass_color, ass_time, build_ass, escape_text, line_windows
from karaokesync.exports.measure import TextMeasurer, resolve_directions, visual_order
from karaokesync.exports.text_formats import to_lrc, to_srt
from karaokesync.exports.video import canvas_for, render_mp4
from karaokesync.styles import PRESETS, SubtitleStyle, parse_style

from .conftest import make_audio, needs_ffmpeg

SYSTEM_FONT = next(
    (Path(p) for p in ("fonts/Heebo.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") if Path(p).exists()),
    None,
)
needs_font = pytest.mark.skipif(SYSTEM_FONT is None, reason="no font with Hebrew glyphs found")

HE = [
    {"start_ms": 1000, "end_ms": 2000, "words": [
        {"text": "שלום", "start_ms": 1000, "end_ms": 1400}, {"text": "עולם", "start_ms": 1500, "end_ms": 2000}]},
    {"start_ms": 2500, "end_ms": 3000, "words": [{"text": "שיר", "start_ms": 2500, "end_ms": 3000}]},
]


# ------------------------------------------------------------------ styles
def test_presets_are_valid_and_distinct():
    assert set(PRESETS) == {"classic", "neon", "tiktok"}
    assert PRESETS["tiktok"].animation == "word"
    assert PRESETS["neon"].glow is True


def test_parse_style_is_forgiving():
    assert parse_style(None) == SubtitleStyle()
    assert parse_style({"preset": "neon"}).preset == "neon"
    broken = parse_style({"preset": "tiktok", "size": 9999, "text_color": "red", "font": "Comic Sans", "outline": 2})
    assert broken.size == PRESETS["tiktok"].size  # invalid values fall back to the preset
    assert broken.text_color == "#ffffff" and broken.font == "Heebo"
    assert broken.outline == 2  # valid values are kept
    assert parse_style({"highlight_color": "#ABCDEF"}).highlight_color == "#abcdef"


# ------------------------------------------------------------- SRT / LRC
def test_srt():
    out = to_srt(HE, "he")
    assert out.startswith("1\n00:00:01,000 --> 00:00:02,000\n‏שלום עולם\n")
    assert "2\n00:00:02,500 --> 00:00:03,000\n‏שיר\n" in out
    assert "‏" not in to_srt([{"words": [{"text": "hi", "start_ms": 0, "end_ms": 5}]}], "en")


def test_lrc_word_timestamps():
    out = to_lrc(HE, "he", title="שיר [1]")
    assert out.splitlines()[0] == "[ti:שיר [1)]"
    assert "[00:01.00]‏<00:01.00>שלום <00:01.50>עולם <00:02.00>" in out


# ----------------------------------------------------------------- ASS
def test_ass_primitives():
    assert ass_time(3_723_456) == "1:02:03.46"
    assert ass_color("#38bdf8") == "&H00F8BD38"
    assert ass_color("#000000", 0x80) == "&H80000000"
    assert escape_text(r"a{\b1}b\N") == "a｛⧵b1｝b⧵N"


def test_line_windows_are_contiguous_and_cover_lines():
    lines = [{"start_ms": 1000, "end_ms": 2000}, {"start_ms": 2100, "end_ms": 3000}, {"start_ms": 20000, "end_ms": 21000}]
    w = line_windows(lines)
    assert w[0] == (0, w[1][0]) and w[0][1] <= 2100  # no gap between close lines
    assert w[0][0] <= 1000 and w[1][1] >= 3000
    assert w[1][1] == 4000 and w[2][0] == 18000  # long instrumental gap: blank screen
    assert all(a < b for a, b in w)


def test_word_level_bidi_order():
    assert visual_order(["זה", "שיר", "English", "123"], True) == [2, 3, 1, 0]
    assert visual_order(["Hello", "world,", "שלום", "עולם", "ok"], False) == [0, 1, 3, 2, 4]
    assert resolve_directions(["שלום", "123", "English", "7"], True) == ["R", "R", "L", "L"]


@needs_font
def test_build_ass_structure():
    m = TextMeasurer(SYSTEM_FONT)
    ass = build_ass(HE, PRESETS["classic"], "he", Canvas(1280, 720), m, title="t{x}")
    events = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
    hi = [e for e in events if ",Hi," in e]
    assert len(hi) == 3  # one highlight layer per word
    assert "Title: t｛x｝" in ass
    assert all("‏" in e for e in events)  # RTL mark → libass lays out right-to-left
    assert ",-1\n" in ass.split("[Events]")[0]  # Encoding -1: automatic base direction
    # RTL word: the clip starts at the word's RIGHT edge and grows to the left
    first = hi[0]
    start_clip = first.split("\\clip(")[1].split(")")[0].split(",")
    end_clip = first.split("\\clip(")[2].split(")")[0].split(",")
    assert start_clip[0] == start_clip[2] == end_clip[2]
    assert float(end_clip[0]) < float(end_clip[2])
    # word timing relative to the event start
    assert "\\t(1000,1400," in first or "\\t(" in first

    none = build_ass(HE, PRESETS["classic"].model_copy(update={"animation": "none"}), "he", Canvas(1280, 720), m)
    assert ",Hi," not in none
    word = build_ass(HE, PRESETS["tiktok"], "he", Canvas(720, 1280), m)
    assert "\\t(1000,1020," in word  # instant highlight per word
    assert ",Next," not in word  # TikTok preset hides the next line


def test_font_embedding_round_trip():
    data = bytes(range(256)) * 3 + b"xy"

    def decode(lines):
        text = "".join(lines)
        out = bytearray()
        for i in range(0, len(text), 4):
            group = text[i : i + 4]
            n = 0
            for ch in group.ljust(4, chr(33)):
                n = (n << 6) | (ord(ch) - 33)
            out += n.to_bytes(3, "big")[: len(group) - 1]
        return bytes(out)

    lines = _encode_font(data)
    assert all(len(l) <= 80 for l in lines)
    assert decode(lines) == data


# ------------------------------------------------------- rendered pixels
def _frame_rgb(video_or_ass_cmd: list[str], out: Path) -> tuple[int, int, bytes]:
    subprocess.run(video_or_ass_cmd + ["-f", "image2", "-vcodec", "ppm", str(out)], check=True, capture_output=True)
    data = out.read_bytes()
    parts = data.split(b"\n", 3)
    w, h = map(int, parts[1].split())
    return w, h, parts[3]


def _red_columns(w, h, rgb):
    cols = set()
    for y in range(h):
        for x in range(w):
            r, g, b = rgb[(y * w + x) * 3 : (y * w + x) * 3 + 3]
            if r > 200 and g < 80 and b < 80:
                cols.add(x)
    return cols


@needs_ffmpeg
@needs_font
@pytest.mark.parametrize("lang,words,sung_side", [
    ("he", ["אבגד", "הוזח"], "right"),  # first Hebrew word is on the RIGHT
    ("en", ["Abcd", "Efgh"], "left"),
])
def test_burned_highlight_lands_on_the_sung_word(tmp_path, lang, words, sung_side):
    style = SubtitleStyle(highlight_color="#ff0000", text_color="#ffffff", outline=0, shadow=0, show_next_line=False)
    lines = [{"start_ms": 0, "end_ms": 2000, "words": [
        {"text": words[0], "start_ms": 0, "end_ms": 500}, {"text": words[1], "start_ms": 1500, "end_ms": 2000}]}]
    W, H = 640, 360
    (tmp_path / "fonts").mkdir()
    shutil.copy(SYSTEM_FONT, tmp_path / "fonts" / SYSTEM_FONT.name)
    (tmp_path / "s.ass").write_text(build_ass(lines, style, lang, Canvas(W, H), TextMeasurer(SYSTEM_FONT)), encoding="utf-8")
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r=10:d=2",
           "-vf", "ass=s.ass:fontsdir=fonts,select='eq(n\\,10)'", "-frames:v", "1"]
    subprocess.run(cmd + ["f.ppm"], cwd=tmp_path, check=True, capture_output=True)  # t = 1.0s: word 1 sung, word 2 not
    data = (tmp_path / "f.ppm").read_bytes()
    header, _, rest = data.partition(b"\n")
    dims, _, rest = rest.partition(b"\n")
    _, _, rgb = rest.partition(b"\n")
    w, h = map(int, dims.split())
    red = _red_columns(w, h, rgb)
    assert red, "highlight not rendered"
    if sung_side == "right":
        assert min(red) > W / 2 - 5
    else:
        assert max(red) < W / 2 + 5


@needs_ffmpeg
@needs_font
def test_render_mp4(tmp_path):
    audio = make_audio(tmp_path, "mp3", 2)
    canvas = canvas_for("9:16", 720)
    assert (canvas.width, canvas.height) == (720, 1280)
    assert (canvas_for("16:9", 1080).width, canvas_for("1:1", 720).height) == (1920, 720)
    style = PRESETS["neon"]
    progress = []
    out = render_mp4(tmp_path, audio, build_ass(HE, style, "he", canvas, TextMeasurer(SYSTEM_FONT)), SYSTEM_FONT,
                     style, canvas, 2000, on_progress=progress.append)
    info = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", str(out)],
        capture_output=True, text=True).stdout)
    assert [(s["codec_name"], s.get("width"), s.get("height")) for s in info["streams"]] == [("h264", 720, 1280), ("aac", None, None)]
    assert progress and progress[-1] == pytest.approx(1.0, abs=0.06)


# ------------------------------------------------------------------- API
AUTH = {"Authorization": "Bearer alice-token"}


@pytest.fixture
def ready_project(fake_sb, monkeypatch):
    if SYSTEM_FONT:
        monkeypatch.setattr("karaokesync.api.exports.ensure_font", lambda family: SYSTEM_FONT)
    alice = fake_sb.add_user("alice-token")
    fake_sb.add_user("bob-token")
    project = fake_sb.insert("projects", {"user_id": alice.id, "title": "שיר שלי", "status": "ready", "language": "he",
                                          "style": {"preset": "neon"}})
    fake_sb.insert("audio_files", {"project_id": project["id"], "user_id": alice.id, "storage_path": "x.mp3", "status": "verified"})
    for i, line in enumerate(HE):
        l = fake_sb.insert("lyric_lines", {"project_id": project["id"], "line_index": i, "start_ms": line["start_ms"], "end_ms": line["end_ms"]})
        for j, w in enumerate(line["words"]):
            fake_sb.insert("lyric_words", {"project_id": project["id"], "line_id": l["id"], "word_index": i * 10 + j, **w})
    return project


def test_text_exports(client, ready_project):
    pid = ready_project["id"]
    srt = client.get(f"/projects/{pid}/export/srt", headers=AUTH)
    assert srt.status_code == 200
    assert srt.text.startswith("﻿1\n00:00:01,000")
    assert "filename*=UTF-8''%D7%A9" in srt.headers["content-disposition"]
    lrc = client.get(f"/projects/{pid}/export/lrc", headers=AUTH)
    assert "<00:01.50>עולם" in lrc.text


@needs_font
def test_ass_export_embeds_font(client, ready_project):
    resp = client.get(f"/projects/{ready_project['id']}/export/ass?aspect=9:16&resolution=720", headers=AUTH)
    assert resp.status_code == 200
    assert "PlayResX: 720" in resp.text and "PlayResY: 1280" in resp.text
    assert "[Fonts]" in resp.text and resp.text.count(",Hi,") == 3


def test_exports_require_ownership_and_ready_lyrics(client, fake_sb, ready_project):
    pid = ready_project["id"]
    bob = {"Authorization": "Bearer bob-token"}
    assert client.get(f"/projects/{pid}/export/srt", headers=bob).status_code == 404
    assert client.post(f"/projects/{pid}/exports", json={}, headers=bob).status_code == 404
    assert client.get(f"/projects/{pid}/export/srt").status_code == 401
    assert client.get(f"/projects/{pid}/export/pdf", headers=AUTH).status_code == 422
    fake_sb.update("projects", {"id": f"eq.{pid}"}, {"status": "processing"})
    assert client.get(f"/projects/{pid}/export/srt", headers=AUTH).json()["detail"] == "not_ready"


def test_mp4_export_job_is_idempotent_and_snapshots_style(client, fake_sb, ready_project):
    pid = ready_project["id"]
    first = client.post(f"/projects/{pid}/exports", json={"aspect": "9:16", "resolution": 720}, headers=AUTH)
    assert first.status_code == 201, first.text
    job = first.json()
    assert job["options"]["aspect"] == "9:16" and job["options"]["style"]["preset"] == "neon"
    again = client.post(f"/projects/{pid}/exports", json={"aspect": "16:9"}, headers=AUTH)
    assert again.json()["id"] == job["id"]
    assert len(fake_sb.tables["export_jobs"]) == 1
    assert client.post(f"/projects/{pid}/exports", json={"aspect": "4:3"}, headers=AUTH).status_code == 422


def test_export_daily_limit(client, fake_sb, ready_project, monkeypatch):
    from karaokesync.config import get_settings

    monkeypatch.setattr(get_settings(), "max_exports_per_day", 1)
    pid = ready_project["id"]
    job = client.post(f"/projects/{pid}/exports", json={}, headers=AUTH).json()
    fake_sb.update("export_jobs", {"id": f"eq.{job['id']}"}, {"status": "succeeded"})
    resp = client.post(f"/projects/{pid}/exports", json={}, headers=AUTH)
    assert resp.status_code == 429 and resp.json()["detail"] == "daily_export_limit"


def test_delete_export(client, fake_sb, ready_project, tmp_path):
    job = client.post(f"/projects/{ready_project['id']}/exports", json={}, headers=AUTH).json()
    fake_sb.update("export_jobs", {"id": f"eq.{job['id']}"}, {"status": "succeeded", "output_path": "u/p/e.mp4"})
    fake_sb.put_object("exports", "u/p/e.mp4", tmp_path / "e.mp4")
    assert client.delete(f"/exports/{job['id']}", headers={"Authorization": "Bearer bob-token"}).status_code == 404
    assert client.delete(f"/exports/{job['id']}", headers=AUTH).status_code == 204
    assert fake_sb.objects["exports"] == {} and fake_sb.tables["export_jobs"] == []


@needs_ffmpeg
@needs_font
def test_worker_export_pipeline(fake_sb, ready_project, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.export_pipeline import run_export

    monkeypatch.setattr("karaokesync.worker.export_pipeline.ensure_font", lambda family: SYSTEM_FONT)
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    audio = fake_sb.tables["audio_files"][0]
    audio["duration_ms"] = 3000
    fake_sb.put_object("audio", audio["storage_path"], make_audio(tmp_path, "mp3", 3))
    job = fake_sb.insert("export_jobs", {"project_id": ready_project["id"], "user_id": ready_project["user_id"],
                                         "format": "mp4", "options": {"aspect": "1:1", "resolution": 720,
                                                                      "style": PRESETS["tiktok"].model_dump()}})
    progress = []
    path = run_export(job, fake_sb, settings, progress.append)
    assert path == f"{ready_project['user_id']}/{ready_project['id']}/{job['id']}.mp4"
    stored = fake_sb.objects["exports"][path]
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height:format=duration",
                                      "-of", "json", str(stored)], capture_output=True, text=True).stdout)
    assert info["streams"][0]["width"] == 720 and info["streams"][0]["height"] == 720
    assert 2.8 < float(info["format"]["duration"]) < 3.3
    assert progress[0] < progress[-1] and progress[-1] >= 90
    assert not list((tmp_path / "work").iterdir())  # temporary files removed
