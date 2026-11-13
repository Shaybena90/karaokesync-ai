"""Countdown before singing starts, in the video (libass)."""

import shutil
import typing

import pytest

from karaokesync.exports.ass import Canvas, build_ass, countdown_events, countdown_starts
from karaokesync.exports.measure import measurer_for
from karaokesync.styles import PRESETS, Countdown, SubtitleStyle, parse_style

from .conftest import needs_ffmpeg
from .test_entrances import frame
from .test_exports import SYSTEM_FONT

DESIGNS = list(typing.get_args(Countdown))


def test_which_lines_get_a_countdown():
    lines = [{"start_ms": 5000, "end_ms": 6000}, {"start_ms": 6500, "end_ms": 7000}, {"start_ms": 12000, "end_ms": 13000}]
    assert countdown_starts(lines) == [0, 2]  # the intro, and after the 5 s break; not after 0.5 s
    assert countdown_starts([{"start_ms": 2000, "end_ms": 3000}]) == []  # singing starts too soon


def test_designs_and_settings():
    assert len([d for d in DESIGNS if d != "none"]) >= 5
    assert parse_style({"countdown": "bar"}).countdown == "bar"
    assert parse_style({"countdown": "fireworks"}).countdown == "dots"
    assert PRESETS["tiktok"].countdown == "numbers" and PRESETS["neon"].countdown == "pulse"
    # Beats of a second each, ending exactly when the line starts.
    ev = countdown_events("numbers", 5000, 320, 100, 40, 640, True, "#38bdf8", "#ffffff")
    assert [e.split(",")[1:3] for e in ev] == [["0:00:02.00", "0:00:03.00"], ["0:00:03.00", "0:00:04.00"],
                                               ["0:00:04.00", "0:00:05.00"]]
    assert [e.rsplit("}", 1)[1] for e in ev] == ["3", "2", "1"]
    assert countdown_events("none", 5000, 0, 0, 40, 640, True, "#000000", "#ffffff") == []


@needs_ffmpeg
@pytest.mark.skipif(SYSTEM_FONT is None, reason="no font with Hebrew glyphs")
def test_every_design_shows_during_the_countdown_and_is_gone_after(tmp_path):
    lines = [{"start_ms": 5000, "end_ms": 6000, "words": [
        {"text": "שלום", "start_ms": 5000, "end_ms": 5500}, {"text": "עולם", "start_ms": 5500, "end_ms": 6000}]}]
    canvas = Canvas(640, 360)
    m = measurer_for(str(SYSTEM_FONT))

    def render(design: str):
        work = tmp_path / design
        (work / "fonts").mkdir(parents=True, exist_ok=True)
        shutil.copy(SYSTEM_FONT, work / "fonts")
        style = SubtitleStyle(countdown=design, entrance="none", animation="none")
        (work / "subs.ass").write_text(build_ass(lines, style, "he", canvas, m), encoding="utf-8")
        return work

    plain = render("none")
    for design in DESIGNS:
        if design == "none":
            continue
        work = render(design)
        for t in (2.5, 3.5, 4.5):  # the 3, 2 and 1 beats
            a, b = frame(work, t), frame(plain, t)
            assert sum(abs(x - y) for x, y in zip(a, b)) > 500, f"{design}: nothing shown at {t}s"
        assert frame(work, 5.5) == frame(plain, 5.5), f"{design}: still on screen after singing started"
