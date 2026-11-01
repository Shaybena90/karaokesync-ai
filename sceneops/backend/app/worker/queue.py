"""תור משימות עמיד מבוסס מסד נתונים ומכונת מצבים מפורשת.

מצבים:  awaiting_approval → queued → running → succeeded | failed | cancelled
         running → cancel_requested → cancelled
         failed | cancelled → queued (ניסיון חוזר, ממשיך משלב שלא הושלם)
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import and_, exists, select, update
from sqlalchemy.orm import Session, aliased

from .. import audit
from ..config import get_settings
from ..db import utcnow
from ..models import Job, JobLog, JobStatus, JobStep, StepStatus, User
from .workflows import WORKFLOWS

ALLOWED: dict[JobStatus, set[JobStatus]] = {
    JobStatus.awaiting_approval: {JobStatus.queued, JobStatus.cancelled},
    JobStatus.queued: {JobStatus.running, JobStatus.cancelled},
    JobStatus.running: {JobStatus.succeeded, JobStatus.failed, JobStatus.cancel_requested,
                        JobStatus.cancelled, JobStatus.queued},
    JobStatus.cancel_requested: {JobStatus.cancelled, JobStatus.failed, JobStatus.succeeded},
    JobStatus.failed: {JobStatus.queued},
    JobStatus.cancelled: {JobStatus.queued},
    JobStatus.succeeded: set(),
}

ACTIVE = (JobStatus.running, JobStatus.cancel_requested)


class InvalidTransition(Exception):
    pass


def transition(job: Job, new: JobStatus) -> None:
    if new not in ALLOWED[job.status]:
        raise InvalidTransition(f"מעבר לא חוקי: {job.status.value} → {new.value}")
    job.status = new


def log(db: Session, job_id: int, message: str, level: str = "info", step_key: str = "") -> None:
    db.add(JobLog(job_id=job_id, message=message[:4000], level=level, step_key=step_key))


def enqueue(db: Session, workflow: str, *, user: User | None, title: str | None = None,
            case_id: int | None = None, exhibit_id: int | None = None, camera_id: int | None = None,
            params: dict[str, Any] | None = None, requires_approval: bool = False,
            executor: str = "local_worker", agent_id: int | None = None, is_simulation: bool = False,
            ip: str = "") -> Job:
    wf = WORKFLOWS[workflow]
    job = Job(
        workflow=workflow, title=title or wf.name, case_id=case_id, exhibit_id=exhibit_id, camera_id=camera_id,
        params=params or {}, exclusive=wf.exclusive, requires_approval=requires_approval,
        status=JobStatus.awaiting_approval if requires_approval else JobStatus.queued,
        executor=executor, agent_id=agent_id, is_simulation=is_simulation,
        created_by_id=user.id if user else None,
    )
    for i, s in enumerate(wf.steps):
        job.steps.append(JobStep(order=i, key=s.key, name=s.name, depends_on=list(s.depends_on),
                                 max_retries=s.max_retries))
    db.add(job)
    db.flush()
    log(db, job.id, f"המשימה נוצרה: {wf.name}" + (" – ממתינה לאישור" if requires_approval else ""))
    audit.record(db, "job.create", f"נוצרה משימה #{job.id}: {job.title}", user=user, entity_type="job",
                 entity_id=job.id, details={"workflow": workflow, "params": params or {}, "executor": executor},
                 ip=ip)
    return job


def claim_next(db: Session, worker_id: str, executor: str = "local_worker",
               agent_id: int | None = None, allowed_workflows: set[str] | None = None) -> Job | None:
    """תפיסה אטומית של המשימה הבאה. משימה בלעדית לא תרוץ במקביל לאחרת על אותו מוצג."""
    other = aliased(Job)
    busy = exists().where(and_(other.exhibit_id == Job.exhibit_id, other.status.in_(ACTIVE),
                               other.exclusive.is_(True), other.id != Job.id))
    q = (select(Job.id).where(Job.status == JobStatus.queued, Job.executor == executor)
         .where((Job.exclusive.is_(False)) | (Job.exhibit_id.is_(None)) | ~busy)
         .order_by(Job.created_at, Job.id).limit(5))
    if agent_id is not None:
        q = q.where((Job.agent_id == agent_id) | (Job.agent_id.is_(None)))
    if allowed_workflows is not None:
        q = q.where(Job.workflow.in_(allowed_workflows))
    for (jid,) in db.execute(q).all():
        lease = utcnow() + timedelta(seconds=get_settings().worker_lease_seconds)
        res = db.execute(update(Job).where(Job.id == jid, Job.status == JobStatus.queued).values(
            status=JobStatus.running, worker_id=worker_id, lease_until=lease, attempts=Job.attempts + 1,
            started_at=utcnow(), agent_id=agent_id if agent_id is not None else Job.agent_id))
        db.commit()
        if res.rowcount == 1:
            return db.get(Job, jid)
    return None


def recover_stale(db: Session) -> int:
    """משימות שהעובד שלהן נפל (חכירה פגה) חוזרות לתור ומתחדשות בגבול השלב."""
    now = utcnow()
    n = 0
    for job in db.scalars(select(Job).where(Job.status.in_(ACTIVE), Job.lease_until < now)):
        for st in job.steps:
            if st.status == StepStatus.running:
                st.status = StepStatus.pending
        if job.status == JobStatus.cancel_requested:
            job.status = JobStatus.cancelled
            job.finished_at = now
            log(db, job.id, "המשימה בוטלה לאחר הפסקת העובד", "warning")
        elif job.attempts >= job.max_attempts:
            job.status = JobStatus.failed
            job.error = "העובד הופסק שוב ושוב – המשימה סומנה כנכשלה"
            job.finished_at = now
        else:
            job.status = JobStatus.queued
            log(db, job.id, "העובד הופסק – המשימה הוחזרה לתור ותמשיך מהשלב שלא הושלם", "warning")
        n += 1
    db.commit()
    return n


def request_cancel(db: Session, job: Job, user: User, ip: str = "") -> None:
    if job.status in (JobStatus.queued, JobStatus.awaiting_approval):
        transition(job, JobStatus.cancelled)
        job.finished_at = utcnow()
        for st in job.steps:
            if st.status == StepStatus.pending:
                st.status = StepStatus.cancelled
    elif job.status == JobStatus.running:
        transition(job, JobStatus.cancel_requested)
    else:
        raise InvalidTransition("לא ניתן לבטל משימה במצב הנוכחי")
    log(db, job.id, f"בקשת ביטול על ידי {user.full_name}", "warning")
    audit.record(db, "job.cancel", f"בקשת ביטול משימה #{job.id}", user=user, entity_type="job",
                 entity_id=job.id, ip=ip)


def retry(db: Session, job: Job, user: User, ip: str = "") -> None:
    transition(job, JobStatus.queued)
    job.error = ""
    job.finished_at = None
    job.attempts = 0
    for st in job.steps:
        if st.status in (StepStatus.failed, StepStatus.cancelled, StepStatus.running):
            st.status = StepStatus.pending
            st.attempts = 0
            st.error = ""
    log(db, job.id, f"ניסיון חוזר הופעל על ידי {user.full_name} – שלבים שהושלמו לא ירוצו שוב")
    audit.record(db, "job.retry", f"ניסיון חוזר למשימה #{job.id}", user=user, entity_type="job",
                 entity_id=job.id, ip=ip)


def approve(db: Session, job: Job, user: User, ip: str = "") -> None:
    transition(job, JobStatus.queued)
    job.approved_by_id = user.id
    job.approved_at = utcnow()
    log(db, job.id, f"המשימה אושרה לביצוע על ידי {user.full_name}")
    audit.record(db, "job.approve", f"אישור משימה #{job.id}", user=user, entity_type="job",
                 entity_id=job.id, ip=ip)
