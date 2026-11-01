"""כלי מדיה: סיווג קבצים, גיבוב SHA-256 בזרימה, FFprobe/FFmpeg ו-OpenCV.

כל הפעולות על קבצי מקור הן קריאה בלבד (פתיחה במצב 'rb'). נגזרות (תמונות ממוזערות,
קבצי תצוגה, פריימים) נוצרות רק מעותקי עבודה מאומתים.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings

VIDEO_EXT = {".mp4", ".mkv", ".avi", ".mov", ".dav", ".h264", ".h265", ".264", ".265", ".ts", ".m4v", ".asf",
             ".wmv", ".flv", ".3gp", ".mpg", ".mpeg"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".gif", ".webp"}
AUDIO_EXT = {".wav", ".mp3", ".aac", ".m4a", ".flac", ".ogg", ".wma"}

APP_VERSION = "0.1.0"


def classify(ext: str) -> str:
    ext = ext.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    return "other"


_CAM_RE = re.compile(r"(?:^|[^a-z])(cam|ch|camera|channel)[ _-]?(\d{1,3})", re.IGNORECASE)
_TS_RE = re.compile(
    r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[ T_-]?(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})"
)


def parse_camera_label(relative_path: str) -> str:
    for part in reversed(Path(relative_path).parts):
        m = _CAM_RE.search(part)
        if m:
            return f"CAM {int(m.group(2)):02d}"
    return ""


def parse_filename_time(name: str) -> datetime | None:
    m = _TS_RE.search(name)
    if not m:
        return None
    try:
        return datetime(*(int(g) for g in m.groups()))
    except ValueError:
        return None


class Cancelled(Exception):
    """בקשת ביטול זוהתה בגבול בטוח."""


ProgressFn = Callable[[int], None]


def sha256_file(path: Path, *, on_bytes: ProgressFn | None = None,
                check_cancel: Callable[[], None] | None = None) -> tuple[str, int]:
    """גיבוב SHA-256 בזרימה. מחזיר (hex, bytes). קריאה בלבד."""
    chunk = get_settings().hash_chunk_mb * 1024 * 1024
    h = hashlib.sha256()
    total = 0
    with open(path, "rb") as f:
        while True:
            buf = f.read(chunk)
            if not buf:
                break
            h.update(buf)
            total += len(buf)
            if on_bytes:
                on_bytes(len(buf))
            if check_cancel:
                check_cancel()
    return h.hexdigest(), total


def copy_with_hash(src: Path, dst: Path, *, on_bytes: ProgressFn | None = None,
                   check_cancel: Callable[[], None] | None = None) -> str:
    """העתקה לקובץ זמני תוך חישוב גיבוב, ואז שינוי שם אטומי. המקור נפתח לקריאה בלבד."""
    chunk = get_settings().hash_chunk_mb * 1024 * 1024
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".partial")
    h = hashlib.sha256()
    try:
        with open(src, "rb") as fin, open(tmp, "wb") as fout:
            while True:
                buf = fin.read(chunk)
                if not buf:
                    break
                h.update(buf)
                fout.write(buf)
                if on_bytes:
                    on_bytes(len(buf))
                if check_cancel:
                    check_cancel()
            fout.flush()
            os.fsync(fout.fileno())
        if dst.exists():
            os.chmod(dst, 0o644)
            dst.unlink()
        os.replace(tmp, dst)
    finally:
        if tmp.exists():
            tmp.unlink()
    return h.hexdigest()


def make_read_only(p: Path) -> None:
    try:
        os.chmod(p, 0o444)
    except OSError:
        pass


# ---------------------------------------------------------------- ffmpeg
def _bin(name: str) -> str | None:
    s = get_settings()
    configured = s.ffprobe_path if name == "ffprobe" else s.ffmpeg_path
    if os.path.isabs(configured) and os.path.exists(configured):
        return configured
    return shutil.which(configured)


def ffmpeg_available() -> bool:
    return bool(_bin("ffmpeg") and _bin("ffprobe"))


_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def _run(args: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, timeout=timeout, creationflags=_NO_WINDOW)


@lru_cache
def tool_versions() -> dict[str, str]:
    v: dict[str, str] = {"SceneOps AI": APP_VERSION, "Python": sys.version.split()[0]}
    for name in ("ffmpeg", "ffprobe"):
        b = _bin(name)
        if b:
            try:
                out = _run([b, "-version"], timeout=20).stdout.decode(errors="replace").splitlines()[0]
                v[name] = out.split(" Copyright")[0].replace(f"{name} version ", "")
            except Exception:  # noqa: BLE001
                v[name] = "לא זמין"
        else:
            v[name] = "לא מותקן"
    try:
        import cv2  # noqa: PLC0415
        v["OpenCV"] = cv2.__version__
    except Exception:  # noqa: BLE001
        v["OpenCV"] = "לא מותקן"
    v["hashlib"] = "SHA-256 (Python stdlib)"
    return v


@dataclass
class ProbeResult:
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    codec: str = ""
    fps: float | None = None
    container: str = ""
    creation_time: datetime | None = None
    raw: dict[str, Any] | None = None
    error: str = ""


def _fps(rate: str | None) -> float | None:
    if not rate or rate in ("0/0",):
        return None
    try:
        if "/" in rate:
            a, b = rate.split("/")
            return round(float(a) / float(b), 3) if float(b) else None
        return float(rate)
    except ValueError:
        return None


def ffprobe(path: Path) -> ProbeResult:
    b = _bin("ffprobe")
    if not b:
        return ProbeResult(error="FFprobe אינו מותקן")
    try:
        cp = _run([b, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], timeout=120)
    except subprocess.TimeoutExpired:
        return ProbeResult(error="FFprobe חרג מזמן הריצה")
    if cp.returncode != 0:
        return ProbeResult(error=cp.stderr.decode(errors="replace")[:300] or "FFprobe נכשל")
    data = json.loads(cp.stdout or b"{}")
    fmt = data.get("format", {})
    vstreams = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
    vs = vstreams[0] if vstreams else {}
    created = None
    ct = (fmt.get("tags") or {}).get("creation_time") or (vs.get("tags") or {}).get("creation_time")
    if ct:
        try:
            created = datetime.fromisoformat(ct.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            created = None
    dur = fmt.get("duration") or vs.get("duration")
    return ProbeResult(
        duration=round(float(dur), 3) if dur else None,
        width=vs.get("width"), height=vs.get("height"), codec=vs.get("codec_name", ""),
        fps=_fps(vs.get("avg_frame_rate") or vs.get("r_frame_rate")),
        container=fmt.get("format_name", ""), creation_time=created,
        raw={"format": {k: fmt.get(k) for k in ("format_name", "format_long_name", "duration", "bit_rate", "size")},
             "streams": [{k: s.get(k) for k in ("index", "codec_type", "codec_name", "width", "height",
                                                  "avg_frame_rate", "pix_fmt", "sample_rate", "channels")}
                         for s in data.get("streams", [])]},
    )


def make_thumbnail(src: Path, dst: Path, at_seconds: float) -> None:
    b = _bin("ffmpeg")
    if not b:
        raise RuntimeError("FFmpeg אינו מותקן")
    dst.parent.mkdir(parents=True, exist_ok=True)
    cp = _run([b, "-y", "-v", "error", "-ss", f"{max(at_seconds, 0):.3f}", "-i", str(src), "-frames:v", "1",
               "-vf", "scale=480:-2", str(dst)], timeout=120)
    if cp.returncode != 0 or not dst.exists():
        raise RuntimeError("יצירת תמונה ממוזערת נכשלה: " + cp.stderr.decode(errors="replace")[:200])


def make_proxy(src: Path, dst: Path) -> None:
    b = _bin("ffmpeg")
    if not b:
        raise RuntimeError("FFmpeg אינו מותקן")
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.stem + ".tmp.mp4")
    cp = _run([b, "-y", "-v", "error", "-i", str(src), "-vf", "scale='min(960,iw)':-2", "-c:v", "libx264",
               "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
               str(tmp)], timeout=3600)
    if cp.returncode != 0 or not tmp.exists():
        if tmp.exists():
            tmp.unlink()
        raise RuntimeError("יצירת קובץ תצוגה נכשלה: " + cp.stderr.decode(errors="replace")[:200])
    os.replace(tmp, dst)


def extract_frame(src: Path, dst: Path, at_seconds: float) -> None:
    b = _bin("ffmpeg")
    if not b:
        raise RuntimeError("FFmpeg אינו מותקן")
    dst.parent.mkdir(parents=True, exist_ok=True)
    cp = _run([b, "-y", "-v", "error", "-ss", f"{max(at_seconds, 0):.3f}", "-i", str(src), "-frames:v", "1",
               "-q:v", "2", str(dst)], timeout=120)
    if cp.returncode != 0 or not dst.exists():
        raise RuntimeError("חילוץ פריים נכשל: " + cp.stderr.decode(errors="replace")[:200])


# ---------------------------------------------------------------- motion
@dataclass
class MotionSegment:
    start: float
    end: float
    score: float


def detect_motion(path: Path, *, sample_fps: float = 4.0, threshold: float = 0.003, min_gap: float = 1.5,
                  check_cancel: Callable[[], None] | None = None,
                  on_progress: Callable[[float], None] | None = None) -> list[MotionSegment]:
    """זיהוי תנועה בסיסי באמצעות הפרש פריימים. התוצאה היא מועמדים לבדיקה בלבד."""
    import cv2  # noqa: PLC0415

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("OpenCV לא הצליח לפתוח את הקובץ")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(int(round(fps / sample_fps)), 1)
    prev = None
    active: list[tuple[float, float]] = []
    idx = 0
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            if idx % step == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                gray = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(frame, (320, 180)), cv2.COLOR_BGR2GRAY), (5, 5), 0)
                if prev is not None:
                    diff = cv2.absdiff(prev, gray)
                    _, th = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
                    ratio = float((th > 0).mean())
                    if ratio >= threshold:
                        active.append((idx / fps, ratio))
                prev = gray
                if check_cancel and idx % (step * 20) == 0:
                    check_cancel()
                if on_progress and total:
                    on_progress(min(idx / total, 1.0))
            idx += 1
    finally:
        cap.release()
    segs: list[MotionSegment] = []
    for t, r in active:
        if segs and t - segs[-1].end <= min_gap:
            segs[-1].end = t
            segs[-1].score = max(segs[-1].score, r)
        else:
            segs.append(MotionSegment(start=t, end=t, score=r))
    return [MotionSegment(s.start, s.end + 1.0 / sample_fps, round(min(s.score * 100, 1.0), 3)) for s in segs]


def fmt_offset(seconds: float) -> str:
    return str(timedelta(seconds=int(seconds)))
