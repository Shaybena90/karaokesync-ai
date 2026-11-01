"""שליטה מרחוק בטוחה: ניהול סוכנים, הגשת משימות מרשימה מותרת ופרוטוקול הסוכן.

גישה מרחוק ברשת כבויה כברירת מחדל ואינה זמינה ב-MVP. מצב "סימולציה מקומית" מאפשר
לסוכן מקומי (127.0.0.1 בלבד) לבצע משימות מותרות לאחר אישור מנהל.
"""
from __future__ import annotations

import hmac
import secrets
import threading
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..db import SessionLocal, get_db, utcnow
from ..models import Agent, AgentKind, AgentNonce, Case, EvidenceSource, Exhibit, Job, JobStatus, SystemSetting, User
from ..schemas import AgentIn, AgentOut, RemoteJobIn
from ..security import client_ip, is_within, normalize, require_admin, require_investigator, require_viewer
from ..worker import queue
from ..worker.runner import run_job
from ..worker.workflows import AGENT_ALLOWED, WORKFLOWS
from .common import get_or_404
from .jobs import job_out

router = APIRouter(prefix="/api/remote", tags=["remote"])
agent_router = APIRouter(prefix="/api/agent", tags=["agent-protocol"])

MODES = {"disabled": "מושבת", "local_simulation": "סימולציה מקומית (127.0.0.1 בלבד)"}
DEMO_AGENT_NAME = "סוכן הדגמה מקומי"


def remote_mode(db: Session) -> str:
    s = db.get(SystemSetting, "remote_mode")
    return s.value if s and s.value in MODES else "disabled"


def demo_secret_path() -> Path:
    return get_settings().data_dir / "demo_agent.secret"


def agent_out(a: Agent) -> AgentOut:
    out = AgentOut.model_validate(a)
    out.online = bool(a.last_seen_at and a.last_seen_at > utcnow() - timedelta(seconds=30))
    return out


# ---------------------------------------------------------------- management
@router.get("/status")
def status(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    agents = list(db.scalars(select(Agent).order_by(Agent.kind, Agent.name)))
    pending = db.scalars(select(Job).where(Job.executor == "agent").order_by(Job.created_at.desc()).limit(50))
    return {
        "mode": remote_mode(db), "mode_label": MODES[remote_mode(db)], "modes": MODES,
        "network_available": False,
        "network_note": "גישה מרחוק ברשת אינה זמינה ב-MVP. פריסה ארגונית מחייבת TLS הדדי, אישור אבטחת מידע "
                        "וחיבור לספק זהויות ארגוני.",
        "allowlist": [{"key": k, "name": WORKFLOWS[k].name} for k in sorted(AGENT_ALLOWED)],
        "agents": [agent_out(a) for a in agents],
        "jobs": [job_out(db, j) for j in pending],
        "demo_agent_ready": demo_secret_path().exists(),
    }


@router.post("/mode")
def set_mode(payload: dict, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    mode = payload.get("mode")
    if mode not in MODES:
        raise HTTPException(422, "מצב לא חוקי")
    if not payload.get("confirm"):
        raise HTTPException(422, "יש לאשר את שינוי המצב")
    s = db.get(SystemSetting, "remote_mode") or SystemSetting(key="remote_mode", value="disabled")
    old = s.value
    s.value, s.updated_by_id = mode, user.id
    db.merge(s)
    audit.record(db, "remote.mode", f"מצב שליטה מרחוק שונה: {old} → {mode}", user=user, entity_type="setting",
                 details={"from": old, "to": mode}, ip=client_ip(request))
    db.commit()
    return {"mode": mode}


@router.post("/agents")
def register_agent(body: AgentIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    bad = [w for w in body.allowed_job_types if w not in AGENT_ALLOWED]
    if bad:
        raise HTTPException(422, f"סוגי משימות שאינם ברשימה המותרת: {bad}")
    secret = secrets.token_urlsafe(32)
    from ..agent.protocol import derive_key  # noqa: PLC0415
    a = Agent(name=body.name, kind=AgentKind.remote_agent, agent_key=f"agt_{secrets.token_hex(8)}",
              secret_hash=derive_key(secret), allowed_job_types=body.allowed_job_types,
              allowed_roots=[str(normalize(r)) for r in body.allowed_roots], registered_by_id=user.id)
    db.add(a)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "סוכן בשם זה כבר קיים") from None
    audit.record(db, "agent.register", f"נרשם סוכן {a.name}", user=user, entity_type="agent", entity_id=a.id,
                 details={"allowed": body.allowed_job_types}, ip=client_ip(request))
    db.commit()
    return {"agent": agent_out(a), "secret": secret,
            "notice": "הסוד מוצג פעם אחת בלבד. יש לשמור אותו בקובץ מוגן במחשב הסוכן."}


@router.patch("/agents/{agent_id}")
def toggle_agent(agent_id: int, payload: dict, request: Request, db: Session = Depends(get_db),
                 user: User = Depends(require_admin)):
    a = get_or_404(db, Agent, agent_id, "הסוכן")
    if a.kind != AgentKind.remote_agent:
        raise HTTPException(409, "לא ניתן לשנות את מנוע המשימות המקומי")
    a.enabled = bool(payload.get("enabled"))
    audit.record(db, "agent.toggle", f"סוכן {a.name} {'הופעל' if a.enabled else 'הושבת'}", user=user,
                 entity_type="agent", entity_id=a.id, ip=client_ip(request))
    db.commit()
    return agent_out(a)


@router.post("/jobs")
def submit_remote_job(body: RemoteJobIn, request: Request, db: Session = Depends(get_db),
                      user: User = Depends(require_investigator)):
    if remote_mode(db) == "disabled":
        raise HTTPException(403, "שליטה מרחוק מושבתת. מנהל מערכת יכול להפעיל סימולציה מקומית")
    agent = get_or_404(db, Agent, body.agent_id, "הסוכן")
    if agent.kind != AgentKind.remote_agent or not agent.enabled:
        raise HTTPException(409, "הסוכן אינו פעיל")
    if body.workflow not in AGENT_ALLOWED or body.workflow not in agent.allowed_job_types:
        raise HTTPException(403, "סוג המשימה אינו מותר לסוכן זה")
    wf = WORKFLOWS[body.workflow]
    params: dict = {"justification": body.justification}
    exhibit_id = body.exhibit_id
    if body.source_id:
        src = get_or_404(db, EvidenceSource, body.source_id, "המקור")
        ex = db.get(Exhibit, src.exhibit_id)
        if ex.case_id != body.case_id:
            raise HTTPException(422, "המקור אינו שייך לתיק")
        if agent.allowed_roots and not any(is_within(normalize(src.path), normalize(r)) for r in agent.allowed_roots):
            raise HTTPException(403, "המקור מחוץ לנתיבים המותרים לסוכן")
        params["source_id"], exhibit_id = src.id, ex.id
    if wf.scope == "source" and "source_id" not in params:
        raise HTTPException(422, "יש לבחור מקור")
    if wf.scope == "exhibit" and not exhibit_id:
        raise HTTPException(422, "יש לבחור מוצג")
    case = get_or_404(db, Case, body.case_id, "התיק")
    job = queue.enqueue(db, body.workflow, user=user, title=f"[מרחוק] {wf.name} – תיק {case.reference}",
                        case_id=case.id, exhibit_id=exhibit_id, params=params, requires_approval=True,
                        executor="agent", agent_id=agent.id, ip=client_ip(request))
    db.commit()
    return job_out(db, job)


@router.post("/demo/run-cycle")
def demo_cycle(request: Request, db: Session = Depends(get_db), user: User = Depends(require_investigator)):
    """מפעיל מחזור אחד של סוכן ההדגמה המקומי מול ה-API (חתימה, replay protection ורשימה מותרת)."""
    if remote_mode(db) != "local_simulation":
        raise HTTPException(403, "יש להפעיל מצב סימולציה מקומית תחילה")
    agent = db.scalar(select(Agent).where(Agent.name == DEMO_AGENT_NAME))
    if not agent or not demo_secret_path().exists():
        raise HTTPException(409, "סוכן ההדגמה אינו מוגדר – הריצו את סקריפט האתחול")
    secret = demo_secret_path().read_text(encoding="utf-8").strip()
    base = f"http://127.0.0.1:{request.url.port or 8000}"
    audit.record(db, "remote.demo_cycle", "הופעל מחזור סוכן הדגמה", user=user, ip=client_ip(request), commit=True)

    def _run():
        from ..agent.client import AgentClient  # noqa: PLC0415
        try:
            AgentClient(base, agent.agent_key, secret).run_cycle(wait_seconds=600)
        except Exception as e:  # noqa: BLE001
            with SessionLocal() as s:
                audit.record(s, "remote.demo_error", f"שגיאת סוכן הדגמה: {e}"[:400], actor="agent-demo", commit=True)

    threading.Thread(target=_run, daemon=True).start()
    return {"started": True, "agent": agent.name}


# ---------------------------------------------------------------- agent protocol
async def authenticated_agent(request: Request, db: Session = Depends(get_db),
                              x_agent_key: str = Header(...), x_agent_timestamp: str = Header(...),
                              x_agent_nonce: str = Header(..., min_length=16, max_length=64),
                              x_agent_signature: str = Header(...)) -> Agent:
    from ..agent.protocol import WINDOW_SECONDS, sign  # noqa: PLC0415
    import time  # noqa: PLC0415

    if remote_mode(db) == "disabled":
        raise HTTPException(403, "שליטה מרחוק מושבתת")
    ip = client_ip(request)
    if ip not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "במצב סימולציה מקומית מותרות רק בקשות מהמחשב המקומי")
    agent = db.scalar(select(Agent).where(Agent.agent_key == x_agent_key))
    if not agent or not agent.enabled or agent.kind != AgentKind.remote_agent:
        raise HTTPException(401, "סוכן לא מזוהה או מושבת")
    try:
        ts = int(x_agent_timestamp)
    except ValueError:
        raise HTTPException(401, "חותמת זמן לא תקינה") from None
    if abs(time.time() - ts) > WINDOW_SECONDS:
        raise HTTPException(401, "חותמת הזמן מחוץ לחלון המותר")
    body = await request.body()
    expected = sign(agent.secret_hash, request.method, request.url.path, x_agent_timestamp, x_agent_nonce, body)
    if not hmac.compare_digest(expected, x_agent_signature):
        audit.record(db, "agent.bad_signature", f"חתימה שגויה מסוכן {agent.name}", actor=agent.agent_key, ip=ip,
                     commit=True)
        raise HTTPException(401, "חתימה לא תקינה")
    db.execute(delete(AgentNonce).where(AgentNonce.created_at < utcnow() - timedelta(minutes=10)))
    db.add(AgentNonce(agent_id=agent.id, nonce=x_agent_nonce))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        audit.record(db, "agent.replay", f"ניסיון שימוש חוזר בבקשה מסוכן {agent.name}", actor=agent.agent_key,
                     ip=ip, commit=True)
        raise HTTPException(401, "בקשה כפולה (replay) נחסמה") from None
    agent.last_seen_at, agent.last_ip = utcnow(), ip
    db.commit()
    return agent


@agent_router.post("/heartbeat")
def heartbeat(payload: dict, db: Session = Depends(get_db), agent: Agent = Depends(authenticated_agent)):
    agent.host = str(payload.get("host", ""))[:128]
    agent.version = str(payload.get("version", ""))[:32]
    db.commit()
    return {"ok": True, "allowed": agent.allowed_job_types}


@agent_router.post("/poll")
def poll(db: Session = Depends(get_db), agent: Agent = Depends(authenticated_agent)):
    allowed = set(agent.allowed_job_types) & AGENT_ALLOWED
    job = queue.claim_next(db, f"agent:{agent.agent_key}", executor="agent", agent_id=agent.id,
                           allowed_workflows=allowed)
    if not job:
        return {"job": None}
    audit.record(db, "agent.claim", f"הסוכן {agent.name} קיבל משימה #{job.id}", actor=agent.agent_key,
                 entity_type="job", entity_id=job.id, commit=True)
    return {"job": {"id": job.id, "workflow": job.workflow, "title": job.title,
                    "steps": [s.key for s in job.steps]}}


def _agent_job(db: Session, job_id: int, agent: Agent) -> Job:
    job = get_or_404(db, Job, job_id, "המשימה")
    if job.worker_id != f"agent:{agent.agent_key}" or job.workflow not in AGENT_ALLOWED:
        raise HTTPException(403, "המשימה אינה משויכת לסוכן זה")
    return job


@agent_router.post("/jobs/{job_id}/execute")
def execute(job_id: int, db: Session = Depends(get_db), agent: Agent = Depends(authenticated_agent)):
    job = _agent_job(db, job_id, agent)
    if job.status != JobStatus.running:
        raise HTTPException(409, "המשימה אינה במצב ריצה")
    worker_id = job.worker_id

    def _run():
        with SessionLocal() as s:
            j = s.get(Job, job_id)
            run_job(s, j, worker_id)

    threading.Thread(target=_run, daemon=True).start()
    return {"started": True}


@agent_router.post("/jobs/{job_id}/status")
def job_status(job_id: int, db: Session = Depends(get_db), agent: Agent = Depends(authenticated_agent)):
    job = _agent_job(db, job_id, agent)
    db.refresh(job)
    return {"status": job.status.value, "progress": job.progress, "step": job.current_step, "error": job.error}
