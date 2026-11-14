"""Lyrics search: the open LRCLIB database (lyrics_search.py) and the user's own websites (lyrics_sources.py)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..config import Settings
from ..lyrics_search import LyricsSearchError, search_lyrics
from ..lyrics_sources import MAX_SOURCES, SourceError, normalize_template, search_sources
from ..supabase_client import AuthUser
from .deps import rate_limited_user, settings_dep


class SourcesSearchRequest(BaseModel):
    q: str = Field(min_length=1, max_length=200)
    sources: list[str] = Field(min_length=1, max_length=MAX_SOURCES)


class SourceRequest(BaseModel):
    url: str = Field(min_length=3, max_length=500)


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

    @router.post("/lyrics-sources/search")
    def search_my_sources(body: SourcesSearchRequest, user: AuthUser = Depends(rate_limited_user)) -> dict:
        """Search the user's own lyrics websites (their list is kept in their account, in the browser)."""
        if any(len(s) > 500 for s in body.sources):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="invalid_source")
        return {"sources": search_sources(body.sources, body.q)}

    @router.post("/lyrics-sources/normalize")
    def normalize_source(body: SourceRequest, user: AuthUser = Depends(rate_limited_user)) -> dict:
        """The search address that will be used for a site the user adds."""
        try:
            return {"template": normalize_template(body.url)}
        except SourceError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.code) from exc

    return router
