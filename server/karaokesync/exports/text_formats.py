"""SRT and LRC exports."""

from __future__ import annotations

from .ass import RTL_LANGUAGES, is_rtl

RLM = "\u200f"


def srt_time(ms: int) -> str:
    ms = max(0, int(ms))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def lrc_time(ms: int) -> str:
    cs = max(0, int(round(ms / 10)))
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{m:02d}:{s:02d}.{cs:02d}"


def _line_text(line: dict, language: str | None) -> str:
    words = [w["text"] for w in line["words"]]
    text = " ".join(words)
    # A leading RLM makes players lay out Hebrew lines (and their punctuation) right-to-left.
    return (RLM + text) if is_rtl(language, words) else text


def to_srt(lines: list[dict], language: str | None) -> str:
    """One cue per karaoke line."""
    cues = []
    lines = [l for l in lines if l.get("words")]
    for i, line in enumerate(lines, 1):
        start = line["words"][0]["start_ms"]
        end = max(w["end_ms"] for w in line["words"])
        cues.append(f"{i}\n{srt_time(start)} --> {srt_time(max(end, start + 1))}\n{_line_text(line, language)}\n")
    return "\n".join(cues)


def to_lrc(lines: list[dict], language: str | None, title: str = "") -> str:
    """Enhanced LRC: [line time] then <word time> before every word."""
    out = []
    if title:
        out.append(f"[ti:{title.replace(']', ')')}]")
    out.append("[re:KaraokeSync AI]")
    for line in lines:
        if not line.get("words"):
            continue
        rtl = language in RTL_LANGUAGES if language else is_rtl(None, [w["text"] for w in line["words"]])
        parts = [f"<{lrc_time(w['start_ms'])}>{w['text']}" for w in line["words"]]
        last_end = max(w["end_ms"] for w in line["words"])
        body = " ".join(parts) + f" <{lrc_time(last_end)}>"
        out.append(f"[{lrc_time(line['words'][0]['start_ms'])}]{RLM if rtl else ''}{body}")
    return "\n".join(out) + "\n"
