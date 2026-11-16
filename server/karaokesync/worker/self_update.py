"""The worker keeps itself up to date.

While idle (at most every CHECK_INTERVAL_SECONDS) it reads the newest
WORKER_VERSION from the repository's main branch. When a newer one exists and
the worker was started by scripts/windows/worker-forever.bat (which sets
KARAOKESYNC_SUPERVISED=1), it stops with UPDATE_EXIT_CODE between jobs; the
script then runs the update (9-update-worker.bat auto) and starts it again.
Started any other way, it only says once that an update is available.
"""

from __future__ import annotations

import logging
import os
import re

import httpx

log = logging.getLogger("karaokesync.update")

LATEST_URL = "https://raw.githubusercontent.com/Shaybena90/karaokesync-ai/main/server/karaokesync/worker/runner.py"
CHECK_INTERVAL_SECONDS = 1800
UPDATE_EXIT_CODE = 3
_VERSION = re.compile(r'^WORKER_VERSION = "([^"]+)"', re.M)


def latest_version(client: httpx.Client | None = None) -> str | None:
    """The newest worker version on GitHub, or None if it cannot be read now."""
    try:
        http = client or httpx.Client(follow_redirects=True, timeout=20)
        try:
            resp = http.get(LATEST_URL)
        finally:
            if client is None:
                http.close()
    except httpx.HTTPError:
        return None
    if not resp.is_success:
        return None
    match = _VERSION.search(resp.text)
    return match.group(1) if match else None


def is_newer(latest: str | None, mine: str) -> bool:
    """Versions start with a date and a number (2026-11-16.2): later sorts higher."""
    return bool(latest) and latest.split(" ")[0] > mine.split(" ")[0]


def supervised() -> bool:
    return os.environ.get("KARAOKESYNC_SUPERVISED") == "1"


def just_updated() -> bool:
    """Right after an update: do not update again at once (GitHub's copies can lag a few minutes)."""
    return os.environ.get("KARAOKESYNC_JUST_UPDATED") == "1"
