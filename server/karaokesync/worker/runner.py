"""Worker process: claims jobs from the Postgres queue and runs the pipeline.

Run with:  python -m karaokesync.worker.runner

Several workers can run at the same time (on different machines, too):
`claim_processing_job` uses FOR UPDATE SKIP LOCKED, so a job is never handed
to two workers, and a crashed worker's job is re-claimed after its lease ends.
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import threading
import time
import uuid

from ..config import Settings, get_settings
from ..logging_setup import setup_logging
from ..supabase_client import SupabaseClient, SupabaseError
from . import gpu
from .cleanup import run_retention
from .errors import JobLost, PipelineError
from .export_pipeline import run_export
from .instrumental import run_instrumental
from .line_sync import run_line_sync
from .pipeline import run_pipeline

log = logging.getLogger("karaokesync.worker")

CLEANUP_INTERVAL_SECONDS = 3600
# Shown when the worker starts, to tell an up-to-date worker from an old copy.
WORKER_VERSION = "2026-11-14 (remote control)"


class Heartbeat:
    """Keeps the job lease alive in a background thread and relays progress.

    `kind` is "processing" (AI pipeline), "export" (video render), "sync"
    (automatic sync of words typed in the editor) or "instrumental" (melody only)."""

    MIN_BEAT_INTERVAL = 3.0

    def __init__(self, sb: SupabaseClient, job_id: str, worker_id: str, lease_seconds: int, kind: str = "processing"):
        self.sb, self.job_id, self.worker_id, self.lease, self.kind = sb, job_id, worker_id, lease_seconds, kind
        self.stage, self.progress = "starting", 0
        self._beat_progress, self._beat_at = 0, 0.0
        self.lost = threading.Event()
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def __enter__(self) -> Heartbeat:
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def report(self, stage: str, progress: int) -> None:
        if self.lost.is_set():
            raise JobLost(self.job_id)
        changed_stage = stage != self.stage
        self.stage, self.progress = stage, progress
        # Send immediately on a new stage, or when progress moved noticeably.
        recent = time.monotonic() - self._beat_at < self.MIN_BEAT_INTERVAL
        if changed_stage or (progress - self._beat_progress >= 5 and not recent):
            self._beat()

    def report_progress(self, progress: int) -> None:
        self.report("rendering", progress)

    def _beat(self) -> None:
        with self._lock:
            self._beat_progress, self._beat_at = self.progress, time.monotonic()
            base = {"p_job_id": self.job_id, "p_worker_id": self.worker_id, "p_lease_seconds": self.lease,
                    "p_progress": self.progress}
            try:
                if self.kind in ("export", "sync", "instrumental"):
                    ok = self.sb.rpc(f"heartbeat_{self.kind}_job", base)
                else:
                    ok = self.sb.rpc("heartbeat_processing_job", {**base, "p_stage": self.stage})
                if ok is False:
                    self.lost.set()
            except Exception as exc:  # network blip: the lease is long enough to survive one
                log.warning("heartbeat failed: %s", type(exc).__name__)

    def _loop(self) -> None:
        interval = max(5, self.lease // 4)
        while not self._stop.wait(interval):
            self._beat()


def process_one(sb: SupabaseClient, settings: Settings, worker_id: str, on_activity=None) -> bool:
    """Claim and run a single job. Editor syncs come first (someone is waiting
    for a few seconds of work), then AI processing, then melody-only tracks,
    then video exports (which may need a melody-only track).
    Returns False if every queue was empty."""
    lease = settings.worker_lease_seconds
    syncs = _claim_optional(sb, "claim_sync_job", worker_id, lease)
    if syncs:
        _activity(on_activity, "sync")
        try:
            _run_sync(sb, settings, worker_id, syncs[0])
        finally:
            _activity(on_activity, "idle")
        return True
    jobs = sb.rpc("claim_processing_job", {"p_worker_id": worker_id, "p_lease_seconds": lease})
    if jobs:
        _activity(on_activity, "processing")
        try:
            _run_processing(sb, settings, worker_id, jobs[0])
        finally:
            _activity(on_activity, "idle")
        return True
    instrumentals = _claim_optional(sb, "claim_instrumental_job", worker_id, lease)
    if instrumentals:
        _activity(on_activity, "melody")
        try:
            _run_instrumental(sb, settings, worker_id, instrumentals[0])
        finally:
            _activity(on_activity, "idle")
        return True
    exports = sb.rpc("claim_export_job", {"p_worker_id": worker_id, "p_lease_seconds": lease})
    if exports:
        _activity(on_activity, "export")
        try:
            _run_export(sb, settings, worker_id, exports[0])
        finally:
            _activity(on_activity, "idle")
        return True
    return False


def _activity(callback, kind: str) -> None:
    if callback:
        callback(kind)


class Presence:
    """Tells the website this worker is alive and what it does (the job kind
    only, never song titles), every 15 s from a background thread, so it keeps
    reporting during long jobs. The answer says whether the owner paused
    processing from the website."""

    INTERVAL = 15

    def __init__(self, sb: SupabaseClient, worker_id: str, version: str, device: str):
        self.sb, self.worker_id, self.version, self.device = sb, worker_id, version, device
        self.activity = "idle"
        self.paused = threading.Event()
        self.available = True
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def start(self) -> None:
        self.check_in()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def set_activity(self, kind: str) -> None:
        if kind != self.activity:
            self.activity = kind
            self.check_in()

    def check_in(self) -> None:
        if not self.available:
            return
        try:
            paused = self.sb.rpc("worker_checkin", {"p_worker_id": self.worker_id, "p_version": self.version,
                                                    "p_device": self.device, "p_activity": self.activity})
        except SupabaseError as exc:
            if exc.status_code == 404:
                self.available = False
                log.warning("remote control is off: run supabase/migrations/20261114000001_worker_control.sql")
            return
        except Exception as exc:  # network blip: try again next time
            log.warning("check-in failed: %s", type(exc).__name__)
            return
        if paused and not self.paused.is_set():
            log.info("paused from the website: finishing the current job, then waiting")
            self.paused.set()
        elif not paused and self.paused.is_set():
            log.info("resumed from the website")
            self.paused.clear()

    def _loop(self) -> None:
        while not self._stop.wait(self.INTERVAL):
            self.check_in()


# Queues added after the first release, and the SQL file that creates each.
OPTIONAL_QUEUES = {
    "claim_sync_job": "20261102000001_sync_jobs.sql (automatic sync)",
    "claim_instrumental_job": "20261112000001_instrumentals.sql (melody only)",
}
_unavailable: set[str] = set()


def _claim_optional(sb: SupabaseClient, fn: str, worker_id: str, lease: int) -> list:
    """Claim from a newer queue. If the database does not have it yet (its SQL
    file was not run), keep processing songs and say so once."""
    if fn in _unavailable:
        return []
    try:
        return sb.rpc(fn, {"p_worker_id": worker_id, "p_lease_seconds": lease}) or []
    except SupabaseError as exc:
        if exc.status_code != 404:
            raise
        _unavailable.add(fn)
        log.warning("%s is off: run supabase/migrations/%s in Supabase", fn, OPTIONAL_QUEUES[fn])
        return []


def _run_processing(sb: SupabaseClient, settings: Settings, worker_id: str, job: dict) -> None:
    log.info("claimed job=%s project=%s attempt=%s", job["id"], job["project_id"], job["attempts"])
    with Heartbeat(sb, job["id"], worker_id, settings.worker_lease_seconds) as hb:
        try:
            payload = run_pipeline(job, sb, settings, hb.report)
            if hb.lost.is_set():
                raise JobLost(job["id"])
            ok = sb.rpc("complete_processing_job", {"p_job_id": job["id"], "p_worker_id": worker_id, "p_result": payload})
            log.info("job=%s %s", job["id"], "succeeded" if ok else "lost before completion")
        except JobLost:
            log.warning("job=%s lease lost (project deleted or re-claimed); dropping result", job["id"])
        except PipelineError as exc:
            log.warning("job=%s failed code=%s retryable=%s", job["id"], exc.code, exc.retryable)
            _fail(sb, "fail_processing_job", job, worker_id, exc.code, exc.retryable)
        except Exception as exc:
            log.exception("job=%s unexpected error: %s", job["id"], type(exc).__name__)
            _fail(sb, "fail_processing_job", job, worker_id, "internal_error", True)


def _run_instrumental(sb: SupabaseClient, settings: Settings, worker_id: str, job: dict) -> None:
    log.info("claimed instrumental=%s project=%s attempt=%s", job["id"], job["project_id"], job["attempts"])
    with Heartbeat(sb, job["id"], worker_id, settings.worker_lease_seconds, kind="instrumental") as hb:
        try:
            path = run_instrumental(job, sb, settings, hb.report_progress)
            if hb.lost.is_set():
                raise JobLost(job["id"])
            ok = sb.rpc("complete_instrumental_job", {"p_job_id": job["id"], "p_worker_id": worker_id, "p_output_path": path})
            if not ok:  # project deleted or job re-claimed meanwhile: do not leave an orphan file
                sb.remove_objects(settings.audio_bucket, [path])
            log.info("instrumental=%s %s", job["id"], "succeeded" if ok else "lost before completion")
        except JobLost:
            log.warning("instrumental=%s lease lost; dropping result", job["id"])
        except PipelineError as exc:
            log.warning("instrumental=%s failed code=%s retryable=%s", job["id"], exc.code, exc.retryable)
            _fail(sb, "fail_instrumental_job", job, worker_id, exc.code, exc.retryable)
        except Exception as exc:
            log.exception("instrumental=%s unexpected error: %s", job["id"], type(exc).__name__)
            _fail(sb, "fail_instrumental_job", job, worker_id, "internal_error", True)


def _run_export(sb: SupabaseClient, settings: Settings, worker_id: str, job: dict) -> None:
    log.info("claimed export=%s project=%s attempt=%s", job["id"], job["project_id"], job["attempts"])
    with Heartbeat(sb, job["id"], worker_id, settings.worker_lease_seconds, kind="export") as hb:
        try:
            path = run_export(job, sb, settings, hb.report_progress)
            if hb.lost.is_set():
                raise JobLost(job["id"])
            ok = sb.rpc("complete_export_job", {"p_job_id": job["id"], "p_worker_id": worker_id, "p_output_path": path})
            if not ok:  # deleted or re-claimed meanwhile: do not leave an orphan file
                sb.remove_objects(settings.exports_bucket, [path])
            log.info("export=%s %s", job["id"], "succeeded" if ok else "lost before completion")
        except JobLost:
            log.warning("export=%s lease lost; dropping result", job["id"])
        except PipelineError as exc:
            log.warning("export=%s failed code=%s retryable=%s", job["id"], exc.code, exc.retryable)
            _fail(sb, "fail_export_job", job, worker_id, exc.code, exc.retryable)
        except Exception as exc:
            log.exception("export=%s unexpected error: %s", job["id"], type(exc).__name__)
            _fail(sb, "fail_export_job", job, worker_id, "internal_error", True)


def _run_sync(sb: SupabaseClient, settings: Settings, worker_id: str, job: dict) -> None:
    log.info("claimed sync=%s project=%s words=%d", job["id"], job["project_id"], len(job["words"]))
    with Heartbeat(sb, job["id"], worker_id, settings.worker_lease_seconds, kind="sync") as hb:
        try:
            result = run_line_sync(job, sb, settings, hb.report_progress)
            if hb.lost.is_set():
                raise JobLost(job["id"])
            ok = sb.rpc("complete_sync_job", {"p_job_id": job["id"], "p_worker_id": worker_id, "p_result": result})
            log.info("sync=%s %s", job["id"], "succeeded" if ok else "lost before completion")
        except JobLost:
            log.warning("sync=%s lease lost; dropping result", job["id"])
        except PipelineError as exc:
            log.warning("sync=%s failed code=%s retryable=%s", job["id"], exc.code, exc.retryable)
            _fail(sb, "fail_sync_job", job, worker_id, exc.code, exc.retryable)
        except Exception as exc:
            log.exception("sync=%s unexpected error: %s", job["id"], type(exc).__name__)
            _fail(sb, "fail_sync_job", job, worker_id, "internal_error", True)


def _fail(sb: SupabaseClient, fn: str, job: dict, worker_id: str, code: str, retryable: bool) -> None:
    try:
        sb.rpc(fn, {"p_job_id": job["id"], "p_worker_id": worker_id, "p_error_code": code, "p_retryable": retryable})
    except Exception:
        # If even this fails, the lease expires and the job is re-claimed or failed.
        log.exception("could not record failure for job=%s", job["id"])


def main() -> None:
    setup_logging()
    settings = get_settings()
    sb = SupabaseClient(settings)
    worker_id = settings.worker_id or f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"

    stopping = threading.Event()

    def _stop(*_):
        log.info("shutdown requested; finishing current job first")
        stopping.set()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    log.info("worker %s started (env=%s, version=%s)", worker_id, settings.app_env, WORKER_VERSION)
    gpu.register_cuda_dlls()
    for line in gpu.summary():
        log.info(line)
    card = gpu.torch_gpu()
    device = f"GPU ({card})" if card or gpu.whisper_gpus() else "CPU"
    presence = Presence(sb, worker_id, WORKER_VERSION, device)
    presence.start()
    last_cleanup = 0.0
    try:
        while not stopping.is_set():
            if presence.paused.is_set():
                stopping.wait(settings.worker_poll_seconds)
                continue
            try:
                if time.monotonic() - last_cleanup > CLEANUP_INTERVAL_SECONDS:
                    run_retention(sb, settings)
                    last_cleanup = time.monotonic()
                if not process_one(sb, settings, worker_id, presence.set_activity):
                    stopping.wait(settings.worker_poll_seconds)
            except Exception as exc:
                log.error("worker loop error: %s", type(exc).__name__)
                stopping.wait(10)
    finally:
        presence.stop()
        presence.set_activity("stopped")
    log.info("worker stopped")


if __name__ == "__main__":
    main()
