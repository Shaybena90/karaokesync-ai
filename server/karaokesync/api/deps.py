"""FastAPI dependencies: Supabase client, authentication, rate limiting."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from functools import lru_cache

from fastapi import Depends, Header, HTTPException, status

from ..config import Settings, get_settings
from ..supabase_client import AuthUser, SupabaseClient


@lru_cache
def _supabase_singleton() -> SupabaseClient:
    return SupabaseClient(get_settings())


def get_supabase() -> SupabaseClient:
    return _supabase_singleton()


def get_current_user(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> AuthUser:
    """Every endpoint except /health and /limits requires a valid Supabase session."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    token = authorization.split(" ", 1)[1].strip()
    user = sb.get_user(token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
    return user


class SlidingWindowLimiter:
    """Per-user, in-memory request limiter (protects the API from bursts).

    Long-term quotas (uploads per day, active jobs) are enforced against the
    database, so they hold even with several API instances.
    """

    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")
            hits.append(now)


_write_limiter = SlidingWindowLimiter(max_requests=30, window_seconds=60)


def rate_limited_user(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    _write_limiter.check(user.id)
    return user


def settings_dep() -> Settings:
    return get_settings()
