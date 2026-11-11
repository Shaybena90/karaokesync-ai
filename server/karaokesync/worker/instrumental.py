"""Melody only: remove the singer's voice from a song with Demucs.

The song is split into the vocals and everything else; the rest of the music
is encoded as MP3 and stored next to the song in the private audio bucket.
It keeps the song's exact timeline, so the lyrics stay in sync.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path

from ..config import Settings
from ..supabase_client import SupabaseClient, SupabaseError
from .audio_tools import encode_mp3, separate_stems
from .errors import PipelineError

log = logging.getLogger("karaokesync.instrumental")


def run_instrumental(job: dict, sb: SupabaseClient, settings: Settings, report: Callable[[int], None]) -> str:
    """Create the instrumental for a claimed job. Returns its storage path."""
    rows = sb.select("audio_files", {"id": f"eq.{job['audio_file_id']}", "select": "*"})
    if not rows or rows[0]["status"] != "verified":
        raise PipelineError("audio_missing", retryable=False)
    audio = rows[0]

    Path(settings.worker_tmp_dir).mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"instr-{job['id'][:8]}-", dir=settings.worker_tmp_dir))
    try:
        report(2)
        source = workdir / f"song.{audio['storage_path'].rsplit('.', 1)[-1]}"
        try:
            url = sb.create_signed_url(settings.audio_bucket, audio["storage_path"], 300)
            sb.download_to(url, str(source), settings.max_upload_bytes)
        except SupabaseError as exc:
            raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc

        report(5)
        _, rest = separate_stems(source, workdir / "stems", settings.demucs_model,
                                 on_progress=lambda frac: report(5 + int(frac * 85)))
        report(92)
        mp3 = encode_mp3(rest, workdir / "instrumental.mp3")

        report(96)
        path = f"{job['user_id']}/{job['project_id']}/instrumental-{job['id']}.mp3"
        try:
            sb.upload_file(settings.audio_bucket, path, str(mp3), "audio/mpeg")
        except SupabaseError as exc:
            if exc.status_code == 413:
                raise PipelineError("instrumental_too_large", retryable=False) from exc
            raise PipelineError("instrumental_upload_failed", retryable=True) from exc
        log.info("instrumental job=%s stored (%d bytes)", job["id"], mp3.stat().st_size)
        return path
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
