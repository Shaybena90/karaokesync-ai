"""Pasted lyrics: parsing, placing lines by what was heard, grouping, alignment."""

import pytest

from karaokesync.worker.lines import Word
from karaokesync.worker.pasted_lyrics import (
    align_pasted,
    estimate_windows,
    parse_lyrics,
    plan_groups,
)

np = pytest.importorskip("numpy")


def heard(*items):
    """("word", start_ms) pairs → recogniser output (400 ms per word)."""
    return [Word(text=t, start_ms=s, end_ms=s + 350, confidence=0.6) for t, s in items]


def test_parse_keeps_lines_and_skips_labels():
    text = "[פזמון]\n  שלום   עולם  \n\nזה שיר\r\n(x2)\n" + " ".join(["מילה"] * 45)
    lines = parse_lyrics(text)
    assert lines[:2] == [["שלום", "עולם"], ["זה", "שיר"]]
    assert [len(line) for line in lines[2:]] == [40, 5]  # a very long line is split
    assert parse_lyrics("\n \n[Intro]\n") == []


def test_windows_follow_the_heard_words():
    lines = [["שלום", "עולם"], ["זה", "שיר"], ["קריוקי", "יפה"]]
    # The recogniser misheard some words ("שולם", "קריוקה"); the matches still place each line.
    got = estimate_windows(lines, heard(("שלום", 1000), ("שולם", 1400), ("זה", 5000), ("שיר", 5400), ("יפה", 9400)), 12000)
    assert [(w.start, w.anchored) for w in got] == [(1000, True), (5000, True), (9400, True)]
    assert got[0].end == 1350 and got[1].end == 5750


def test_unmatched_lines_share_the_gap_by_length():
    lines = [["א"], ["ב", "ג"], ["ד", "ה"], ["ו"]]
    got = estimate_windows(lines, heard(("א", 1000), ("ו", 9000)), 12000)
    assert got[0].anchored and got[3].anchored and not got[1].anchored
    assert got[1].start == got[0].end and got[2].end <= got[3].start
    assert (got[1].end - got[1].start) == (got[2].end - got[2].start)  # same number of words, same share


def test_nothing_heard_still_places_every_line():
    got = estimate_windows([["א", "ב"], ["ג"]], [], 10000)
    assert len(got) == 2 and got[0].start == 0 and got[1].start >= got[0].end


def test_groups_stay_short():
    lines = [["w"] * 5 for _ in range(20)]
    windows = estimate_windows(lines, heard(*[("w", i * 3000) for i in range(100)]), 300_000)
    for group in plan_groups(lines, windows):
        assert windows[group[-1]].end - windows[group[0]].start <= 25_000 or len(group) == 1
        assert sum(len(lines[i]) for i in group) <= 60


def test_alignment_keeps_the_pasted_words_and_lines():
    lines = parse_lyrics("שלום עולם\nזה שיר קריוקי")
    samples = np.zeros(16000 * 10, dtype="float32")
    calls = []

    def fake_aligner(model, clip, words, language):
        calls.append((len(clip), words))
        return [(0.5 + i * 0.5, 0.9 + i * 0.5, 0.8) for i in range(len(words))]

    out = align_pasted(lines, heard(("שלום", 2000), ("עולם", 2400), ("שיר", 4000)), samples, None, "he", aligner=fake_aligner)
    assert [[w.text for w in line.words] for line in out] == [["שלום", "עולם"], ["זה", "שיר", "קריוקי"]]
    starts = [w.start_ms for line in out for w in line.words]
    assert starts == sorted(starts) and all(w.confidence == 0.8 for line in out for w in line.words)
    assert calls[0][1] == ["שלום", "עולם", "זה", "שיר", "קריוקי"]  # one group, one pass


def test_a_failed_stretch_is_spread_and_marked_unsure():
    lines = parse_lyrics("שלום עולם")

    def broken(model, clip, words, language):
        raise RuntimeError("model failed")

    out = align_pasted(lines, heard(("שלום", 2000), ("עולם", 2400)), np.zeros(16000 * 5, dtype="float32"), None, "he",
                       aligner=broken)
    assert [w.text for w in out[0].words] == ["שלום", "עולם"]
    assert all(w.confidence == 0.0 for w in out[0].words) and out[0].words[0].start_ms == 2000
