"""4K files (built-in 3D backgrounds and title backdrops) kept on the repository's
`assets-4k` branch, so the website and the worker's updates stay small.

The worker downloads a file the first time an export needs it and keeps it on
this computer. Every file is listed in assets_4k.json with its size and SHA-256
(committed with the code), and a download is used only when it matches exactly:
a changed or broken file on the branch is never put in a video.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path

import httpx

from .worker.errors import PipelineError

log = logging.getLogger("karaokesync.assets")

MANIFEST = Path(__file__).with_name("assets_4k.json")
DEFAULT_URL = "https://raw.githubusercontent.com/Shaybena90/karaokesync-ai/assets-4k/"


@lru_cache(maxsize=1)
def manifest() -> dict[str, dict]:
    """{"backgrounds/aurora-night-2160.mp4": {"bytes": 123, "sha256": "..."}, ...}"""
    if not MANIFEST.is_file():
        return {}
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def has(name: str) -> bool:
    return name in manifest()


def local_path(name: str, cache_dir: Path) -> Path:
    entry = manifest()[name]
    stem, dot, ext = Path(name).name.rpartition(".")
    # The hash is in the name: a new version of a file never reuses an old copy.
    return cache_dir / "4k" / Path(name).parent / f"{stem}-{entry['sha256'][:12]}{dot}{ext}"


def fetch(name: str, cache_dir: Path, base_url: str = DEFAULT_URL, client: httpx.Client | None = None) -> Path:
    """The local copy of a 4K file: downloaded and checked once, then reused."""
    if name not in manifest():
        raise PipelineError("asset_missing", retryable=False)
    entry = manifest()[name]
    out = local_path(name, cache_dir)
    if out.is_file() and out.stat().st_size == entry["bytes"]:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_name(out.name + ".part")
    digest, written = hashlib.sha256(), 0
    url = base_url.rstrip("/") + "/" + name
    log.info("downloading 4K file %s (%d MB, once)", name, entry["bytes"] // (1024 * 1024))
    try:
        http = client or httpx.Client(follow_redirects=True)
        try:
            with http.stream("GET", url, timeout=httpx.Timeout(600.0, connect=15.0)) as resp:
                if not resp.is_success:
                    raise PipelineError("asset_download_failed", retryable=resp.status_code >= 500 or resp.status_code == 429)
                with open(part, "wb") as fh:
                    for chunk in resp.iter_bytes(1024 * 1024):
                        written += len(chunk)
                        if written > entry["bytes"]:
                            raise PipelineError("asset_download_failed", retryable=False)
                        digest.update(chunk)
                        fh.write(chunk)
        finally:
            if client is None:
                http.close()
    except httpx.HTTPError as exc:
        part.unlink(missing_ok=True)
        raise PipelineError("asset_download_failed", retryable=True) from exc
    except PipelineError:
        part.unlink(missing_ok=True)
        raise
    if written != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
        part.unlink(missing_ok=True)
        log.warning("4K file %s did not match its checksum: not used", name)
        raise PipelineError("asset_download_failed", retryable=False)
    part.replace(out)
    return out
