"""עובד משימות מקומי: תופס משימות מהתור ומריץ שלבים בסדר, עם ניסיונות חוזרים וביטול בטוח.

הפעלה:  python -m app.worker
"""
from __future__ import annotations

import logging
import os
import signal
import socket
import time
import traceback

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..db import SessionLocal, utcnow
from ..models import Agent, AgentKind, Exhibit, ExhibitStatus, Job, JobStatus, NotificationLevel, StepStatus
from ..services.media import Cancelled
from . import queue
from .steps import HANDLERS, StepContext, StepError
from .workflows import WORKFLOWS

log = logging.getLogger("sceneops.worker")
_stop = False


def _finish(db: Session, job: Job, status: JobStatus, error: str = "") -> None:
    queue.transition(job, status)
    job.finished_at = utcnow()
    job.lease_until = None
    job.error = error
    if status == JobStatus.succeeded:
        job.progress = 100.0
    link = f"/automation?job={job.id}"
    if status == JobStatus.succeeded:
        audit.notify_all(db, f"הושלם {job.title}", f"משימה #{job.id} הסתיימה בהצלחה",
                         level=NotificationLevel.success, link=link, job_id=job.id)
    elif status == JobStatus.failed:
        audit.notify_all(db, f"משימה נכשלה – {job.title}", error[:300], level=NotificationLevel.error,
                         link=link, job_id=job.id)
    elif status == JobStatus.cancelled:
        audit.notify_all(db, f"משימה בוטלה – {job.title}", f"משימה #{job.id} בוטלה בגבול בטוח",
                         level=NotificationLevel.warning, link=link, job_id=job.id)
    if job.exhibit_id and job.workflow in ("full_media", "working_copy", "camera_export_sim"):
        ex = db.get(Exhibit, job.exhibit_id)
        if ex:
            ex.status = ExhibitStatus.processed if status == JobStatus.succeeded else ExhibitStatus.registered
    from ..services.labels import JOB_STATUS  # noqa: PLC0415
    audit.record(db, f"job.{status.value}", f"{job.title} – {JOB_STATUS[status.value]} (משימה #{job.id})",
                 actor=f"worker:{job.worker_id}", entity_type="job", entity_id=job.id,
                 details={"error": error[:500]} if error else {})
    db.commit()


def run_job(db: Session, job: Job, worker_id: str) -> JobStatus:
    wf = WORKFLOWS[job.workflow]
    weights = [s.weight for s in wf.steps]
    queue.log(db, job.id, f"העובד {worker_id} התחיל בביצוע (ניסיון {job.attempts})")
    if job.exhibit_id and job.workflow in ("full_media", "working_copy", "camera_export_sim"):
        ex = db.get(Exhibit, job.exhibit_id)
        if ex:
            ex.status = ExhibitStatus.processing
    db.commit()
    by_key = {s.key: s for s in job.steps}
    for idx, step in enumerate(job.steps):
        if step.status in (StepStatus.succeeded, StepStatus.skipped):
            continue
        missing = [d for d in step.depends_on if by_key.get(d) and by_key[d].status != StepStatus.succeeded]
        if missing:
            step.status = StepStatus.skipped
            step.message = "דולג – שלבים קודמים לא הושלמו"
            db.commit()
            continue
        while True:
            db.refresh(job)
            if job.status == JobStatus.cancel_requested:
                step.status = StepStatus.cancelled
                _finish(db, job, JobStatus.cancelled)
                return job.status
            step.status, step.started_at, step.error = StepStatus.running, utcnow(), ""
            step.attempts += 1
            job.current_step = step.name
            db.commit()
            ctx = StepContext(db, job, step, worker_id, idx, weights)
            try:
                HANDLERS[step.key](ctx)
                step.status, step.progress, step.finished_at = StepStatus.succeeded, 1.0, utcnow()
                ctx.progress(1.0, force=True)
                db.commit()
                break
            except Cancelled:
                db.rollback()
                step.status, step.finished_at = StepStatus.cancelled, utcnow()
                step.message = "בוטל בגבול בטוח"
                queue.log(db, job.id, f"השלב '{step.name}' בוטל בגבול בטוח", "warning", step.key)
                for s in job.steps[idx + 1:]:
                    if s.status == StepStatus.pending:
                        s.status = StepStatus.cancelled
                _finish(db, job, JobStatus.cancelled)
                return job.status
            except Exception as e:  # noqa: BLE001
                db.rollback()
                permanent = isinstance(e, StepError) and e.permanent
                msg = str(e) or e.__class__.__name__
                step.error = msg
                queue.log(db, job.id, f"שגיאה בשלב '{step.name}': {msg}", "error", step.key)
                if not isinstance(e, StepError):
                    log.error("step failure: %s", traceback.format_exc())
                if not permanent and step.attempts <= step.max_retries:
                    queue.log(db, job.id, f"ניסיון חוזר {step.attempts}/{step.max_retries}", "warning", step.key)
                    db.commit()
                    time.sleep(min(2 ** step.attempts, 10))
                    continue
                step.status, step.finished_at = StepStatus.failed, utcnow()
                for s in job.steps[idx + 1:]:
                    if s.status == StepStatus.pending:
                        s.status = StepStatus.skipped
                _finish(db, job, JobStatus.failed, f"{step.name}: {msg}")
                return job.status
    skipped = [s.name for s in job.steps if s.status == StepStatus.skipped]
    if skipped:
        _finish(db, job, JobStatus.failed, "שלבים לא בוצעו בשל תלויות שלא הושלמו: " + ", ".join(skipped))
        return job.status
    _finish(db, job, JobStatus.succeeded)
    return job.status


def heartbeat(db: Session, worker_id: str) -> None:
    ag = db.scalar(select(Agent).where(Agent.kind == AgentKind.local_worker, Agent.name == "מנוע משימות מקומי"))
    if not ag:
        ag = Agent(name="מנוע משימות מקומי", kind=AgentKind.local_worker, agent_key=f"local-{socket.gethostname()}"[:64],
                   allowed_job_types=list(WORKFLOWS))
        db.add(ag)
    ag.last_seen_at, ag.host, ag.version, ag.last_ip = utcnow(), worker_id, "0.1.0", "127.0.0.1"
    db.commit()


def run_once(worker_id: str = "test-worker") -> Job | None:
    """מריץ משימה אחת (לשימוש בבדיקות ובהדגמה)."""
    with SessionLocal() as db:
        queue.recover_stale(db)
        job = queue.claim_next(db, worker_id)
        if job:
            run_job(db, job, worker_id)
        return job


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    settings = get_settings()

    def _sig(*_):
        global _stop
        _stop = True
        log.info("עצירה מבוקשת – העובד יסיים בגבול בטוח")

    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)
    log.info("SceneOps AI worker %s started", worker_id)
    last_recover = 0.0
    while not _stop:
        try:
            with SessionLocal() as db:
                heartbeat(db, worker_id)
                if time.monotonic() - last_recover > 15:
                    n = queue.recover_stale(db)
                    if n:
                        log.info("recovered %d stale jobs", n)
                    last_recover = time.monotonic()
                job = queue.claim_next(db, worker_id)
                if job:
                    log.info("running job #%s %s", job.id, job.workflow)
                    run_job(db, job, worker_id)
                    continue
        except Exception:  # noqa: BLE001
            log.error("worker loop error: %s", traceback.format_exc())
        time.sleep(settings.worker_poll_seconds)


if __name__ == "__main__":
    main()
