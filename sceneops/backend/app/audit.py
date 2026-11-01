"""יומן ביקורת בשרשרת גיבוב (hash chain) – כל רשומה מקושרת לקודמתה לזיהוי שינויים."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import utcnow
from .models import AuditEvent, Notification, NotificationLevel, User

_SECRET_KEYS = {"password", "secret", "token", "credential", "credentials", "api_key"}


def _scrub(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: ("***" if k.lower() in _SECRET_KEYS else _scrub(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    return obj


def _digest(ev: AuditEvent) -> str:
    payload = json.dumps({
        "t": ev.created_at.isoformat(), "u": ev.user_id, "a": ev.action, "et": ev.entity_type,
        "eid": ev.entity_id, "s": ev.summary, "d": ev.details, "p": ev.prev_hash,
    }, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def record(db: Session, action: str, summary: str, *, user: User | None = None, actor: str | None = None,
           entity_type: str = "", entity_id: int | None = None, details: dict | None = None,
           ip: str = "", commit: bool = False) -> AuditEvent:
    last = db.scalar(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1))
    ev = AuditEvent(
        created_at=utcnow(), user_id=user.id if user else None,
        actor=actor or (user.username if user else "system"), action=action,
        entity_type=entity_type, entity_id=entity_id, summary=summary[:500],
        details=_scrub(details or {}), ip=ip[:64], prev_hash=last.hash if last else "",
    )
    ev.hash = _digest(ev)
    db.add(ev)
    if commit:
        db.commit()
    else:
        db.flush()
    return ev


def verify_chain(db: Session) -> tuple[bool, int | None]:
    prev = ""
    for ev in db.scalars(select(AuditEvent).order_by(AuditEvent.id)):
        if ev.prev_hash != prev or _digest(ev) != ev.hash:
            return False, ev.id
        prev = ev.hash
    return True, None


def notify_all(db: Session, title: str, body: str = "", *, level: NotificationLevel = NotificationLevel.info,
               link: str = "", job_id: int | None = None) -> None:
    for u in db.scalars(select(User).where(User.is_active.is_(True))):
        db.add(Notification(user_id=u.id, title=title[:255], body=body, level=level, link=link, job_id=job_id))
