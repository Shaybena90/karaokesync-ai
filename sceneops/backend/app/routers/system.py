from __future__ import annotations

import shutil
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..db import get_db, utcnow
from ..models import (
    Agent, AgentKind, AuditEvent, AuthorizedRoot, Camera, CameraStatus, Case, CaseStatus, Finding, FindingKind, Job,
    JobStatus, MediaFile, MediaType, Notification, Priority, Role, RootKind, SystemSetting, User, WorkingCopy,
)
from ..schemas import AuditOut, NotificationOut, RootIn, RootOut, UserCreate, UserUpdate
from ..security import (
    client_ip, get_current_user, hash_password, normalize, require_admin, require_viewer,
)
from ..services import media as M
from .common import get_or_404, user_out
from .jobs import job_out

router = APIRouter(prefix="/api", tags=["system"])

ACTIVE = [JobStatus.queued, JobStatus.running, JobStatus.cancel_requested]
OPEN_CASE = [CaseStatus.open, CaseStatus.in_progress, CaseStatus.pending_review]


def health_info(db: Session) -> dict:
    now = utcnow()
    worker = db.scalar(select(Agent).where(Agent.kind == AgentKind.local_worker).order_by(Agent.last_seen_at.desc()))
    running_lease = db.scalar(select(func.count(Job.id)).where(Job.status.in_([JobStatus.running]),
                                                               Job.lease_until > now)) or 0
    worker_ok = bool((worker and worker.last_seen_at and worker.last_seen_at > now - timedelta(seconds=20))
                     or running_lease)
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    st = get_settings().storage_root
    st.mkdir(parents=True, exist_ok=True)
    du = shutil.disk_usage(st)
    remote_agents = list(db.scalars(select(Agent).where(Agent.kind == AgentKind.remote_agent, Agent.enabled.is_(True))))
    agents_online = sum(1 for a in remote_agents if a.last_seen_at and a.last_seen_at > now - timedelta(seconds=60))
    mode = db.get(SystemSetting, "remote_mode")
    return {
        "worker_ok": worker_ok, "worker_last_seen": (worker.last_seen_at.isoformat() + "Z")
        if worker and worker.last_seen_at else None,
        "db_ok": db_ok, "db_kind": "SQLite" if get_settings().sqlalchemy_url.startswith("sqlite") else "PostgreSQL",
        "storage_free": du.free, "storage_total": du.total, "storage_free_pct": round(100 * du.free / du.total, 1),
        "ffmpeg": M.ffmpeg_available(), "remote_mode": mode.value if mode else "disabled",
        "agents_total": len(remote_agents), "agents_online": agents_online,
        "demo_mode": get_settings().demo_mode,
    }


@router.get("/health")
def health(db: Session = Depends(get_db)):
    h = health_info(db)
    return {"ok": h["db_ok"], "db": h["db_ok"]}


@router.get("/system/health")
def system_health(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    h = health_info(db)
    h["tools"] = M.tool_versions()
    return h


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require_viewer)):
    now = utcnow()
    open_cases = db.scalar(select(func.count(Case.id)).where(Case.status.in_(OPEN_CASE))) or 0
    failed_case_ids = {cid for (cid,) in db.execute(select(Job.case_id).where(Job.status == JobStatus.failed))}
    attention = db.scalar(select(func.count(Case.id)).where(Case.status.in_(OPEN_CASE), or_(
        Case.priority.in_([Priority.high, Priority.critical]), Case.id.in_(failed_case_ids or {-1})))) or 0
    cams = db.scalar(select(func.count(Camera.id))) or 0
    cams_online = db.scalar(select(func.count(Camera.id)).where(Camera.status == CameraStatus.online)) or 0
    running = list(db.scalars(select(Job).where(Job.status.in_(ACTIVE))))
    awaiting = db.scalar(select(func.count(Job.id)).where(Job.status == JobStatus.awaiting_approval)) or 0
    avg = round(sum(j.progress for j in running) / len(running), 1) if running else 0
    done24 = db.scalar(select(func.count(Job.id)).where(Job.status == JobStatus.succeeded,
                                                        Job.finished_at > now - timedelta(hours=24))) or 0
    failed24 = db.scalar(select(func.count(Job.id)).where(Job.status == JobStatus.failed,
                                                          Job.finished_at > now - timedelta(hours=24))) or 0
    table_jobs = list(db.scalars(select(Job).where(
        or_(Job.status.in_(ACTIVE + [JobStatus.awaiting_approval]), Job.finished_at > now - timedelta(hours=24)))
        .order_by(Job.status.in_(ACTIVE).desc(), Job.updated_at.desc()).limit(6)))
    activity = list(db.scalars(select(AuditEvent).where(~AuditEvent.action.like("auth.%"),
                                                        ~AuditEvent.action.like("report.download"))
                               .order_by(AuditEvent.id.desc()).limit(6)))
    notes = list(db.scalars(select(Notification).where(Notification.user_id == user.id)
                            .order_by(Notification.id.desc()).limit(5)))
    unread = db.scalar(select(func.count(Notification.id)).where(Notification.user_id == user.id,
                                                                 Notification.read.is_(False))) or 0
    # תצוגה מקדימה: הסרטון האחרון עם קובץ תצוגה מעותק עבודה מאומת
    pm = db.scalar(select(MediaFile).join(WorkingCopy).where(
        WorkingCopy.verified.is_(True), WorkingCopy.proxy_path != "", MediaFile.media_type == MediaType.video)
        .order_by(MediaFile.updated_at.desc(), MediaFile.id.desc()).limit(1))
    preview = None
    if pm:
        segs = db.scalars(select(Finding).where(Finding.media_file_id == pm.id, Finding.kind == FindingKind.motion)
                          .order_by(Finding.media_offset_start))
        case = db.get(Case, pm.case_id)
        preview = {"media_id": pm.id, "file_name": pm.file_name, "camera": pm.camera_label,
                   "case_reference": case.reference if case else "", "case_id": pm.case_id,
                   "recorded_start": pm.recorded_start.isoformat() if pm.recorded_start else None,
                   "duration": pm.duration_seconds or 0,
                   "motion": [{"start": f.media_offset_start, "end": f.media_offset_end, "score": f.score}
                              for f in segs]}
    return {
        "kpis": {"open_cases": open_cases, "cases_attention": attention, "cameras": cams, "cameras_online": cams_online,
                 "jobs_active": len(running), "jobs_awaiting": awaiting, "jobs_avg_progress": avg,
                 "jobs_done_24h": done24, "jobs_failed_24h": failed24},
        "jobs": [job_out(db, j) for j in table_jobs],
        "activity": [AuditOut.model_validate(a) for a in activity],
        "notifications": [NotificationOut.model_validate(n) for n in notes], "unread": unread,
        "health": health_info(db), "preview": preview,
    }


# ---------------------------------------------------------------- notifications
@router.get("/notifications", response_model=list[NotificationOut])
def notifications(unread_only: bool = False, limit: int = Query(100, le=500), db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.id.desc()).limit(limit)))


@router.get("/notifications/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"unread": db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == user.id, Notification.read.is_(False))) or 0}


@router.post("/notifications/{nid}/read")
def mark_read(nid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = get_or_404(db, Notification, nid, "ההתראה")
    if n.user_id != user.id:
        raise HTTPException(404, "ההתראה לא נמצאה")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))):
        n.read = True
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- settings
EDITABLE = {
    "gap_threshold_seconds": (int, 1, 3600),
    "motion_sensitivity": (float, 0.001, 0.2),
    "organization_name": (str, 2, 120),
    "require_remote_approval": (bool, None, None),
}


@router.get("/settings")
def get_settings_(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    s = get_settings()
    rows = {r.key: {"value": r.value, "description": r.description,
                    "updated_at": r.updated_at.isoformat() + "Z" if r.updated_at else None}
            for r in db.scalars(select(SystemSetting))}
    return {"settings": rows, "editable": list(EDITABLE),
            "environment": {"display_timezone": s.display_timezone, "storage_root": str(normalize(s.storage_root)),
                            "demo_mode": s.demo_mode, "session_hours": s.session_hours,
                            "max_upload_mb": s.max_upload_mb, "database": "SQLite" if
                            s.sqlalchemy_url.startswith("sqlite") else "PostgreSQL"}}


@router.patch("/settings")
def update_settings(payload: dict, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    changed = {}
    for k, v in payload.items():
        if k not in EDITABLE:
            raise HTTPException(422, f"ההגדרה '{k}' אינה ניתנת לעריכה")
        typ, lo, hi = EDITABLE[k]
        try:
            v = typ(v)
        except (TypeError, ValueError):
            raise HTTPException(422, f"ערך לא תקין עבור {k}") from None
        if typ in (int, float) and not (lo <= v <= hi):
            raise HTTPException(422, f"הערך עבור {k} חייב להיות בין {lo} ל-{hi}")
        if typ is str and not (lo <= len(v.strip()) <= hi):
            raise HTTPException(422, f"אורך לא תקין עבור {k}")
        row = db.get(SystemSetting, k) or SystemSetting(key=k)
        changed[k] = {"from": row.value, "to": v}
        row.value, row.updated_by_id = v, user.id
        db.merge(row)
    audit.record(db, "settings.update", "עודכנו הגדרות מערכת", user=user, entity_type="setting", details=changed,
                 ip=client_ip(request))
    db.commit()
    return {"ok": True}


@router.get("/settings/roots", response_model=list[RootOut])
def list_roots(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return list(db.scalars(select(AuthorizedRoot).order_by(AuthorizedRoot.kind, AuthorizedRoot.path)))


@router.post("/settings/roots", response_model=RootOut, status_code=201)
def add_root(body: RootIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if not body.confirm_authorized:
        raise HTTPException(422, "יש לאשר שקיימת הרשאה מפורשת לגישה לנתיב")
    p = normalize(body.path)
    if not p.is_dir():
        raise HTTPException(422, "הנתיב אינו קיים או אינו תיקייה")
    from ..security import is_within  # noqa: PLC0415
    storage = normalize(get_settings().storage_root)
    if is_within(p, storage) or is_within(storage, p):
        raise HTTPException(422, "נתיב מקור אינו יכול לחפוף לאחסון עותקי העבודה")
    if str(p) == p.anchor and not body.label:
        raise HTTPException(422, "לאישור כונן שלם יש להזין תיאור (למשל: 'כונן נשלף – מוצג 002')")
    r = AuthorizedRoot(path=str(p), kind=RootKind.source, label=body.label, created_by_id=user.id)
    db.add(r)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "הנתיב כבר מורשה") from None
    audit.record(db, "root.add", f"נוסף נתיב מקור מורשה: {p}", user=user, entity_type="root", entity_id=r.id,
                 ip=client_ip(request))
    db.commit()
    return r


@router.patch("/settings/roots/{root_id}", response_model=RootOut)
def toggle_root(root_id: int, payload: dict, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_admin)):
    r = get_or_404(db, AuthorizedRoot, root_id, "הנתיב")
    r.active = bool(payload.get("active"))
    audit.record(db, "root.toggle", f"נתיב {r.path} {'הופעל' if r.active else 'הושבת'}", user=user,
                 entity_type="root", entity_id=r.id, ip=client_ip(request))
    db.commit()
    return r


# ---------------------------------------------------------------- users
@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.full_name))]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    role = db.scalar(select(Role).where(Role.name == body.role))
    u = User(username=body.username, full_name=body.full_name, password_hash=hash_password(body.password),
             role_id=role.id)
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "שם המשתמש כבר קיים") from None
    audit.record(db, "user.create", f"נוצר משתמש {u.username} ({role.label})", user=user, entity_type="user",
                 entity_id=u.id, ip=client_ip(request))
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_admin)):
    u = get_or_404(db, User, user_id, "המשתמש")
    if u.id == user.id and (body.is_active is False or (body.role and body.role.value != "admin")):
        raise HTTPException(409, "לא ניתן להשבית או להוריד הרשאות לחשבון שלך")
    if body.full_name:
        u.full_name = body.full_name
    if body.role:
        u.role_id = db.scalar(select(Role).where(Role.name == body.role)).id
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password:
        u.password_hash = hash_password(body.password)
    audit.record(db, "user.update", f"עודכן משתמש {u.username}", user=user, entity_type="user", entity_id=u.id,
                 details={"role": body.role.value if body.role else None, "is_active": body.is_active,
                          "password_changed": bool(body.password)}, ip=client_ip(request))
    db.commit()
    db.refresh(u)
    return user_out(u)


# ---------------------------------------------------------------- audit
@router.get("/audit", response_model=list[AuditOut])
def audit_log(q: Optional[str] = Query(None, max_length=100), action: Optional[str] = None,
              entity_type: Optional[str] = None, entity_id: Optional[int] = None, limit: int = Query(200, le=1000),
              db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    stmt = select(AuditEvent)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(AuditEvent.summary.ilike(like), AuditEvent.actor.ilike(like)))
    if action:
        stmt = stmt.where(AuditEvent.action.like(f"{action}%"))
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditEvent.entity_id == entity_id)
    return list(db.scalars(stmt.order_by(AuditEvent.id.desc()).limit(limit)))


@router.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    ok, bad = audit.verify_chain(db)
    total = db.scalar(select(func.count(AuditEvent.id)))
    return {"ok": ok, "first_invalid_id": bad, "total": total}
