"""Line entrance effects in the video (libass) and the font list."""

import shutil
import subprocess
import typing
from pathlib import Path

import pytest

from karaokesync.exports.ass import ENTRANCE_MS, Canvas, build_ass, entrance_duration
from karaokesync.exports.measure import measurer_for
from karaokesync.styles import FONTS, Entrance, SubtitleStyle, parse_style

from .conftest import needs_ffmpeg
from .test_exports import SYSTEM_FONT

EFFECTS = list(typing.get_args(Entrance))


def test_there_are_at_least_ten_effects_and_new_hebrew_fonts():
    assert len([e for e in EFFECTS if e != "none"]) >= 10
    assert len(FONTS) >= 20 and {"Alef", "Suez One", "Noto Sans Hebrew", "Karantina"} <= set(FONTS)
    assert parse_style({"entrance": "pop", "font": "Alef"}).entrance == "pop"
    assert parse_style({"entrance": "explode"}).entrance == "rise"  # unknown -> default
    assert parse_style({"font": "Comic Sans"}).font == "Heebo"


def test_effect_ends_before_the_first_word_lights_up():
    assert entrance_duration("pop", 0, 2000, True) == ENTRANCE_MS          # plenty of room
    assert entrance_duration("pop", 1000, 1300, True) == 250               # shortened to fit
    assert entrance_duration("pop", 1000, 1020, True) == 0                 # no room at all
    assert entrance_duration("pop", 1000, 1020, False) == ENTRANCE_MS      # no highlight: no limit
    assert entrance_duration("none", 0, 5000, True) == 0


def frame(workdir: Path, t: float) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=3",
         "-vf", "ass=filename=subs.ass:fontsdir=fonts", "-ss", str(t), "-frames:v", "1",
         "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
        cwd=workdir, capture_output=True, check=True).stdout


@needs_ffmpeg
@pytest.mark.skipif(SYSTEM_FONT is None, reason="no font with Hebrew glyphs")
def test_every_effect_renders_and_ends_in_place(tmp_path):
    lines = [{"start_ms": 1500, "end_ms": 2600, "words": [
        {"text": "שלום", "start_ms": 1500, "end_ms": 2000}, {"text": "עולם", "start_ms": 2050, "end_ms": 2600}]}]
    canvas = Canvas(640, 360)
    m = measurer_for(str(SYSTEM_FONT))

    def render(effect: str) -> Path:
        work = tmp_path / effect
        (work / "fonts").mkdir(parents=True, exist_ok=True)
        shutil.copy(SYSTEM_FONT, work / "fonts")
        ass = build_ass(lines, SubtitleStyle(entrance=effect), "he", canvas, m)
        (work / "subs.ass").write_text(ass, encoding="utf-8")
        return work

    still = render("none")
    final = frame(still, 1.0)  # the line is on screen (shown from 0 s), before the first word
    ink = sum(final)  # how much text there is: differences are measured against it
    assert ink > 0, "the line is drawn"

    def change(a: bytes) -> float:
        return sum(abs(x - y) for x, y in zip(a, final)) / ink

    for effect in EFFECTS:
        work = render(effect)
        during, after = frame(work, 0.12), frame(work, 1.0)
        assert change(after) < 0.02, f"{effect}: does not end in the line's place ({change(after):.3f})"
        if effect != "none":
            assert change(during) > 0.2, f"{effect}: no visible entrance ({change(during):.3f})"
