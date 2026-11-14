"""Lyrics from YouTube: the descriptions of official videos, which often carry
the song's checked lyrics.

Uses the official YouTube Data API v3 (YOUTUBE_API_KEY on the API server; free
daily quota, about 100 searches a day). YouTube's pages cannot be read like
ordinary web pages, and automated reading of them is against YouTube's terms,
so without a key this source simply reports that it needs one. Captions of
other people's videos are not available through the API, so only video
descriptions are used. The key never leaves the server and is never logged.
"""

from __future__ import annotations

import re

import httpx

API = "https://www.googleapis.com/youtube/v3"
SEARCH_URL = "https://www.youtube.com/results?search_query={q}"
HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
MAX_VIDEOS = 8
MIN_LINES = 6

_OFFICIAL = re.compile(r"official|lyric|רשמי|מילים|קליפ", re.IGNORECASE)
_JUNK = re.compile(
    r"https?://|www\.|@|#|subscribe|follow|instagram|facebook|tiktok|spotify|apple music|youtube|"
    r"הירשמו|עקבו|להאזנה|להורדה|ערוץ|הפקה|ניהול|צילום|בימוי|עריכה|מיקס|מאסטר|הופעות|booking|"
    r"provided to|auto-generated|℗|©|\d{1,2}:\d{2}",
    re.IGNORECASE,
)
_CREDIT = re.compile(r"^(מילים|לחן|ביצוע|עיבוד|music|lyrics|composer|producer|written)\s*(ו[^\s:]+\s*)?[:：-]", re.IGNORECASE)
_LETTER = re.compile(r"[א-תa-zA-Z]")


class YouTubeError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def is_youtube(url: str) -> bool:
    host = re.sub(r"^https?://", "", url.strip(), flags=re.IGNORECASE).split("/")[0].split(":")[0].lower()
    return host in HOSTS


def lyrics_from_description(text: str) -> str:
    """The longest run of lyric-like lines in a video description ("" if none)."""
    best: list[str] = []
    run: list[str] = []
    blanks = 0
    for raw in (text or "").replace("\r", "").split("\n") + ["~end~"]:
        line = " ".join(raw.split())
        ok = 0 < len(line) <= 90 and bool(_LETTER.search(line)) and not _JUNK.search(line) and not _CREDIT.match(line)
        if ok:
            run.append(line)
            blanks = 0
        elif not line and blanks == 0 and run:
            blanks = 1  # one empty line between verses keeps the block going
        else:
            if len(run) > len(best):
                best = run
            run, blanks = [], 0
    return "\n".join(best) if len(best) >= MIN_LINES else ""


def _get(path: str, params: dict, key: str, timeout: float) -> dict:
    try:
        r = httpx.get(f"{API}/{path}", params={**params, "key": key}, timeout=timeout)
    except httpx.HTTPError as exc:
        raise YouTubeError("unreachable") from exc
    if r.status_code == 403:
        reason = ""
        try:
            reason = r.json()["error"]["errors"][0]["reason"]
        except (ValueError, KeyError, IndexError, TypeError):
            pass
        raise YouTubeError("quota" if "quota" in reason.lower() or "limit" in reason.lower() else "bad_key")
    if r.status_code == 400:
        raise YouTubeError("bad_key")
    if r.status_code >= 400:
        raise YouTubeError("unreachable")
    try:
        return r.json()
    except ValueError as exc:
        raise YouTubeError("unreachable") from exc


def search_youtube(query: str, key: str, timeout: float = 8.0) -> list[dict]:
    """Songs whose official video description has the lyrics, the most official-looking first."""
    if not key:
        raise YouTubeError("needs_key")
    found = _get("search", {"part": "snippet", "type": "video", "videoCategoryId": "10",
                            "maxResults": MAX_VIDEOS, "q": query}, key, timeout)
    ids = [item.get("id", {}).get("videoId") for item in found.get("items", [])]
    ids = [i for i in ids if isinstance(i, str) and re.fullmatch(r"[\w-]{6,20}", i)]
    if not ids:
        return []
    videos = _get("videos", {"part": "snippet", "id": ",".join(ids)}, key, timeout)
    words = {w for w in re.split(r"\W+", query.lower()) if len(w) > 1}
    results = []
    for order, item in enumerate(videos.get("items", [])):
        sn = item.get("snippet") or {}
        lyrics = lyrics_from_description(sn.get("description", ""))
        if not lyrics:
            continue
        title, channel = str(sn.get("title", ""))[:200], str(sn.get("channelTitle", ""))[:200]
        official = bool(_OFFICIAL.search(title)) or bool(words & set(re.split(r"\W+", channel.lower())))
        results.append((not official, order, {
            "title": title, "artist": channel, "url": f"https://www.youtube.com/watch?v={item.get('id')}",
            "lyrics": lyrics, "source": "youtube.com",
        }))
    results.sort(key=lambda r: (r[0], r[1]))
    return [r[2] for r in results]
