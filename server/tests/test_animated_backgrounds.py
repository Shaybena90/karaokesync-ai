"""Built-in animated backgrounds: 30 looping FFmpeg recipes and 12 pre-drawn 3D scenes, the same list on the website."""

import re
import subprocess
from pathlib import Path

import pytest

from karaokesync import animated_backgrounds as ab
from karaokesync.styles import SubtitleStyle, parse_style
from karaokesync.worker import export_pipeline

ROOT = Path(__file__).resolve().parents[2]


def _frame(source: str, at_seconds: float = 0) -> bytes:
    """One small frame of the recipe at the given time of the loop."""
    if at_seconds:
        # Shift the clock of the drawing filters, so frame 0 is the picture at `at_seconds`.
        source = source.replace("format=gray,geq", f"setpts=PTS+{at_seconds}/TB,format=gray,geq")
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", source, "-frames:v", "1",
         "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True, timeout=60,
    )
    return out.stdout


def _diff(a: bytes, b: bytes) -> float:
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


CLASSIC = [b.id for b in ab.BACKGROUNDS.values() if b.kind == "classic"]
SCENES = [b.id for b in ab.BACKGROUNDS.values() if b.kind == "3d"]


def test_thirty_classic_and_eighteen_3d_backgrounds_with_names():
    assert len(CLASSIC) == 30 and len(SCENES) == 18
    for bg in ab.BACKGROUNDS.values():
        assert re.fullmatch(r"[a-z]+(-[a-z]+)*", bg.id) and bg.name_he and bg.name_en
        assert bg.seconds in (10, 20)


def test_the_website_lists_the_same_backgrounds():
    ts = (ROOT / "web/src/lib/animatedBackgrounds.ts").read_text(encoding="utf-8")
    rows = re.findall(r"id: '([^']+)', he: \"([^\"]+)\", en: '([^']+)', seconds: (\d+)(?:, kind: '(3d)')?", ts)
    assert rows == [(b.id, b.name_he, b.name_en, str(b.seconds), "3d" if b.kind == "3d" else "") for b in ab.BACKGROUNDS.values()]


@pytest.mark.parametrize("bg_id", SCENES)
def test_every_3d_scene_has_its_shader_and_its_clip(bg_id):
    assert (ROOT / "backgrounds3d" / f"{bg_id}.frag").is_file()
    clip, thumb = ab.PREBUILT_DIR / f"{bg_id}.mp4", ab.PREBUILT_DIR / f"{bg_id}.jpg"
    assert thumb.is_file() and 0 < clip.stat().st_size < 8 * 1024 * 1024
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames",
         "-of", "csv=p=0", str(clip)], check=True, capture_output=True, text=True).stdout.strip()
    assert probe == "960,540,300"
    # it loops: the jump from the last frame back to the first is like any other step
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(clip), "-vf", "scale=96:54",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], check=True, capture_output=True).stdout
    n = 96 * 54
    frames = [raw[i * n:(i + 1) * n] for i in range(len(raw) // n)]
    steps = [_diff(frames[i], frames[i + 1]) for i in range(0, len(frames) - 1, 10)]
    assert _diff(frames[-1], frames[0]) <= max(steps) * 1.5 + 1


@pytest.mark.parametrize("bg_id", CLASSIC)
def test_every_recipe_draws_a_picture_that_moves(bg_id):
    bg = ab.BACKGROUNDS[bg_id]
    first = _frame(bg.source)
    assert len(first) == 64 * 36 * 3 and max(first) > 40, "not a black screen"
    if "geq" in bg.source:
        assert _diff(first, _frame(bg.source, bg.seconds * 0.37)) > 1, "the picture moves"
        assert _diff(first, _frame(bg.source, bg.seconds)) < 0.5, "the loop ends where it starts"


def test_gradient_recipes_loop_seamlessly(tmp_path):
    bg = ab.BACKGROUNDS["sunset"]
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", bg.source.replace(f":d={bg.seconds}", ""),
         "-frames:v", str(bg.seconds * ab.FPS + 1), "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True, timeout=120,
    ).stdout
    n = 64 * 36 * 3
    first, middle, after_loop = raw[:n], raw[n * bg.seconds * 15:n * (bg.seconds * 15 + 1)], raw[-n:]
    assert _diff(first, middle) > 5
    assert _diff(first, after_loop) < 0.5


def test_the_same_recipe_gives_the_same_clip(tmp_path):
    a = ab.render_clip("candy", tmp_path / "a.mp4")
    b = ab.render_clip("candy", tmp_path / "b.mp4")
    assert a.read_bytes() == b.read_bytes()
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
         "stream=nb_read_frames,width,height", "-of", "csv=p=0", str(a)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    assert probe == f"{ab.WIDTH},{ab.HEIGHT},{20 * ab.FPS}"


def test_the_website_file_is_used_when_there(tmp_path, monkeypatch):
    prebuilt = tmp_path / "web"
    prebuilt.mkdir()
    (prebuilt / "ocean.mp4").write_bytes(b"x")
    with pytest.raises(ValueError):
        ab.render_clip("disco-ball", tmp_path / "x.mp4")   # no FFmpeg recipe for a 3D scene
    monkeypatch.setattr(ab, "render_clip", lambda *a: pytest.fail("drawn again"))
    assert ab.clip_for("ocean", tmp_path / "cache", prebuilt) == prebuilt / "ocean.mp4"
    with pytest.raises(FileNotFoundError):
        ab.clip_for("disco-ball", tmp_path / "cache", prebuilt)   # 3D scenes only exist as files


def test_the_clip_is_drawn_once_and_kept(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(ab, "render_clip", lambda bg_id, out: calls.append(out) or out.write_bytes(b"x") or out)
    first = ab.cached_clip("ocean", tmp_path)
    assert ab.cached_clip("ocean", tmp_path) == first and len(calls) == 1


def test_the_style_keeps_only_known_backgrounds():
    assert SubtitleStyle().animated_background is None
    assert parse_style({"animated_background": "galaxy"}).animated_background == "galaxy"
    assert parse_style({"animated_background": "../../secret"}).animated_background is None
    assert parse_style({"animated_background": 7, "font": "Rubik"}).font == "Rubik"


def test_the_export_puts_it_under_the_whole_song(tmp_path, monkeypatch):
    from karaokesync.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path))
    monkeypatch.setattr(export_pipeline, "clip_for", lambda bg_id, folder: folder / f"{bg_id}.mp4")
    assert export_pipeline._animated_layer(settings, SubtitleStyle(), 90_000) == []
    [layer] = export_pipeline._animated_layer(settings, SubtitleStyle(animated_background="aurora"), 90_000)
    assert (layer.kind, layer.start_ms, layer.end_ms, layer.duration_ms) == ("video", 0, 90_000, 10_000)
    assert layer.file == tmp_path / "animated-backgrounds" / "aurora.mp4"


def test_a_failed_drawing_is_reported(tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker.errors import PipelineError

    def broken(bg_id, folder):
        raise subprocess.CalledProcessError(1, "ffmpeg")

    monkeypatch.setattr(export_pipeline, "clip_for", broken)
    with pytest.raises(PipelineError) as err:
        export_pipeline._animated_layer(get_settings(), SubtitleStyle(animated_background="fire"), 1000)
    assert err.value.code == "background_failed" and err.value.retryable
