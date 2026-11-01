from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import User
from ..schemas import UserOut

T = TypeVar("T")


def get_or_404(db: Session, model: type[T], id_: int, what: str = "הפריט") -> T:
    obj = db.get(model, id_)
    if obj is None:
        raise HTTPException(404, f"{what} לא נמצא")
    return obj


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, username=u.username, full_name=u.full_name, role=u.role.name, role_label=u.role.label,
                   is_active=u.is_active, is_demo=u.is_demo, last_login_at=u.last_login_at)
