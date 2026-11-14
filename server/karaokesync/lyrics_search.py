"""Find a song's lyrics online, so users do not have to look for them.

Uses LRCLIB (https://lrclib.net): a free, open database of song lyrics with a
public API and no key. Only the search words (the song's name, as the user
typed or uploaded it) are sent — nothing about the user. Results are ranked by
how close their length is to the uploaded song, which tells versions apart.
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import asdict, dataclass

import httpx

USER_AGENT = "KaraokeSync-AI/1.0"
MAX_RESULTS = 8
MAX_CHARS = 20000
CACHE_SECONDS = 600

_LRC_TAG = re.compile(r"^\s*(\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*)+")
_NOISE = re.compile(
    r"[\(\[](?:[^\)\]]*(?:official|lyrics?|video|audio|clip|hd|4k|remaster(?:ed)?|live|קליפ|רשמי|מילים)[^\)\]]*)[\)\]]",
    re.IGNORECASE,
)
_SPACES = re.compile(r"\s+")


class LyricsSearchError(Exception):
    """The lyrics service could not be reached or answered badly."""


@dataclass
class LyricsResult:
    id: int
    title: str
    artist: str
    album: str
    duration_ms: int | None
    synced: bool
    lyrics: str
    matches_length: bool = False


def clean_query(text: str) -> str:
    """A file name or title made into search words: no extension, no
    "(Official Video)"-style notes, no underscores."""
    text = re.sub(r"\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4)$", "", text.strip(), flags=re.IGNORECASE)
    text = _NOISE.sub(" ", text.replace("_", " "))
    text = re.sub(r"\b(official|lyrics?|video|hd|4k)\b", " ", text, flags=re.IGNORECASE)
    return _SPACES.sub(" ", text).strip(" -–|")[:200]


def plain_lyrics(item: dict) -> str:
    """The words only: plain lyrics, or the synced ones without their time tags."""
    text = (item.get("plainLyrics") or "").strip()
    if not text and item.get("syncedLyrics"):
        text = "\n".join(_LRC_TAG.sub("", line) for line in item["syncedLyrics"].splitlines()).strip()
    return text.replace("\r", "")[:MAX_CHARS]


_cache: dict[tuple, tuple[float, list[dict]]] = {}
_cache_lock = threading.Lock()


def _fetch(base_url: str, params: dict, timeout: float) -> list[dict]:
    key = (base_url, tuple(sorted(params.items())))
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_SECONDS:
            return hit[1]
    try:
        r = httpx.get(f"{base_url.rstrip('/')}/api/search", params=params, timeout=timeout,
                      headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise LyricsSearchError(type(exc).__name__) from exc
    items = [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []
    with _cache_lock:
        if len(_cache) > 500:
            _cache.clear()
        _cache[key] = (now, items)
    return items


def search_lyrics(query: str, base_url: str, duration_ms: int | None = None, timeout: float = 8.0) -> list[dict]:
    """Up to MAX_RESULTS songs with lyrics, best first."""
    q = clean_query(query)
    if not q:
        return []
    requests = [{"q": q}]
    if " - " in q:  # "Artist - Song" (or the other way round): ask both ways too
        a, b = (part.strip() for part in q.split(" - ", 1))
        requests += [{"track_name": b, "artist_name": a}, {"track_name": a, "artist_name": b}]
    found: dict[int, dict] = {}
    errors = 0
    for params in requests:
        try:
            items = _fetch(base_url, params, timeout)
        except LyricsSearchError:
            errors += 1
            continue
        for item in items:
            if isinstance(item.get("id"), int) and item["id"] not in found:
                found[item["id"]] = item
    if errors == len(requests):
        raise LyricsSearchError("unreachable")

    results: list[LyricsResult] = []
    for item in found.values():
        if item.get("instrumental"):
            continue
        text = plain_lyrics(item)
        if not text:
            continue
        seconds = item.get("duration")
        dur = int(round(float(seconds) * 1000)) if isinstance(seconds, (int, float)) and seconds > 0 else None
        results.append(LyricsResult(
            id=item["id"],
            title=str(item.get("trackName") or "")[:200],
            artist=str(item.get("artistName") or "")[:200],
            album=str(item.get("albumName") or "")[:200],
            duration_ms=dur,
            synced=bool(item.get("syncedLyrics")),
            lyrics=text,
            matches_length=bool(duration_ms and dur and abs(dur - duration_ms) <= 4000),
        ))

    def rank(r: LyricsResult) -> tuple:
        off = abs(r.duration_ms - duration_ms) if duration_ms and r.duration_ms else 10**9
        return (not r.matches_length, off, not r.synced)

    return [asdict(r) for r in sorted(results, key=rank)[:MAX_RESULTS]]
