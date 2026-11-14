"""GET /lyrics-search: find a song's lyrics online (see lyrics_search.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..config import Settings
from ..lyrics_search import LyricsSearchError, search_lyrics
from ..supabase_client import AuthUser
from .deps import rate_limited_user, settings_dep


def lyrics_search_router() -> APIRouter:
    router = APIRouter()

    @router.get("/lyrics-search")
    def lyrics_search(
        q: str = Query(..., min_length=1, max_length=200),
        duration_ms: int | None = Query(None, ge=0, le=4 * 3600 * 1000),
        user: AuthUser = Depends(rate_limited_user),
        settings: Settings = Depends(settings_dep),
    ) -> dict:
        """Signed-in users only (and rate limited), so the service is not used through us by others."""
        try:
            results = search_lyrics(q, settings.lyrics_search_url, duration_ms)
        except LyricsSearchError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="lyrics_search_unavailable") from exc
        return {"results": results}

    return router
