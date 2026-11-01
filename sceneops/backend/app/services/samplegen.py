"""יצירת מדיית CCTV סינתטית להדגמה בלבד.

הסרטונים נוצרים מקומית באמצעות FFmpeg (רקע, "רכב" נע ושעון על המסך) ומסומנים
SIMULATION. אינם מכילים צילום אמיתי או מידע אישי.
"""
from __future__ import annotations

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import get_settings
from .media import _bin, _NO_WINDOW


def generate_clip(dst: Path, camera_label: str, start: datetime, duration: int,
                  motion_windows: list[tuple[float, float]], *, creation_time: datetime | None = None,
                  label: str = "SIMULATION") -> None:
    ffmpeg = _bin("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg אינו מותקן – לא ניתן ליצור מדיית הדגמה")
    dst.parent.mkdir(parents=True, exist_ok=True)
    epoch = int(start.replace(tzinfo=timezone.utc).timestamp())
    # ביטוי מיקום: הרכב נע לרוחב המסך בכל חלון תנועה
    expr = "-200"
    for (a, b) in reversed(motion_windows):
        speed = 740.0 / max(b - a, 0.1)
        expr = f"if(between(t\\,{a}\\,{b})\\,(t-{a})*{speed:.1f}-90\\,{expr})"
    clock = f"%{{pts\\:gmtime\\:{epoch}\\:%d/%m/%Y %H\\\\\\:%M\\\\\\:%S}}"
    vf = (
        "[0]drawbox=x=0:y=230:w=640:h=130:color=0x2a3442:t=fill,"
        "drawbox=x=420:y=120:w=200:h=140:color=0x3a4250:t=fill[bg];"
        f"[bg][1]overlay=x='{expr}':y=250:eval=frame,noise=alls=8:allf=t,"
        f"drawtext=fontfile=DejaVuSans.ttf:text='{camera_label}  {clock}':x=12:y=h-th-12:fontsize=15:"
        "fontcolor=white:box=1:boxcolor=black@0.5,"
        f"drawtext=fontfile=DejaVuSans.ttf:text='{label}':x=w-tw-12:y=h-th-14:fontsize=13:fontcolor=yellow@0.8"
    )
    ct = (creation_time or start).strftime("%Y-%m-%dT%H:%M:%SZ")
    args = [ffmpeg, "-y", "-v", "error",
            "-f", "lavfi", "-i", f"color=c=0x1b2533:s=640x360:r=10:d={duration}",
            "-f", "lavfi", "-i", f"color=c=0xd8dde6:s=90x40:r=10:d={duration}",
            "-filter_complex", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
            "-pix_fmt", "yuv420p", "-metadata", f"creation_time={ct}",
            "-metadata", "comment=SceneOps AI synthetic demo media - not real evidence",
            str(dst.resolve())]
    cp = subprocess.run(args, capture_output=True, cwd=str(get_settings().fonts_dir), timeout=300,
                        creationflags=_NO_WINDOW)
    if cp.returncode != 0:
        raise RuntimeError("יצירת סרטון הדגמה נכשלה: " + cp.stderr.decode(errors="replace")[:300])


DEMO_SET = [
    # (תיקייה, מצלמה, התחלה, משך, חלונות תנועה, היסט metadata בדקות)
    ("CAM01", "CAM 01", datetime(2025, 1, 25, 22, 0, 0), 60, [(8, 16), (40, 47)], 0),
    ("CAM01", "CAM 01", datetime(2025, 1, 25, 22, 1, 0), 60, [(20, 30)], 0),
    ("CAM01", "CAM 01", datetime(2025, 1, 25, 22, 3, 0), 60, [(5, 12), (33, 41)], 0),  # פער 22:02–22:03
    ("CAM03", "CAM 03", datetime(2025, 1, 25, 22, 0, 0), 60, [(12, 20)], 0),
    ("CAM03", "CAM 03", datetime(2025, 1, 25, 22, 1, 0), 60, [(3, 9), (28, 36), (50, 56)], 7),  # אי-התאמת זמן
]


def generate_demo_evidence(root: Path, *, force: bool = False) -> list[Path]:
    """יוצר תיקיית ראיות סינתטית לדוגמה (ייצוא DVR מדומה)."""
    target = root / "DVR-03_export_4581-25"
    created: list[Path] = []
    for folder, cam, start, dur, windows, skew in DEMO_SET:
        name = f"{folder}_{start:%Y%m%d_%H%M%S}.mp4"
        dst = target / folder / name
        if dst.exists() and not force:
            continue
        generate_clip(dst, cam, start, dur, windows, creation_time=start + timedelta(minutes=skew))
        created.append(dst)
    readme = target / "README_SIMULATION.txt"
    if not readme.exists():
        readme.write_text(
            "תיקייה זו מכילה מדיה סינתטית שנוצרה אוטומטית להדגמת SceneOps AI.\n"
            "אין מדובר בראיה אמיתית. אין בה מידע אישי.\n", encoding="utf-8")
    return created


def generate_simulated_export(dst_dir: Path, camera_name: str, channels: list[int], start: datetime,
                              end: datetime, *, clip_seconds: int = 30) -> list[Path]:
    """ייצוא מדומה מ-DVR: יוצר קטעים סינתטיים לכל ערוץ בטווח הזמן (מוגבל לקטעים קצרים)."""
    out: list[Path] = []
    span = max(int((end - start).total_seconds()), clip_seconds)
    n = min(max(span // clip_seconds, 1), 4)
    for ch in channels:
        for i in range(n):
            t0 = start + timedelta(seconds=i * clip_seconds)
            p = dst_dir / f"CH{ch:02d}" / f"CH{ch:02d}_{t0:%Y%m%d_%H%M%S}.mp4"
            generate_clip(p, f"{camera_name} CH{ch:02d}", t0, clip_seconds, [(4 + ch % 5, 11 + ch % 5)],
                          label="SIMULATED EXPORT")
            out.append(p)
    return out
