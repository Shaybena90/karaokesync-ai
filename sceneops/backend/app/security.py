"""אימות, הרשאות והגנת נתיבים.

הערה: מנגנון ההתחברות כאן מיועד להדגמה מקומית. פריסה ארגונית דורשת חיבור
לספק זהויות ארגוני (SSO / AD), TLS, ניהול סודות ייעודי ובדיקות אבטחה.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db, utcnow
from .models import AuthorizedRoot, RoleName, RootKind, User, UserSession

_PBKDF2_ITER = 240_000


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITER)
    return f"pbkdf2_sha256${_PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, ip: str = "") -> str:
    token = secrets.token_urlsafe(32)
    db.add(UserSession(user_id=user.id, token_hash=token_digest(token), ip=ip[:64],
                       expires_at=utcnow() + timedelta(hours=get_settings().session_hours)))
    user.last_login_at = utcnow()
    db.commit()
    return token


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    # EventSource / תגיות <video> אינן שולחות כותרות – מאפשרים token בפרמטר שאילתה
    return request.query_params.get("token")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "נדרשת התחברות")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == token_digest(token)))
    if not sess or sess.revoked or sess.expires_at < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "פג תוקף ההתחברות, יש להתחבר מחדש")
    user = db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "המשתמש אינו פעיל")
    request.state.session_id = sess.id
    return user


_RANK = {RoleName.viewer: 0, RoleName.investigator: 1, RoleName.admin: 2}


def require_role(minimum: RoleName):
    def dep(user: User = Depends(get_current_user)) -> User:
        if _RANK[user.role.name] < _RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "אין לך הרשאה לבצע פעולה זו")
        return user
    return dep


require_viewer = require_role(RoleName.viewer)
require_investigator = require_role(RoleName.investigator)
require_admin = require_role(RoleName.admin)


# ---------------------------------------------------------------- paths
class PathNotAuthorized(Exception):
    pass


def normalize(p: str | os.PathLike) -> Path:
    """נרמול נתיב מוחלט, כולל פתרון קישורים סימבוליים ו-..."""
    return Path(os.path.realpath(os.path.abspath(os.fspath(p))))


def is_within(child: Path, parent: Path) -> bool:
    child_n, parent_n = os.path.normcase(str(child)), os.path.normcase(str(parent))
    try:
        return os.path.commonpath([child_n, parent_n]) == parent_n
    except ValueError:  # כוננים שונים ב-Windows
        return False


def authorized_roots(db: Session, kind: RootKind = RootKind.source) -> list[Path]:
    rows = db.scalars(select(AuthorizedRoot).where(AuthorizedRoot.kind == kind, AuthorizedRoot.active.is_(True)))
    return [normalize(r.path) for r in rows]


def ensure_source_path(db: Session, raw: str) -> Path:
    if not raw or "\x00" in raw:
        raise PathNotAuthorized("נתיב לא תקין")
    p = normalize(raw)
    if not any(is_within(p, root) for root in authorized_roots(db, RootKind.source)):
        raise PathNotAuthorized("הנתיב אינו נמצא בתוך תיקיית מקור מורשית")
    storage = normalize(get_settings().storage_root)
    if is_within(p, storage) or is_within(storage, p):
        raise PathNotAuthorized("אסור שתיקיית המקור תחפוף לאחסון עותקי העבודה")
    return p


def storage_path(relative: str) -> Path:
    """המרת נתיב יחסי לאחסון לנתיב מוחלט, עם חסימת Path Traversal."""
    root = normalize(get_settings().storage_root)
    p = normalize(root / relative)
    if not is_within(p, root):
        raise PathNotAuthorized("ניסיון גישה מחוץ לאחסון המאושר")
    return p


def storage_relative(p: Path) -> str:
    root = normalize(get_settings().storage_root)
    return normalize(p).relative_to(root).as_posix()


SAFE_NAME_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")


def safe_component(name: str) -> str:
    cleaned = "".join(c if c in SAFE_NAME_CHARS else "_" for c in name).strip("._")
    return cleaned[:120] or "item"
