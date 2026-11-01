from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db, utcnow
from ..models import Approval, Case, Decision, Report, ReportRevision, ReportStatus, RoleName, User
from ..schemas import ApprovalOut, DecisionIn, ReportCreate, ReportDetail, ReportOut, RevisionOut
from ..security import client_ip, require_investigator, require_viewer, storage_path
from ..services.reports import render_files
from ..worker import queue
from .cases import assert_can_edit
from .common import get_or_404
from .jobs import job_out

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _out(db: Session, r: Report, cls=ReportOut):
    out = cls.model_validate(r)
    c = db.get(Case, r.case_id)
    out.case_reference = c.reference if c else ""
    return out


@router.get("", response_model=list[ReportOut])
def list_reports(case_id: Optional[int] = None, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(Report)
    if case_id:
        stmt = stmt.where(Report.case_id == case_id)
    return [_out(db, r) for r in db.scalars(stmt.order_by(Report.updated_at.desc()))]


@router.post("")
def create_report(body: ReportCreate, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_investigator)):
    """הפקת דוח מתבצעת כמשימה בתור (מתועדת ועמידה)."""
    case = get_or_404(db, Case, body.case_id, "התיק")
    assert_can_edit(case, user)
    job = queue.enqueue(db, "report", user=user, title=f"הפקת דוח – תיק {case.reference}", case_id=case.id,
                        params={"report_title": body.title}, ip=client_ip(request))
    db.commit()
    return job_out(db, job)


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(report_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    r = get_or_404(db, Report, report_id, "הדוח")
    out = _out(db, r, ReportDetail)
    out.revisions = [RevisionOut.model_validate(x) for x in r.revisions]
    out.approvals = [ApprovalOut.model_validate(a) for a in db.scalars(
        select(Approval).where(Approval.entity_type == "report", Approval.entity_id == r.id).order_by(Approval.id))]
    cur = next((x for x in r.revisions if x.revision == r.current_revision), None)
    out.content = cur.content if cur else {}
    return out


@router.post("/{report_id}/regenerate")
def regenerate(report_id: int, request: Request, db: Session = Depends(get_db),
               user: User = Depends(require_investigator)):
    r = get_or_404(db, Report, report_id, "הדוח")
    assert_can_edit(db.get(Case, r.case_id), user)
    job = queue.enqueue(db, "report", user=user, title=f"גרסה חדשה לדוח #{r.id}", case_id=r.case_id,
                        params={"report_id": r.id, "change_note": "גרסה חדשה לפי בקשת חוקר"}, ip=client_ip(request))
    db.commit()
    return job_out(db, job)


@router.post("/{report_id}/submit", response_model=ReportOut)
def submit(report_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_investigator)):
    r = get_or_404(db, Report, report_id, "הדוח")
    if r.status not in (ReportStatus.draft, ReportStatus.rejected):
        raise HTTPException(409, "ניתן להגיש לבדיקה רק טיוטה")
    r.status = ReportStatus.in_review
    audit.record(db, "report.submit", f"דוח #{r.id} הוגש לבדיקה", user=user, entity_type="report", entity_id=r.id,
                 ip=client_ip(request), commit=True)
    return _out(db, r)


@router.post("/{report_id}/decision", response_model=ReportOut)
def decide(report_id: int, body: DecisionIn, request: Request, db: Session = Depends(get_db),
           user: User = Depends(require_investigator)):
    r = get_or_404(db, Report, report_id, "הדוח")
    if r.status != ReportStatus.in_review:
        raise HTTPException(409, "ניתן לאשר או לדחות רק דוח שהוגש לבדיקה")
    rev = next(x for x in r.revisions if x.revision == r.current_revision)
    if rev.created_by_id == user.id and user.role.name != RoleName.admin:
        raise HTTPException(403, "חוקר אינו רשאי לאשר גרסת דוח שהפיק בעצמו – נדרש בודק נוסף או מנהל")
    if body.decision == "rejected" and not body.comment.strip():
        raise HTTPException(422, "יש לפרט סיבת דחייה")
    ap = Approval(entity_type="report", entity_id=r.id, revision=rev.revision, decision=Decision(body.decision),
                  comment=body.comment, user_id=user.id)
    db.add(ap)
    db.flush()
    db.refresh(ap)
    if body.decision == "approved":
        r.status, r.approved_by_id, r.approved_at = ReportStatus.approved, user.id, utcnow()
        render_files(db, rev, ap)
    else:
        r.status = ReportStatus.rejected
    audit.record(db, f"report.{body.decision}", f"דוח #{r.id} גרסה {rev.revision}: "
                 f"{'אושר' if body.decision == 'approved' else 'נדחה'}", user=user, entity_type="report",
                 entity_id=r.id, details={"comment": body.comment, "pdf_sha256": rev.pdf_sha256},
                 ip=client_ip(request))
    db.commit()
    return _out(db, r)


@router.get("/{report_id}/download/{revision}/{fmt}")
def download(report_id: int, revision: int, fmt: str, request: Request, db: Session = Depends(get_db),
             user: User = Depends(require_viewer)):
    r = get_or_404(db, Report, report_id, "הדוח")
    rev = db.scalar(select(ReportRevision).where(ReportRevision.report_id == r.id, ReportRevision.revision == revision))
    if not rev or fmt not in ("pdf", "docx"):
        raise HTTPException(404, "הגרסה או הפורמט לא נמצאו")
    p = storage_path(rev.pdf_path if fmt == "pdf" else rev.docx_path)
    if not p.is_file():
        raise HTTPException(404, "הקובץ אינו קיים באחסון")
    audit.record(db, "report.download", f"הורדת דוח #{r.id} גרסה {revision} ({fmt.upper()})", user=user,
                 entity_type="report", entity_id=r.id, ip=client_ip(request), commit=True)
    mt = "application/pdf" if fmt == "pdf" else \
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case = db.get(Case, r.case_id)
    name = f"SceneOps_{case.reference.replace('/', '-')}_report{r.id}_r{revision}.{fmt}"
    return FileResponse(p, media_type=mt, filename=name,
                        content_disposition_type="inline" if fmt == "pdf" else "attachment")
