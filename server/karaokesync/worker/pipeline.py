"""The audio → timed lyrics pipeline for one job."""

from __future__ import annotations

import logging
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path

from ..config import Settings
from ..supabase_client import SupabaseClient, SupabaseError
from . import alignment
from .audio_tools import separate_vocals, to_working_wav
from .errors import PipelineError
from .lines import lines_to_payload, split_into_lines
from .transcribe import transcribe

log = logging.getLogger("karaokesync.pipeline")

# (stage, progress%) reported to the UI
Report = Callable[[str, int], None]


def run_pipeline(job: dict, sb: SupabaseClient, settings: Settings, report: Report) -> dict:
    """Run every step for a claimed job and return the payload for
    `complete_processing_job`. Temporary files are always deleted."""
    rows = sb.select("audio_files", {"id": f"eq.{job['audio_file_id']}", "select": "*"})
    if not rows or rows[0]["status"] != "verified":
        raise PipelineError("audio_missing", retryable=False)
    audio = rows[0]

    Path(settings.worker_tmp_dir).mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"job-{job['id'][:8]}-", dir=settings.worker_tmp_dir))
    try:
        # 1. download with a short-lived signed URL
        report("downloading", 5)
        ext = audio["storage_path"].rsplit(".", 1)[-1]
        source = workdir / f"source.{ext}"
        try:
            url = sb.create_signed_url(settings.audio_bucket, audio["storage_path"], 300)
            sb.download_to(url, str(source), settings.max_upload_bytes)
        except SupabaseError as exc:
            raise PipelineError("download_failed", retryable=exc.status_code >= 500) from exc

        # 2. normalise
        report("converting", 10)
        working = to_working_wav(source, workdir / "mix_16k.wav")

        # 3. optional vocal separation
        if settings.enable_vocal_separation:
            report("separating_vocals", 15)
            try:
                vocals = separate_vocals(source, workdir / "stems", settings.demucs_model)
                working = to_working_wav(vocals, workdir / "vocals_16k.wav")
            except PipelineError as exc:
                # Separation only helps recognition; the original mix still works.
                log.warning("vocal separation failed (%s); using original mix", exc.code)

        # 4-6. transcription + language detection
        report("transcribing", 40)
        transcript = transcribe(
            working,
            settings.whisper_model,
            settings.whisper_device,
            settings.whisper_compute_type,
            on_progress=lambda frac: report("transcribing", 40 + int(frac * 45)),
        )
        if not transcript.words:
            # Never invent lyrics: an empty result is reported as a failure.
            raise PipelineError("no_lyrics_detected", retryable=False)

        # 7-8. alignment
        report("aligning", 88)
        words, method = alignment.align(transcript.words, transcript.language)

        # 9. lines
        report("building_lines", 95)
        lines = split_into_lines(words)
        payload = lines_to_payload(lines, transcript.language)
        payload["alignment_method"] = method
        payload["language_probability"] = transcript.language_probability
        log.info(
            "job=%s language=%s (p=%.2f) words=%d lines=%d method=%s",
            job["id"], transcript.language, transcript.language_probability,
            sum(len(l.words) for l in lines), len(lines), method,
        )
        return payload
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
