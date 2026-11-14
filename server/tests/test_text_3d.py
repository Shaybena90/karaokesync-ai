"""3D lettering: extruded copies of the line behind it, in the video (libass)."""

import re
import shutil
import subprocess
import typing
from pathlib import Path

import pytest

from karaokesync.exports.ass import Canvas, build_ass, shade, text_3d_layers
from karaokesync.exports.measure import measurer_for
from karaokesync.styles import TEXT_3D, SubtitleStyle, Text3D, parse_style

from .conftest import needs_ffmpeg
from .test_exports import SYSTEM_FONT

ROOT = Path(__file__).resolve().parents[2]
LINES = [{"start_ms": 1500, "end_ms": 3000, "words": [
    {"text": "שירו", "start_ms": 1500, "end_ms": 2000}, {"text": "איתי", "start_ms": 2050, "end_ms": 3000}]}]


def test_styles_and_defaults():
    assert set(typing.get_args(Text3D)) == {"none", *TEXT_3D}
    assert SubtitleStyle().text_3d == "none"
    s = parse_style({"text_3d": "deep", "depth_color": "#FF0000"})
    assert (s.text_3d, s.depth_color) == ("deep", "#ff0000")
    assert parse_style({"text_3d": "spinning"}).text_3d == "none"


def test_the_website_uses_the_same_numbers():
    ts = (ROOT / "web/src/lib/subtitleStyle.ts").read_text(encoding="utf-8")
    for kind, (depth, dx, dy) in TEXT_3D.items():
        m = re.search(rf"{kind}: \[([^\]]+)\]", ts)
        assert m, kind
        assert [float(v) for v in m.group(1).split(",")] == [depth, dx, dy]


def test_layers_go_from_the_shadow_to_just_behind_the_letters():
    assert text_3d_layers("none", "#5b21b6") == []
    layers = text_3d_layers("deep", "#5b21b6")
    shadow, *extrusion = layers
    assert shadow[2] == "#000000" and shadow[4] > 0
    assert len(extrusion) == 16
    assert extrusion[0][1] == pytest.approx(0.16) and extrusion[-1][1] == pytest.approx(0.01)
    assert extrusion[-1][2] == shade("#5b21b6", 1 - 0.55 / 16)  # lightest copy right behind the letters
    assert shade("#808080", 0.5) == "#404040"


def test_the_ass_has_the_copies_under_the_line():
    m = measurer_for(str(SYSTEM_FONT)) if SYSTEM_FONT else None
    if m is None:
        pytest.skip("no font")
    flat = build_ass(LINES, SubtitleStyle(), "he", Canvas(1280, 720), m)
    deep = build_ass(LINES, SubtitleStyle(text_3d="block"), "he", Canvas(1280, 720), m)
    extra = deep.count("Dialogue: 0,") - flat.count("Dialogue: 0,")
    assert extra == 1 + 9  # shadow + 9 copies
    # the copies come before the line itself, so the letters are drawn on top
    first_face = deep.index("\\shad0}")
    assert deep.index("\\blur") < first_face


@needs_ffmpeg
@pytest.mark.skipif(SYSTEM_FONT is None, reason="no font with Hebrew glyphs")
def test_3d_letters_render(tmp_path):
    def render(kind: str) -> bytes:
        work = tmp_path / kind
        (work / "fonts").mkdir(parents=True)
        shutil.copy(SYSTEM_FONT, work / "fonts")
        style = SubtitleStyle(text_3d=kind, depth_color="#ff0000", outline=0, shadow=0, animation="none", entrance="none")
        ass = build_ass(LINES, style, "he", Canvas(640, 360), measurer_for(str(SYSTEM_FONT)))
        (work / "subs.ass").write_text(ass, encoding="utf-8")
        return subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=4",
             "-vf", "ass=filename=subs.ass:fontsdir=fonts", "-ss", "2", "-frames:v", "1",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
            cwd=work, capture_output=True, check=True).stdout

    def red(img: bytes) -> int:  # pixels of the red extrusion (the letters themselves are white)
        return sum(1 for i in range(0, len(img), 3) if img[i] > 90 and img[i + 1] < 60 and img[i + 2] < 60)

    assert red(render("none")) == 0
    block, deep = red(render("block")), red(render("deep"))
    assert block > 50 and deep > block, (block, deep)
