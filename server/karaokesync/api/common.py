"""Helpers shared by the API routers."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status

from ..supabase_client import AuthUser, SupabaseClient


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def owned_project(sb: SupabaseClient, project_id: str, user: AuthUser) -> dict:
    """Load a project and make sure it belongs to the caller. 404 otherwise
    (we never reveal whether someone else's project exists)."""
    try:
        uuid.UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project_not_found") from exc
    rows = sb.select("projects", {"id": f"eq.{project_id}", "user_id": f"eq.{user.id}", "select": "*"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project_not_found")
    return rows[0]
