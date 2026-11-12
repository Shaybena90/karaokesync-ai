"""The audio → timed lyrics pipeline for one job."""

from __future__ import annotations

import importlib.util
import logging
import shutil
import tempfile
from datetime import datetime, timezone
from collections.abc import Callable
from pathlib import Path

from ..config import Settings
from ..supabase_client import SupabaseClient, SupabaseError
from . import alignment
from .audio_tools import encode_mp3, separate_stems, to_working_wav
from .errors import PipelineError
from .lines import lines_to_payload, split_into_lines
from .transcribe import transcribe

log = logging.getLogger("karaokesync.pipeline")

# (stage, progress%) reported to the UI
Report = Callable[[str, int], None]


def use_vocal_separation(settings: Settings) -> bool:
    if settings.vocal_separation == "on" or settings.enable_vocal_separation:
        return True
    if settings.vocal_separation == "off":
        return False
    return importlib.util.find_spec("demucs") is not None  # "auto"


def keep_instrumental(sb: SupabaseClient, settings: Settings, job: dict, rest: Path, workdir: Path) -> None:
    """Store the music without the singer as the song's melody-only track.
    Best effort: the lyrics are the job's result, this is a bonus."""
    try:
        done = sb.select("instrumental_jobs", {"audio_file_id": f"eq.{job['audio_file_id']}", "status": "eq.succeeded",
                                                "output_path": "not.is.null", "select": "id", "limit": "1"})
        if done:
            return
        mp3 = encode_mp3(rest, workdir / "instrumental.mp3")
        path = f"{job['user_id']}/{job['project_id']}/instrumental-{job['id']}.mp3"
        sb.upload_file(settings.audio_bucket, path, str(mp3), "audio/mpeg")
        sb.insert("instrumental_jobs", {
            "project_id": job["project_id"], "audio_file_id": job["audio_file_id"], "user_id": job["user_id"],
            "status": "succeeded", "progress": 100, "output_path": path, "finished_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info("job=%s kept the melody-only track", job["id"])
    except (SupabaseError, PipelineError) as exc:
        log.warning("job=%s could not keep the melody-only track (%s)", job["id"], exc)


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

        # 3. recognise the singing on the vocals alone, without the music around it
        rest = None
        if use_vocal_separation(settings):
            report("separating_vocals", 12)
            try:
                vocals, rest = separate_stems(source, workdir / "stems", settings.demucs_model,
                                              on_progress=lambda frac: report("separating_vocals", 12 + int(frac * 26)))
                working = to_working_wav(vocals, workdir / "vocals_16k.wav")
            except PipelineError as exc:
                # Separation only helps recognition; the original mix still works.
                log.warning("vocal separation failed (%s); using original mix", exc.code)
                rest = None

        # 4-6. transcription + language (the user's choice, when given)
        report("transcribing", 40)
        project = sb.select("projects", {"id": f"eq.{job['project_id']}", "select": "language"})
        transcript = transcribe(
            working,
            settings.whisper_model,
            settings.whisper_device,
            settings.whisper_compute_type,
            language=(project[0].get("language") if project else None) or None,
            on_progress=lambda frac: report("transcribing", 40 + int(frac * 45)),
            language_models=settings.language_models(),
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
        if rest is not None:
            # The separation already made the melody-only track: keep it, so
            # "without the singer" is ready at once.
            report("saving_melody", 97)
            keep_instrumental(sb, settings, job, rest, workdir)
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
