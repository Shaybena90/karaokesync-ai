from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import (
    Camera, Case, EvidenceSource, Exhibit, Job, JobLog, JobStatus, Notification, User,
)
from ..schemas import JobCreate, JobDetail, JobLogOut, JobOut, StepOut
from ..security import client_ip, get_current_user, require_admin, require_investigator, require_viewer
from ..worker import queue
from ..worker.workflows import WORKFLOWS
from .cases import assert_can_edit
from .common import get_or_404

router = APIRouter(prefix="/api", tags=["jobs"])


def job_out(db: Session, j: Job, cls=JobOut):
    out = cls.model_validate(j)
    out.workflow_name = WORKFLOWS[j.workflow].name if j.workflow in WORKFLOWS else j.workflow
    if j.case_id:
        c = db.get(Case, j.case_id)
        out.case_reference = c.reference if c else None
    if j.exhibit_id:
        e = db.get(Exhibit, j.exhibit_id)
        out.exhibit_identifier = e.identifier if e else None
    return out


@router.get("/workflows")
def workflows(_: User = Depends(require_viewer)):
    return [{"key": w.key, "name": w.name, "description": w.description, "scope": w.scope,
             "agent_allowed": w.agent_allowed, "steps": [{"key": s.key, "name": s.name, "depends_on": list(s.depends_on)}
                                                          for s in w.steps]} for w in WORKFLOWS.values()]


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(status: Optional[JobStatus] = None, case_id: Optional[int] = None, active: bool = False,
              workflow: Optional[str] = None, limit: int = Query(100, le=500), db: Session = Depends(get_db),
              _: User = Depends(require_viewer)):
    stmt = select(Job)
    if status:
        stmt = stmt.where(Job.status == status)
    if active:
        stmt = stmt.where(Job.status.in_([JobStatus.queued, JobStatus.running, JobStatus.cancel_requested,
                                          JobStatus.awaiting_approval]))
    if case_id:
        stmt = stmt.where(Job.case_id == case_id)
    if workflow:
        stmt = stmt.where(Job.workflow == workflow)
    return [job_out(db, j) for j in db.scalars(stmt.order_by(Job.created_at.desc(), Job.id.desc()).limit(limit)).unique()]


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    j = get_or_404(db, Job, job_id, "המשימה")
    out = job_out(db, j, JobDetail)
    out.steps = [StepOut.model_validate(s) for s in j.steps]
    out.logs = [JobLogOut.model_validate(x) for x in db.scalars(
        select(JobLog).where(JobLog.job_id == j.id).order_by(JobLog.id.desc()).limit(500))][::-1]
    return out


@router.post("/jobs", response_model=JobOut, status_code=201)
def create_job(body: JobCreate, request: Request, db: Session = Depends(get_db),
               user: User = Depends(require_investigator)):
    wf = WORKFLOWS.get(body.workflow)
    if not wf:
        raise HTTPException(422, "תהליך עבודה לא מוכר")
    if wf.scope == "camera":
        raise HTTPException(422, "ייצוא הקלטות מתבצע ממסך המצלמות בלבד")
    params: dict = {}
    case_id, exhibit_id = body.case_id, body.exhibit_id
    if body.source_id:
        src = get_or_404(db, EvidenceSource, body.source_id, "מקור הראיות")
        ex = db.get(Exhibit, src.exhibit_id)
        exhibit_id, case_id = ex.id, ex.case_id
        params["source_id"] = src.id
    elif exhibit_id:
        ex = get_or_404(db, Exhibit, exhibit_id, "המוצג")
        case_id = ex.case_id
    if wf.scope == "source" and "source_id" not in params:
        raise HTTPException(422, "יש לבחור מקור ראיות מורשה לתהליך זה")
    if wf.scope == "exhibit" and not exhibit_id:
        raise HTTPException(422, "יש לבחור מוצג לתהליך זה")
    if not case_id:
        raise HTTPException(422, "יש לבחור תיק")
    case = get_or_404(db, Case, case_id, "התיק")
    assert_can_edit(case, user)
    if body.report_title:
        params["report_title"] = body.report_title
    if body.report_id:
        params["report_id"] = body.report_id
    if wf.exclusive and exhibit_id:
        dup = db.scalar(select(func.count(Job.id)).where(
            Job.exhibit_id == exhibit_id, Job.workflow == wf.key,
            Job.status.in_([JobStatus.queued, JobStatus.running, JobStatus.awaiting_approval])))
        if dup:
            raise HTTPException(409, "כבר קיימת משימה זהה פעילה או בתור עבור מוצג זה")
    title = f"{wf.name} – תיק {case.reference}"
    job = queue.enqueue(db, wf.key, user=user, title=title, case_id=case_id, exhibit_id=exhibit_id, params=params,
                        ip=client_ip(request))
    db.commit()
    return job_out(db, job)


def _transition(job_id: int, action: str, request: Request, db: Session, user: User):
    j = get_or_404(db, Job, job_id, "המשימה")
    try:
        if action == "cancel":
            queue.request_cancel(db, j, user, client_ip(request))
        elif action == "retry":
            queue.retry(db, j, user, client_ip(request))
        elif action == "approve":
            queue.approve(db, j, user, client_ip(request))
    except queue.InvalidTransition as e:
        raise HTTPException(409, str(e)) from None
    db.commit()
    return job_out(db, j)


@router.post("/jobs/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_investigator)):
    return _transition(job_id, "cancel", request, db, user)


@router.post("/jobs/{job_id}/retry", response_model=JobOut)
def retry_job(job_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_investigator)):
    return _transition(job_id, "retry", request, db, user)


@router.post("/jobs/{job_id}/approve", response_model=JobOut)
def approve_job(job_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return _transition(job_id, "approve", request, db, user)


# ---------------------------------------------------------------- SSE
@router.get("/events/stream")
async def stream(request: Request, user: User = Depends(get_current_user)):
    """זרם עדכונים (SSE): שינויי משימות והתראות חדשות. נשלף מהמסד – עמיד להפעלות מחדש."""
    uid = user.id

    def snapshot():
        with SessionLocal() as db:
            jobs = db.execute(select(Job.id, Job.status, Job.progress, Job.updated_at, Job.current_step)
                              .order_by(Job.updated_at.desc()).limit(50)).all()
            unread = db.scalar(select(func.count(Notification.id)).where(
                Notification.user_id == uid, Notification.read.is_(False))) or 0
            cams = db.scalar(select(func.max(Camera.last_test_at)))
            return ({j.id: (j.status.value, j.progress, j.updated_at.isoformat(), j.current_step) for j in jobs},
                    unread, str(cams))

    async def gen():
        prev_jobs: dict = {}
        prev_unread = -1
        prev_cam = None
        ticks = 0
        yield "retry: 3000\n\n"
        while True:
            if await request.is_disconnected():
                break
            jobs, unread, cam = await asyncio.to_thread(snapshot)
            changed = [{"id": k, "status": v[0], "progress": v[1], "step": v[3]}
                       for k, v in jobs.items() if prev_jobs.get(k) != v]
            if changed:
                yield f"event: jobs\ndata: {json.dumps(changed, ensure_ascii=False)}\n\n"
            if unread != prev_unread:
                yield f"event: notifications\ndata: {json.dumps({'unread': unread})}\n\n"
            if cam != prev_cam and prev_cam is not None:
                yield "event: cameras\ndata: {}\n\n"
            prev_jobs, prev_unread, prev_cam = jobs, unread, cam
            ticks += 1
            if ticks % 15 == 0:
                yield ": keepalive\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
