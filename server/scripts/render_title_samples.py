"""Small pictures of every title card design for the website's picker:
web/public/intro/title-<theme>-sample.jpg, drawn by the same code as the
exported video (libass on the theme's backdrop). Run after changing a theme
or a backdrop (from the server folder):

    .venv/bin/python scripts/render_title_samples.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from karaokesync.exports.ass import Canvas  # noqa: E402
from karaokesync.exports.measure import measurer_for  # noqa: E402
from karaokesync.exports.opening import INTRO_DIR, THEMES, TitleCard, title_ass  # noqa: E402
from karaokesync.fonts import ensure_font  # noqa: E402

SAMPLE = TitleCard(song="שם השיר", artist="שם הזמר")


def main() -> None:
    canvas = Canvas(640, 360)
    for theme in THEMES.values():
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / "fonts").mkdir()
            name, song = ensure_font(theme.name_font), ensure_font(theme.song_font)
            for f in {name, song}:
                shutil.copy(f, work / "fonts" / f.name)
            (work / "t.ass").write_text(title_ass(SAMPLE, canvas, measurer_for(str(name)), measurer_for(str(song)), "he", theme),
                                        encoding="utf-8")
            out = INTRO_DIR / f"title-{theme.id}-sample.jpg"
            subprocess.run(
                ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", "3", "-i", str(INTRO_DIR / theme.backdrop),
                 "-filter_complex", "[0:v]trim=duration=5,setpts=PTS-STARTPTS,scale=640:360,ass=filename=t.ass:fontsdir=fonts,scale=320:180",
                 "-ss", "3.5", "-frames:v", "1", "-q:v", "4", str(out)],
                cwd=work, check=True,
            )
            print(out.name)


if __name__ == "__main__":
    main()
