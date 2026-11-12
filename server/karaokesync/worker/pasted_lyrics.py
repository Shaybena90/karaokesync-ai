"""Pasted lyrics: the user's exact words and lines, timed to the song.

1. The song is recognised as usual (on the vocals). What was heard is only
   used as anchors: where in time the pasted words roughly are.
2. The pasted words are matched to the heard words (sequence matching on
   normalised text), which gives each line an estimated time window; lines
   with no match are placed between their neighbours.
3. Consecutive lines are grouped into stretches of up to ~25 s and each group
   is force-aligned with Whisper (line_sync.align_words): the text is known,
   Whisper only finds when each word is sung.
The result keeps the user's words and line breaks exactly.
"""

from __future__ import annotations

import difflib
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass

from .lines import Line, Word
from .line_sync import SAMPLE_RATE, _norm, align_words, to_song_time

log = logging.getLogger("karaokesync.pasted")

MAX_LINES = 400
MAX_WORDS_PER_LINE = 40
MAX_WORD_CHARS = 100
GROUP_MS = 25_000
GROUP_WORDS = 60
MARGIN_MS = 1_500
DEFAULT_WORD_MS = 450

_SECTION = re.compile(r"^\s*[\[(].*[\])]\s*$")  # "[Chorus]", "(x2)"


def parse_lyrics(text: str) -> list[list[str]]:
    """Lines of words. Empty lines and section labels like "[Chorus]" are skipped;
    very long lines are split so a karaoke line stays readable."""
    lines: list[list[str]] = []
    for raw in text.replace("\r", "").split("\n"):
        if not raw.strip() or _SECTION.match(raw):
            continue
        words = [w[:MAX_WORD_CHARS] for w in raw.split()]
        for i in range(0, len(words), MAX_WORDS_PER_LINE):
            lines.append(words[i: i + MAX_WORDS_PER_LINE])
        if len(lines) >= MAX_LINES:
            break
    return lines[:MAX_LINES]


@dataclass
class LineWindow:
    start: int
    end: int
    anchored: bool


def estimate_windows(lines: list[list[str]], heard: list[Word], song_ms: int) -> list[LineWindow]:
    """Where each pasted line is probably sung, from the words the recogniser heard."""
    flat = [(li, w) for li, words in enumerate(lines) for w in words]
    pasted = [_norm(w) for _, w in flat]
    heard_norm = [_norm(w.text) for w in heard]
    matcher = difflib.SequenceMatcher(None, pasted, heard_norm, autojunk=False)
    spans: dict[int, list[int]] = {}
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            if not pasted[a + k]:
                continue
            li = flat[a + k][0]
            w = heard[b + k]
            span = spans.setdefault(li, [w.start_ms, w.end_ms])
            span[0], span[1] = min(span[0], w.start_ms), max(span[1], w.end_ms)

    windows: list[LineWindow | None] = [
        LineWindow(spans[i][0], spans[i][1], True) if i in spans else None for i in range(len(lines))
    ]
    # Keep anchored lines in order (a stray match can point far away).
    last = 0
    for i, w in enumerate(windows):
        if w is None:
            continue
        if w.start < last:
            windows[i] = None
            continue
        last = w.start

    # Lines without a match: share the gap between their neighbours by length.
    first_heard = heard[0].start_ms if heard else 0
    last_heard = heard[-1].end_ms if heard else song_ms
    i = 0
    while i < len(windows):
        if windows[i] is not None:
            i += 1
            continue
        j = i
        while j < len(windows) and windows[j] is None:
            j += 1
        gap_start = windows[i - 1].end if i > 0 else first_heard
        gap_end = windows[j].start if j < len(windows) else max(last_heard, gap_start)
        need = sum(len(lines[k]) for k in range(i, j)) * DEFAULT_WORD_MS
        if gap_end - gap_start < need:  # not enough room: let the lines run past it
            gap_end = min(song_ms, gap_start + need) if j == len(windows) else gap_end
        total_words = sum(len(lines[k]) for k in range(i, j)) or 1
        cursor = gap_start
        for k in range(i, j):
            length = max(1, (gap_end - gap_start) * len(lines[k]) // total_words)
            windows[k] = LineWindow(cursor, cursor + length, False)
            cursor += length
        i = j
    return [w for w in windows if w is not None]


def plan_groups(lines: list[list[str]], windows: list[LineWindow]) -> list[list[int]]:
    """Consecutive lines aligned together: up to ~25 s and 60 words per group."""
    groups: list[list[int]] = []
    current: list[int] = []
    for i in range(len(lines)):
        if current:
            start = windows[current[0]].start
            words = sum(len(lines[k]) for k in current) + len(lines[i])
            if windows[i].end - start > GROUP_MS or words > GROUP_WORDS:
                groups.append(current)
                current = []
        current.append(i)
    if current:
        groups.append(current)
    return groups


def spread(words: list[str], start: int, end: int) -> list[dict]:
    """Even timings, marked unsure (confidence 0) for the user to check."""
    step = max(1, (end - start) // max(1, len(words)))
    return [{"start_ms": start + k * step, "end_ms": start + (k + 1) * step, "confidence": 0.0} for k in range(len(words))]


def align_pasted(
    lines: list[list[str]],
    heard: list[Word],
    samples,
    model,
    language: str | None,
    on_progress: Callable[[float], None] | None = None,
    aligner=None,
) -> list[Line]:
    """Time the pasted lines against the vocals (`samples`, 16 kHz)."""
    aligner = aligner or align_words
    song_ms = int(len(samples) * 1000 / SAMPLE_RATE)
    windows = estimate_windows(lines, heard, song_ms)
    groups = plan_groups(lines, windows)
    out: list[Line] = []
    floor = 0
    for g, group in enumerate(groups):
        words = [w for i in group for w in lines[i]]
        # The stretch: the group's estimate plus a margin, never before the previous group.
        start = max(floor, windows[group[0]].start - MARGIN_MS, 0)
        end = windows[group[-1]].end + MARGIN_MS
        if g + 1 < len(groups):
            end = min(end, windows[groups[g + 1][0]].start + MARGIN_MS // 2)
        end = min(max(end, start + 1000), song_ms)
        start = min(start, max(0, end - 1000))
        try:
            clip = samples[start * SAMPLE_RATE // 1000: end * SAMPLE_RATE // 1000]
            times = to_song_time(aligner(model, clip, words, language), start, end)
        except Exception as exc:  # one hard stretch must not lose the whole song
            log.warning("alignment of lines %d-%d failed (%s); spreading them evenly", group[0], group[-1], type(exc).__name__)
            times = spread(words, windows[group[0]].start, max(windows[group[-1]].end, windows[group[0]].start + 500))
        k = 0
        for i in group:
            line_words = []
            for text in lines[i]:
                t = times[k]
                line_words.append(Word(text=text, start_ms=max(t["start_ms"], floor), end_ms=max(t["end_ms"], t["start_ms"], floor),
                                       confidence=t["confidence"]))
                floor = line_words[-1].start_ms
                k += 1
            out.append(Line(words=line_words))
        if on_progress:
            on_progress((g + 1) / len(groups))
    return out
