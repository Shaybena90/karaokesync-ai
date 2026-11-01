from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db, utcnow
from ..models import (
    Case, CaseStatus, CustodyEvent, CustodyType, EvidenceSource, Exhibit, Job, JobStatus, MediaFile, Priority,
    RoleName, User,
)
from ..schemas import (
    CaseIn, CaseOut, CaseUpdate, CustodyIn, CustodyOut, ExhibitIn, ExhibitOut, ExhibitUpdate, SourceIn, SourceOut,
)
from ..security import PathNotAuthorized, client_ip, ensure_source_path, require_investigator, require_viewer
from .common import get_or_404

router = APIRouter(prefix="/api", tags=["cases"])

_PRIO_ORDER = {Priority.critical: 0, Priority.high: 1, Priority.medium: 2, Priority.low: 3}


def assert_can_edit(case: Case, user: User) -> None:
    if user.role.name == RoleName.admin:
        return
    if case.status == CaseStatus.archived:
        raise HTTPException(409, "התיק בארכיון – לא ניתן לערוך")
    if case.assigned_to_id not in (None, user.id):
        raise HTTPException(403, "רק החוקר האחראי או מנהל מערכת רשאים לערוך תיק זה")


def _case_out(db: Session, c: Case) -> CaseOut:
    out = CaseOut.model_validate(c)
    out.exhibit_count = db.scalar(select(func.count(Exhibit.id)).where(Exhibit.case_id == c.id)) or 0
    out.media_count = db.scalar(select(func.count(MediaFile.id)).where(MediaFile.case_id == c.id)) or 0
    out.active_jobs = db.scalar(select(func.count(Job.id)).where(
        Job.case_id == c.id, Job.status.in_([JobStatus.queued, JobStatus.running, JobStatus.cancel_requested]))) or 0
    return out


@router.get("/cases", response_model=list[CaseOut])
def list_cases(q: Optional[str] = Query(None, max_length=100), status: Optional[CaseStatus] = None,
               priority: Optional[Priority] = None, assigned_to_id: Optional[int] = None,
               include_archived: bool = False, sort: str = Query("updated", pattern="^(updated|opened|priority|reference)$"),
               db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(Case)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Case.reference.ilike(like), Case.title.ilike(like), Case.description.ilike(like)))
    if status:
        stmt = stmt.where(Case.status == status)
    elif not include_archived:
        stmt = stmt.where(Case.status != CaseStatus.archived)
    if priority:
        stmt = stmt.where(Case.priority == priority)
    if assigned_to_id:
        stmt = stmt.where(Case.assigned_to_id == assigned_to_id)
    order = {"updated": Case.updated_at.desc(), "opened": Case.opened_at.desc(), "reference": Case.reference.asc(),
             "priority": Case.updated_at.desc()}[sort]
    cases = list(db.scalars(stmt.order_by(order)).unique())
    if sort == "priority":
        cases.sort(key=lambda c: _PRIO_ORDER[c.priority])
    return [_case_out(db, c) for c in cases]


@router.post("/cases", response_model=CaseOut, status_code=201)
def create_case(body: CaseIn, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_investigator)):
    if body.assigned_to_id and not db.get(User, body.assigned_to_id):
        raise HTTPException(422, "החוקר שנבחר אינו קיים")
    c = Case(**body.model_dump(), created_by_id=user.id)
    if c.assigned_to_id is None:
        c.assigned_to_id = user.id
    db.add(c)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "מספר תיק זה כבר קיים במערכת") from None
    audit.record(db, "case.create", f"נפתח תיק {c.reference}", user=user, entity_type="case", entity_id=c.id,
                 ip=client_ip(request))
    db.commit()
    return _case_out(db, c)


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return _case_out(db, get_or_404(db, Case, case_id, "התיק"))


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: int, body: CaseUpdate, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_investigator)):
    c = get_or_404(db, Case, case_id, "התיק")
    assert_can_edit(c, user)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("status") == CaseStatus.archived:
        raise HTTPException(422, "להעברה לארכיון יש להשתמש בפעולת 'העבר לארכיון'")
    before = {k: str(getattr(c, k)) for k in changes}
    for k, v in changes.items():
        setattr(c, k, v)
    if changes.get("status") == CaseStatus.closed and not c.closed_at:
        c.closed_at = utcnow()
    audit.record(db, "case.update", f"עודכן תיק {c.reference}", user=user, entity_type="case", entity_id=c.id,
                 details={"before": before, "after": {k: str(v) for k, v in changes.items()}}, ip=client_ip(request))
    db.commit()
    return _case_out(db, c)


@router.post("/cases/{case_id}/archive", response_model=CaseOut)
def archive_case(case_id: int, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(require_investigator)):
    c = get_or_404(db, Case, case_id, "התיק")
    assert_can_edit(c, user)
    active = db.scalar(select(func.count(Job.id)).where(Job.case_id == c.id, Job.status.in_(
        [JobStatus.queued, JobStatus.running, JobStatus.cancel_requested])))
    if active:
        raise HTTPException(409, "לא ניתן להעביר לארכיון תיק עם משימות פעילות")
    c.status = CaseStatus.archived
    audit.record(db, "case.archive", f"תיק {c.reference} הועבר לארכיון", user=user, entity_type="case",
                 entity_id=c.id, ip=client_ip(request))
    db.commit()
    return _case_out(db, c)


@router.post("/cases/{case_id}/restore", response_model=CaseOut)
def restore_case(case_id: int, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(require_investigator)):
    c = get_or_404(db, Case, case_id, "התיק")
    if user.role.name != RoleName.admin and c.assigned_to_id not in (None, user.id):
        raise HTTPException(403, "אין הרשאה לשחזר תיק זה")
    c.status = CaseStatus.open
    audit.record(db, "case.restore", f"תיק {c.reference} שוחזר מהארכיון", user=user, entity_type="case",
                 entity_id=c.id, ip=client_ip(request))
    db.commit()
    return _case_out(db, c)


# ---------------------------------------------------------------- exhibits
def _exhibit_out(db: Session, e: Exhibit) -> ExhibitOut:
    out = ExhibitOut.model_validate(e)
    out.media_count = db.scalar(select(func.count(MediaFile.id)).where(MediaFile.exhibit_id == e.id)) or 0
    out.sources = [SourceOut.model_validate(s) for s in
                   db.scalars(select(EvidenceSource).where(EvidenceSource.exhibit_id == e.id).order_by(EvidenceSource.id))]
    return out


@router.get("/cases/{case_id}/exhibits", response_model=list[ExhibitOut])
def list_exhibits(case_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    get_or_404(db, Case, case_id, "התיק")
    return [_exhibit_out(db, e) for e in db.scalars(select(Exhibit).where(Exhibit.case_id == case_id)
                                                      .order_by(Exhibit.identifier))]


@router.get("/exhibits", response_model=list[ExhibitOut])
def all_exhibits(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = db.scalars(select(Exhibit).join(Case).where(Case.status != CaseStatus.archived)
                      .order_by(Case.reference, Exhibit.identifier))
    return [_exhibit_out(db, e) for e in rows]


@router.post("/cases/{case_id}/exhibits", response_model=ExhibitOut, status_code=201)
def create_exhibit(case_id: int, body: ExhibitIn, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(require_investigator)):
    c = get_or_404(db, Case, case_id, "התיק")
    assert_can_edit(c, user)
    e = Exhibit(case_id=case_id, acquired_by_id=user.id, **body.model_dump())
    db.add(e)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "מזהה מוצג זה כבר קיים בתיק") from None
    db.add(CustodyEvent(exhibit_id=e.id, event_type=CustodyType.received, description="המוצג נרשם במערכת",
                        to_party=user.full_name, recorded_by_id=user.id, occurred_at=body.acquired_at or utcnow(),
                        location=body.location))
    audit.record(db, "exhibit.create", f"נוסף מוצג {e.identifier} לתיק {c.reference}", user=user,
                 entity_type="exhibit", entity_id=e.id, ip=client_ip(request))
    db.commit()
    return _exhibit_out(db, e)


@router.get("/exhibits/{exhibit_id}", response_model=ExhibitOut)
def get_exhibit(exhibit_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return _exhibit_out(db, get_or_404(db, Exhibit, exhibit_id, "המוצג"))


@router.patch("/exhibits/{exhibit_id}", response_model=ExhibitOut)
def update_exhibit(exhibit_id: int, body: ExhibitUpdate, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(require_investigator)):
    e = get_or_404(db, Exhibit, exhibit_id, "המוצג")
    assert_can_edit(e.case, user)
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(e, k, v)
    audit.record(db, "exhibit.update", f"עודכן מוצג {e.identifier}", user=user, entity_type="exhibit",
                 entity_id=e.id, details={k: str(v) for k, v in changes.items()}, ip=client_ip(request))
    db.commit()
    return _exhibit_out(db, e)


@router.get("/exhibits/{exhibit_id}/custody", response_model=list[CustodyOut])
def list_custody(exhibit_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    get_or_404(db, Exhibit, exhibit_id, "המוצג")
    return list(db.scalars(select(CustodyEvent).where(CustodyEvent.exhibit_id == exhibit_id)
                           .order_by(CustodyEvent.occurred_at, CustodyEvent.id)))


@router.post("/exhibits/{exhibit_id}/custody", response_model=CustodyOut, status_code=201)
def add_custody(exhibit_id: int, body: CustodyIn, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_investigator)):
    e = get_or_404(db, Exhibit, exhibit_id, "המוצג")
    assert_can_edit(e.case, user)
    ev = CustodyEvent(exhibit_id=e.id, recorded_by_id=user.id, **body.model_dump(exclude={"occurred_at"}),
                      occurred_at=body.occurred_at or utcnow())
    db.add(ev)
    db.flush()
    audit.record(db, "custody.add", f"אירוע משמורת למוצג {e.identifier}: {body.description[:80]}", user=user,
                 entity_type="exhibit", entity_id=e.id, ip=client_ip(request))
    db.commit()
    return ev


@router.post("/exhibits/{exhibit_id}/sources", response_model=SourceOut, status_code=201)
def add_source(exhibit_id: int, body: SourceIn, request: Request, db: Session = Depends(get_db),
               user: User = Depends(require_investigator)):
    e = get_or_404(db, Exhibit, exhibit_id, "המוצג")
    assert_can_edit(e.case, user)
    try:
        p = ensure_source_path(db, body.path)
    except PathNotAuthorized as ex:
        raise HTTPException(403, str(ex)) from None
    if not p.is_dir():
        raise HTTPException(422, "התיקייה אינה קיימת או אינה נגישה")
    s = EvidenceSource(exhibit_id=e.id, kind=body.kind, path=str(p), label=body.label or p.name,
                       authorized_by_id=user.id, authorization_note=body.authorization_note)
    db.add(s)
    db.flush()
    audit.record(db, "source.authorize", f"אושר מקור קריאה בלבד למוצג {e.identifier}", user=user,
                 entity_type="source", entity_id=s.id, details={"path": str(p), "note": body.authorization_note},
                 ip=client_ip(request))
    db.commit()
    return s
