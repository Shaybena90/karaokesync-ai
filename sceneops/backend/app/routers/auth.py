from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..db import get_db
from ..models import User, UserSession
from ..schemas import LoginIn
from ..security import client_ip, create_session, get_current_user, verify_password
from .common import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])

_failures: dict[str, list[float]] = {}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    now = time.time()
    recent = [t for t in _failures.get(ip, []) if now - t < 300]
    if len(recent) >= 10:
        raise HTTPException(429, "יותר מדי ניסיונות התחברות כושלים. נסו שוב בעוד מספר דקות")
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        _failures[ip] = [*recent, now]
        audit.record(db, "auth.login_failed", "ניסיון התחברות כושל", actor=body.username[:64], ip=ip, commit=True)
        raise HTTPException(401, "שם משתמש או סיסמה שגויים")
    if user.is_demo and not get_settings().demo_mode:
        raise HTTPException(403, "משתמשי הדגמה מושבתים כאשר מצב הדגמה כבוי")
    _failures.pop(ip, None)
    token = create_session(db, user, ip)
    audit.record(db, "auth.login", f"התחברות: {user.full_name}", user=user, ip=ip, commit=True)
    return {"token": token, "user": user_out(user), "expires_hours": get_settings().session_hours}


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sess = db.get(UserSession, request.state.session_id)
    if sess:
        sess.revoked = True
    audit.record(db, "auth.logout", f"התנתקות: {user.full_name}", user=user, ip=client_ip(request), commit=True)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.get("/demo-users")
def demo_users(db: Session = Depends(get_db)):
    """רשימת משתמשי הדגמה (רק במצב הדגמה). הסיסמאות מתועדות ב-README."""
    if not get_settings().demo_mode:
        return []
    return [{"username": u.username, "full_name": u.full_name, "role_label": u.role.label}
            for u in db.scalars(select(User).where(User.is_demo.is_(True), User.is_active.is_(True)))]
