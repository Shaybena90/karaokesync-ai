"""Lists the 4K files drawn into ../assets-4k (by web/scripts/render-3d-backgrounds.mjs --uhd)
in karaokesync/assets_4k.json (size + SHA-256), and copies them onto the repository's
`assets-4k` branch (a branch with only these files, so the website and the
worker's update download stay small). From the server folder:

    .venv/bin/python scripts/publish_4k_assets.py          (then push the assets-4k branch)

The worker only uses a file whose size and SHA-256 match the list committed with the code.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-4k"
MANIFEST = ROOT / "server" / "karaokesync" / "assets_4k.json"
BRANCH = "assets-4k"
MAX_BYTES = 95 * 1024 * 1024   # GitHub refuses files over 100 MB


def git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def main() -> None:
    files = sorted(p for p in SRC.rglob("*.mp4") if not p.name.endswith(".part.mp4"))
    if not files:
        sys.exit(f"nothing in {SRC}")
    entries = json.loads(MANIFEST.read_text()) if MANIFEST.is_file() else {}
    for f in files:
        size = f.stat().st_size
        if size > MAX_BYTES:
            sys.exit(f"{f.name} is {size // 2**20} MB: too big for GitHub, render it with a higher CRF")
        entries[f.relative_to(SRC).as_posix()] = {"bytes": size, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
    MANIFEST.write_text(json.dumps(dict(sorted(entries.items())), indent=1) + "\n")

    work = ROOT / ".assets-4k-worktree"
    if work.exists():
        git("worktree", "remove", "--force", str(work))
    remote = subprocess.run(["git", "ls-remote", "--exit-code", "--heads", "origin", BRANCH], cwd=ROOT, capture_output=True).returncode == 0
    if remote:
        git("fetch", "origin", BRANCH)
        git("worktree", "add", "-B", BRANCH, str(work), f"origin/{BRANCH}")
    else:
        git("worktree", "add", "--detach", str(work))
        git("checkout", "--orphan", BRANCH, cwd=work)
        git("rm", "-rf", "--quiet", ".", cwd=work)
        (work / "README.md").write_text("4K files for KaraokeSync AI (built-in 3D backgrounds and title backdrops).\n"
                                        "Listed with their SHA-256 in server/karaokesync/assets_4k.json on main.\n")
    for f in files:
        dest = work / f.relative_to(SRC)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)
    git("add", "-A", cwd=work)
    if git("status", "--porcelain", cwd=work):
        git("commit", "-q", "-m", f"4K files: {len(files)}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>", cwd=work)
    print(f"{len(files)} files listed in {MANIFEST.name}; branch {BRANCH} ready in {work} (push it: git -C {work} push origin {BRANCH})")


if __name__ == "__main__":
    main()
