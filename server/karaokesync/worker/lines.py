"""Turn word timestamps into karaoke lines."""

from __future__ import annotations

from dataclasses import dataclass, field

SENTENCE_END = (".", "!", "?", "…", "؟", ";")


@dataclass
class Word:
    text: str
    start_ms: int
    end_ms: int
    confidence: float | None = None
    segment_index: int = 0


@dataclass
class Line:
    words: list[Word] = field(default_factory=list)

    @property
    def start_ms(self) -> int:
        return self.words[0].start_ms

    @property
    def end_ms(self) -> int:
        return self.words[-1].end_ms

    @property
    def char_count(self) -> int:
        return sum(len(w.text) for w in self.words) + max(0, len(self.words) - 1)


def clean_words(words: list[Word]) -> list[Word]:
    """Drop empty tokens and make timings monotonic and well-formed."""
    out: list[Word] = []
    last_start = 0
    for w in words:
        text = w.text.strip()
        if not text:
            continue
        start = max(int(w.start_ms), last_start, 0)
        end = max(int(w.end_ms), start)
        conf = None if w.confidence is None else min(1.0, max(0.0, float(w.confidence)))
        out.append(Word(text=text[:100], start_ms=start, end_ms=end, confidence=conf, segment_index=w.segment_index))
        last_start = start
    return out


def split_into_lines(
    words: list[Word],
    max_chars: int = 32,
    max_words: int = 8,
    gap_ms: int = 800,
) -> list[Line]:
    lines: list[Line] = []
    current = Line()
    for word in clean_words(words):
        if current.words:
            prev = current.words[-1]
            gap = word.start_ms - prev.end_ms
            would_overflow = current.char_count + 1 + len(word.text) > max_chars
            new_segment = word.segment_index != prev.segment_index and len(current.words) >= 2
            sentence_done = prev.text.endswith(SENTENCE_END) and len(current.words) >= 3
            if gap >= gap_ms or would_overflow or len(current.words) >= max_words or new_segment or sentence_done:
                lines.append(current)
                current = Line()
        current.words.append(word)
    if current.words:
        lines.append(current)
    return lines


def lines_to_payload(lines: list[Line], language: str | None) -> dict:
    """Shape expected by the `complete_processing_job` SQL function."""
    return {
        "language": language,
        "lines": [
            {
                "start_ms": line.start_ms,
                "end_ms": line.end_ms,
                "words": [
                    {"text": w.text, "start_ms": w.start_ms, "end_ms": w.end_ms, "confidence": w.confidence}
                    for w in line.words
                ],
            }
            for line in lines
        ],
    }
