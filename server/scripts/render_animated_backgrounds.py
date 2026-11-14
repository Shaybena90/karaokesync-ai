"""Draws the built-in animated backgrounds for the website: one looping MP4 and
one small JPG picture per background, into web/public/backgrounds/. Run again after changing a recipe in
karaokesync/animated_backgrounds.py (from the server folder):

    .venv/bin/python scripts/render_animated_backgrounds.py [id ...]
"""

from __future__ import annotations

import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from karaokesync.animated_backgrounds import BACKGROUNDS, render_clip  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "backgrounds"


def one(bg_id: str) -> str:
    clip = render_clip(bg_id, OUT / f"{bg_id}.mp4", crf=28)
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", "3", "-i", str(clip),
         "-frames:v", "1", "-vf", "scale=240:-2", "-q:v", "5", str(OUT / f"{bg_id}.jpg")],
        check=True, capture_output=True,
    )
    return f"{bg_id}: {clip.stat().st_size // 1024} KB"


def main() -> None:
    ids = sys.argv[1:] or [b.id for b in BACKGROUNDS.values() if b.source]  # 3D: web/scripts/render-3d-backgrounds.mjs
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(4) as pool:
        for line in pool.map(one, ids):
            print(line, flush=True)


if __name__ == "__main__":
    main()
