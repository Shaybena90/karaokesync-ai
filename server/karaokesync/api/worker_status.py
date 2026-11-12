"""Processing server status (for everyone) and remote pause (for the owner).

Workers check in every 15 s (see worker.runner.Presence). One that checked in
within the last minute is online. Only ADMIN_EMAILS see the details and may
pause/resume: paused workers finish their current job and then wait.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import Settings
from ..supabase_client import AuthUser, SupabaseClient, SupabaseError
from .deps import get_supabase, rate_limited_user, settings_dep

ONLINE_SECONDS = 60


class PauseRequest(BaseModel):
    paused: bool


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def worker_status_router() -> APIRouter:
    router = APIRouter()

    @router.get("/worker-status")
    def worker_status(
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        admin = settings.is_admin(user.email)
        try:
            workers = sb.select("workers", {"select": "*", "order": "last_seen.desc"})
            control = sb.select("worker_control", {"id": "eq.1", "select": "paused"})
        except SupabaseError as exc:
            if exc.status_code in (400, 404):  # the SQL file was not run yet
                return {"available": False, "online": None, "paused": False, "admin": admin}
            raise
        now = datetime.now(timezone.utc)
        for w in workers:
            w["online"] = w.get("activity") != "stopped" and now - _parse(w["last_seen"]) < timedelta(seconds=ONLINE_SECONDS)
        body = {
            "available": True,
            "online": any(w["online"] for w in workers),
            "paused": bool(control and control[0]["paused"]),
            "admin": admin,
        }
        if admin:
            body["workers"] = [
                {k: w.get(k) for k in ("id", "online", "device", "activity", "version", "last_seen", "started_at")}
                for w in workers
            ]
        return body

    @router.post("/worker-status")
    def set_paused(
        body: PauseRequest,
        user: AuthUser = Depends(rate_limited_user),
        sb: SupabaseClient = Depends(get_supabase),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        if not settings.is_admin(user.email):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not_admin")
        sb.update("worker_control", {"id": "eq.1"}, {"paused": body.paused, "updated_at": datetime.now(timezone.utc).isoformat()})
        return {"paused": body.paused}

    return router
