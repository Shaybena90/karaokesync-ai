"""ASS subtitles with a word-level karaoke effect that renders Hebrew correctly.

Why not the usual {\\kf} karaoke tags? In libass (used by FFmpeg, mpv, VLC)
every override tag starts a new text run and bidi reordering does not cross
runs, so a Hebrew line written with \\kf tags comes out with its words in the
wrong order and the fill sweeping the wrong way.

Instead every line is drawn as ONE plain text run (bidi is always right) and
the highlight is a second copy of the same line per word, clipped to that
word's box. The clip grows across the word while it is sung — right-to-left
for Hebrew/Arabic words, left-to-right for Latin ones. Word boxes come from
HarfBuzz measurements of the very font file libass renders with.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..styles import SubtitleStyle
from .measure import TextMeasurer, resolve_directions, visual_order, word_direction

RTL_LANGUAGES = {"he", "yi", "ar", "fa", "ur", "ps", "sd", "ug"}
RLM, LRM = "‏", "‎"

LEAD_IN_MS = 2000  # show a line this long before it is sung (when there is room)
LONG_GAP_MS = 4000  # gaps longer than this blank the screen between lines
SWITCH_EARLY_MS = 1500


@dataclass(frozen=True)
class Canvas:
    width: int
    height: int


def ass_time(ms: float) -> str:
    cs = max(0, int(round(ms / 10)))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ass_color(hex_color: str, alpha: int = 0) -> str:
    """#rrggbb -> &HAABBGGRR (ASS stores blue-green-red, alpha 00 = opaque)."""
    r, g, b = hex_color[1:3], hex_color[3:5], hex_color[5:7]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def escape_text(text: str) -> str:
    """Lyrics must never be interpreted as ASS override codes."""
    return text.replace("\\", "⧵").replace("{", "｛").replace("}", "｝").replace("\n", " ")


def is_rtl(language: str | None, words: list[str]) -> bool:
    if language:
        return language in RTL_LANGUAGES
    for w in words:
        d = word_direction(w)
        if d:
            return d == "R"
    return False


def line_windows(lines: list[dict]) -> list[tuple[int, int]]:
    """When each line is on screen. Consecutive windows touch (no flicker)."""
    windows: list[tuple[int, int]] = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if i == 0 or line["start_ms"] - lines[i - 1]["end_ms"] > LONG_GAP_MS:
            start = max(0, line["start_ms"] - LEAD_IN_MS)
        else:
            start = windows[-1][1]
        if windows:
            start = max(start, windows[-1][1])
        if nxt is None or nxt["start_ms"] - line["end_ms"] > LONG_GAP_MS:
            end = line["end_ms"] + 1000
        else:
            end = min(nxt["start_ms"], max(line["end_ms"] + 200, nxt["start_ms"] - SWITCH_EARLY_MS))
        windows.append((start, max(end, start + 100)))
    return windows


def _encode_font(data: bytes) -> list[str]:
    """ASS [Fonts] section encoding (a uuencode variant), 80 chars per line."""
    out = []
    for i in range(0, len(data), 3):
        chunk = data[i : i + 3]
        n = int.from_bytes(chunk.ljust(3, b"\0"), "big")
        chars = [((n >> s) & 0x3F) + 33 for s in (18, 12, 6, 0)]
        out.append(bytes(chars[: len(chunk) + 1]).decode("ascii"))
    text = "".join(out)
    return [text[i : i + 80] for i in range(0, len(text), 80)]


def build_ass(
    lines: list[dict],
    style: SubtitleStyle,
    language: str | None,
    canvas: Canvas,
    measurer: TextMeasurer,
    title: str = "",
    embed_font: bool = False,
) -> str:
    W, H = canvas.width, canvas.height
    unit = min(W, H) / 720  # outline/shadow scale relative to 720p
    # Vertical videos (phones) get bigger text relative to their narrow width.
    base_size = min(W, H) * (0.085 if H > W else 0.0667) * style.size / 100
    avail = W * 0.88
    font = measurer.info
    bold = -1 if font.bold else 0
    outline_px = round(style.outline * unit, 1)
    shadow_px = round(style.shadow * unit, 1)

    if style.text_box:
        base_border_style, base_outline, base_outline_color = 3, round(base_size * 0.22, 1), ass_color("#000000", 0x60)
    else:
        base_border_style, base_outline, base_outline_color = 1, outline_px, ass_color(style.outline_color)
    if style.glow:
        hi_outline, hi_outline_color = outline_px + 2 * unit, ass_color(style.highlight_color, 0x40)
    elif style.text_box:
        hi_outline, hi_outline_color = 0, ass_color("#000000", 0xFF)
    else:
        hi_outline, hi_outline_color = outline_px, ass_color(style.outline_color)

    fmt = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
           "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
           "Alignment, MarginL, MarginR, MarginV, Encoding")

    # Encoding -1 makes libass detect the paragraph direction from the text
    # (with the RLM/LRM mark we put first); otherwise it always lays out LTR.
    def style_line(name: str, primary: str, outline_color: str, back: str, border_style: int, outline: float, shadow: float) -> str:
        return (f"Style: {name},{font.family},{base_size:.1f},{primary},{primary},{outline_color},{back},{bold},0,0,0,"
                f"100,100,0,0,{border_style},{outline},{shadow},5,0,0,0,-1")

    out = [
        "[Script Info]",
        f"Title: {escape_text(title)[:120]}",
        "ScriptType: v4.00+",
        f"PlayResX: {W}",
        f"PlayResY: {H}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "Kerning: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        fmt,
        style_line("Base", ass_color(style.text_color), base_outline_color, ass_color("#000000", 0x70),
                   base_border_style, base_outline, shadow_px),
        style_line("Hi", ass_color(style.highlight_color), hi_outline_color, ass_color("#000000", 0xFF), 1, hi_outline, 0),
        style_line("Next", ass_color(style.text_color, 0x90), ass_color(style.outline_color, 0xB0),
                   ass_color("#000000", 0xFF), 1, outline_px * 0.6, 0),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    lines = [l for l in lines if l.get("words")]
    windows = line_windows(lines)
    show_next = style.show_next_line
    for i, line in enumerate(lines):
        start, end = windows[i]
        words = [escape_text(w["text"]) for w in line["words"]]
        rtl = is_rtl(language, words)
        mark = RLM if rtl else LRM

        # Measure, shrinking the line if it would not fit on one row.
        fs = base_size
        widths = [measurer.width(w, fs) for w in words]
        space = measurer.width(" ", fs)
        total = sum(widths) + space * (len(words) - 1)
        if total > avail:
            factor = avail / total
            fs *= factor
            widths = [w * factor for w in widths]
            space *= factor
            total = avail

        nxt = lines[i + 1] if show_next and i + 1 < len(lines) else None
        next_offset = fs * 1.3 if nxt else 0
        if style.position == "top":
            y = H * 0.1 + fs * 0.6
        elif style.position == "center":
            y = H / 2 - next_offset / 2
        else:
            y = H * 0.9 - fs * 0.6 - next_offset
        cx = W / 2
        ya, yb = round(y - fs * 0.85), round(y + fs * 0.85)

        text = mark + " ".join(words)
        fade = r"\fad(120,120)"
        out.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Base,,0,0,0,,"
                   f"{{\\an5\\pos({cx:.1f},{y:.1f})\\fs{fs:.1f}{fade}}}{text}")

        if nxt:
            nwords = [escape_text(w["text"]) for w in nxt["words"]]
            nfs = fs * 0.8
            ntotal = sum(measurer.width(w, nfs) for w in nwords) + measurer.width(" ", nfs) * (len(nwords) - 1)
            if ntotal > avail:
                nfs *= avail / ntotal
            nmark = RLM if is_rtl(language, nwords) else LRM
            out.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Next,,0,0,0,,"
                       f"{{\\an5\\pos({cx:.1f},{y + next_offset:.1f})\\fs{nfs:.1f}{fade}}}{nmark}{' '.join(nwords)}")

        if style.animation == "none":
            continue

        # Word boxes in visual (left -> right) order.
        x = cx - total / 2
        boxes: dict[int, tuple[float, float]] = {}
        for idx in visual_order(words, rtl):
            boxes[idx] = (x, x + widths[idx])
            x += widths[idx] + space
        pad = space / 2
        directions = resolve_directions(words, rtl)
        blur = r"\blur4" if style.glow else ""
        for k, word in enumerate(line["words"]):
            a, b = boxes[k][0] - pad, boxes[k][1] + pad
            word_rtl = directions[k] == "R"
            t1 = max(0, word["start_ms"] - start)
            t2 = max(t1 + 20, word["end_ms"] - start) if style.animation == "fill" else t1 + 20
            edge = b if word_rtl else a
            out.append(
                f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Hi,,0,0,0,,"
                f"{{\\an5\\pos({cx:.1f},{y:.1f})\\fs{fs:.1f}{fade}{blur}"
                f"\\clip({edge:.1f},{ya},{edge:.1f},{yb})"
                f"\\t({t1:.0f},{t2:.0f},\\clip({a:.1f},{ya},{b:.1f},{yb}))}}{text}"
            )

    if embed_font:
        out += ["", "[Fonts]", f"fontname: {font.path.stem}_0.ttf", *_encode_font(font.path.read_bytes())]
    return "\n".join(out) + "\n"
