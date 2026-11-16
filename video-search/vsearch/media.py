"""Media handling: probing, hashing, decoding with each frame's own timestamp, clip export.

Times are always *media time from the start of the file* (seconds), taken from each frame's
presentation timestamp. They are never derived from frame_index / fps, so variable-frame-rate
files are handled correctly.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Iterator

import av
import numpy as np


class MediaError(Exception):
    """A file that cannot be opened or decoded. The message is shown to the user."""


def sha256_file(path: Path, chunk: int = 4 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _ratio(s: str | None) -> float | None:
    if not s or s in ("0/0", "N/A"):
        return None
    try:
        v = float(Fraction(s))
    except (ValueError, ZeroDivisionError):
        return None
    return v or None


def probe(path: Path, timestamp_sample: int = 240) -> dict:
    """Describe the file and check that its first frames really decode.

    Returns a dict that is stored as-is with the source. Raises MediaError with a Hebrew-friendly
    explanation when there is no decodable video stream.
    """
    path = Path(path)
    if not path.is_file():
        raise MediaError(f"הקובץ לא נמצא: {path}")
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60,
        )
    except FileNotFoundError as e:
        raise MediaError("ffprobe לא מותקן במחשב") from e
    if out.returncode != 0:
        raise MediaError("לא ניתן לקרוא את הקובץ כסרטון (ffprobe): " + (out.stderr.strip()[:300] or "שגיאה לא ידועה"))
    info = json.loads(out.stdout or "{}")
    vstreams = [s for s in info.get("streams", []) if s.get("codec_type") == "video"
                and not (s.get("disposition") or {}).get("attached_pic")]
    if not vstreams:
        raise MediaError("בקובץ אין ערוץ וידאו")
    vs = vstreams[0]
    rotation = 0
    for sd in vs.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(round(float(sd["rotation"]))) % 360
    if "rotate" in (vs.get("tags") or {}):
        rotation = int(vs["tags"]["rotate"]) % 360

    fmt = info.get("format", {})
    duration = _ratio(vs.get("duration")) or _ratio(fmt.get("duration"))

    # Decode the first frames for real: proves the codec works and measures timestamp regularity.
    pts: list[float] = []
    interlaced = 0
    try:
        with av.open(str(path)) as c:
            st = c.streams.video[0]
            for fr in c.decode(st):
                if fr.time is None:
                    continue
                pts.append(float(fr.time))
                interlaced += int(bool(getattr(fr, "interlaced_frame", False)))
                if len(pts) >= timestamp_sample:
                    break
            start_time = float(st.start_time * st.time_base) if st.start_time is not None else 0.0
    except av.FFmpegError as e:
        raise MediaError(f"לא ניתן לפענח את הווידאו ({vs.get('codec_name')}): {e}") from e
    if not pts:
        raise MediaError(f"לא פוענח אף פריים מהקובץ (קידוד {vs.get('codec_name')})")

    deltas = np.diff(np.array(sorted(pts))) if len(pts) > 1 else np.array([])
    vfr = False
    if deltas.size >= 5:
        med = float(np.median(deltas))
        vfr = bool(med > 0 and (np.max(np.abs(deltas - med)) > 0.25 * med))
    avg = _ratio(vs.get("avg_frame_rate"))
    rfr = _ratio(vs.get("r_frame_rate"))
    if avg and rfr and abs(avg - rfr) / rfr > 0.02:
        vfr = True

    sar = vs.get("sample_aspect_ratio") or "1:1"
    warnings = []
    if rotation:
        warnings.append(f"בקובץ מוגדר סיבוב תצוגה של {rotation}°. בשלב זה הסימון והזיהוי אינם מתקנים סיבוב — יש לבדוק את מיקום האזור.")
    if vfr:
        warnings.append("קצב פריימים משתנה: הזמנים נלקחים מחותמת הזמן של כל פריים.")
    field_order = vs.get("field_order")
    if interlaced or (field_order and field_order not in ("progressive", "unknown")):
        warnings.append("הסרטון משולב שדות (interlaced). בשלב זה לא מופעל טיפול מיוחד בשדות.")

    return {
        "path": str(path.resolve()),
        "size_bytes": path.stat().st_size,
        "mtime": path.stat().st_mtime,
        "container": fmt.get("format_name"),
        "codec": vs.get("codec_name"),
        "pix_fmt": vs.get("pix_fmt"),
        "width": int(vs.get("width") or 0),
        "height": int(vs.get("height") or 0),
        "sample_aspect_ratio": sar,
        "rotation": rotation,
        "duration": duration,
        "start_time": start_time,
        "avg_frame_rate": avg,
        "r_frame_rate": rfr,
        "nb_frames": int(vs["nb_frames"]) if str(vs.get("nb_frames", "")).isdigit() else None,
        "variable_frame_rate": vfr,
        "field_order": field_order,
        "interlaced_frames_in_sample": interlaced,
        "decoded_sample_frames": len(pts),
        "warnings": warnings,
    }


@dataclass
class DecodeReport:
    frames_decoded: int = 0
    first_time: float | None = None
    last_time: float | None = None
    errors: list[dict] = field(default_factory=list)  # {"time": media seconds or None, "error": str}

    def as_dict(self) -> dict:
        return {
            "frames_decoded": self.frames_decoded,
            "first_time": self.first_time,
            "last_time": self.last_time,
            "errors": self.errors[:200],
            "error_count": len(self.errors),
        }


def iter_frames(path: Path, start: float = 0.0, end: float | None = None,
                report: DecodeReport | None = None) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (media_time_seconds_from_file_start, bgr_image) for every decoded frame in [start, end].

    Media time is relative to the stream's start_time, matching what a browser <video> shows as
    currentTime. Packets that fail to decode are recorded in `report.errors` — never skipped silently.
    """
    report = report if report is not None else DecodeReport()
    # Some containers (e.g. MPEG-TS) seek inexactly and can land AFTER the target. We seek earlier
    # and earlier until the first decoded frame is at/before `start`, else decode from the beginning.
    margins = [0.0, 2.0, 10.0, None] if start > 0 else [None]
    for margin in margins:
        first_seen: list[float] = []
        n_err = len(report.errors)
        gen = _iter_from(path, start, end, report, None if margin is None else max(0.0, start - margin), first_seen)
        try:
            first = next(gen)
        except StopIteration:
            if margin is not None and first_seen and first_seen[0] > start + 1e-6:
                del report.errors[n_err:]
                continue
            return
        if margin is not None and first_seen and first_seen[0] > start + 1e-6:
            gen.close()
            report.frames_decoded = 0
            report.first_time = report.last_time = None
            del report.errors[n_err:]
            continue
        yield first
        yield from gen
        return


def _iter_from(path, start, end, report, seek_to, first_seen):
    with av.open(str(path)) as c:
        st = c.streams.video[0]
        st.thread_type = "AUTO"
        t0 = float(st.start_time * st.time_base) if st.start_time is not None else 0.0
        if seek_to is not None and seek_to > 0:
            c.seek(int((seek_to + t0) / st.time_base), stream=st, backward=True, any_frame=False)
        for packet in c.demux(st):
            try:
                frames = packet.decode()
            except av.FFmpegError as e:
                t = float(packet.pts * st.time_base) - t0 if packet.pts is not None else None
                if t is None or (t >= start - 1e-6 and (end is None or t <= end)):
                    report.errors.append({"time": t, "error": str(e)[:200]})
                continue
            for fr in frames:
                if fr.pts is None:
                    report.errors.append({"time": None, "error": "פריים ללא חותמת זמן"})
                    continue
                t = float(fr.pts * st.time_base) - t0
                if not first_seen:
                    first_seen.append(t)
                    if seek_to is not None and t > start + 1e-6:
                        return  # seek overshot: caller retries from earlier
                if t < start - 1e-6:
                    continue
                if end is not None and t > end + 1e-6:
                    return
                report.frames_decoded += 1
                if report.first_time is None:
                    report.first_time = t
                report.last_time = t
                yield t, fr.to_ndarray(format="bgr24")


def frame_at(path: Path, t: float) -> tuple[float, np.ndarray]:
    """Return the first frame whose media time is >= t."""
    for ft, img in iter_frames(path, start=max(0.0, t)):
        return ft, img
    raise MediaError("לא נמצא פריים בזמן המבוקש")


def export_clip(src: Path, dst: Path, start: float, end: float) -> Path:
    """Re-encode [start, end] (media time) into a new file. The source is only read.

    An input-side -ss in ffmpeg is relative to the start of the file, i.e. the same media time we use.
    """
    start = max(0.0, start)
    dur = max(0.1, end - start)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
        "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(dst),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise MediaError("ייצוא הקטע נכשל: " + r.stderr.strip()[:300])
    return dst
