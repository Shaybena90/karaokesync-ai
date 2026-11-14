"""Search the user's own lyrics websites.

A source is the address of a site's search page with {q} where the song name
goes (e.g. https://example.co.il/?s={q}). For each source the server opens the
search page, follows the result links that look like the song, and takes the
lyrics out of the song page: the longest run of short text lines that are not
links, menus or credits. Sites differ a lot, so this is a best guess; when it
finds nothing the user still gets a link to that site's search.

The addresses come from users, so every request is checked before it is made:
http(s) only, standard ports, public internet addresses only (no local or
private networks), redirects checked one by one, small pages, short timeouts.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from html.parser import HTMLParser
from urllib.parse import quote, unquote, urljoin, urlsplit

import httpx

USER_AGENT = "Mozilla/5.0 (compatible; KaraokeSync-AI/1.0; lyrics lookup for personal karaoke)"
MAX_SOURCES = 8
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
PAGES_PER_SOURCE = 3
MAX_CHARS = 20000


class SourceError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ------------------------------------------------------------------ addresses
def normalize_template(raw: str) -> str:
    """The search address with {q} where the song name goes. Also accepted: an
    address where the user searched the word "test" or "בדיקה" (replaced by
    {q}), or just the site's address (WordPress-style search /?s={q})."""
    url = raw.strip()
    if re.match(r"^[a-z][a-z0-9+.-]*:(?!\d)", url, re.IGNORECASE) and not re.match(r"^https?://", url, re.IGNORECASE):
        raise SourceError("invalid_source")  # ftp:, javascript:, file: ...
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    if "{q}" not in url:
        for word in ("test", "TEST", "Test", "בדיקה", quote("בדיקה"), quote("בדיקה").lower()):
            if word in url:
                url = url.replace(word, "{q}", 1)
                break
    if "{q}" not in url:
        parts = urlsplit(url)
        if parts.path in ("", "/") and not parts.query:
            url = f"{parts.scheme}://{parts.netloc}/?s={{q}}"
    parts = urlsplit(url.replace("{q}", "x"))
    if parts.scheme not in ("http", "https") or not parts.hostname or "{q}" not in url or len(url) > 500:
        raise SourceError("invalid_source")
    return url


def _check_host(url: str) -> None:
    """Refuse anything that is not a public internet address (protects the server's own network)."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise SourceError("invalid_source")
    if parts.port not in (None, 80, 443):
        raise SourceError("blocked_source")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80),
                                   type=socket.SOCK_STREAM)
    except OSError as exc:
        raise SourceError("unreachable") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise SourceError("blocked_source")


def fetch_page(url: str, timeout: float = 8.0) -> tuple[str, str]:
    """(final address, HTML) of a public web page, following up to 3 checked redirects."""
    for _ in range(MAX_REDIRECTS + 1):
        _check_host(url)
        try:
            with httpx.stream("GET", url, timeout=timeout, follow_redirects=False,
                              headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml",
                                       "Accept-Language": "he,en;q=0.8"}) as r:
                if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                    url = urljoin(url, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise SourceError("blocked_source" if r.status_code in (401, 403, 429) else "unreachable")
                if "html" not in r.headers.get("content-type", "text/html"):
                    raise SourceError("not_html")
                body = b""
                for chunk in r.iter_bytes():
                    body += chunk
                    if len(body) > MAX_PAGE_BYTES:
                        break
                return url, body.decode(r.encoding or "utf-8", errors="replace")
        except httpx.HTTPError as exc:
            raise SourceError("unreachable") from exc
    raise SourceError("unreachable")


# ------------------------------------------------------------------ reading pages
_SKIP = {"script", "style", "noscript", "nav", "header", "footer", "form", "button", "select", "svg", "iframe",
         "head", "aside", "template"}
_BREAK = {"br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "pre", "ul",
          "ol", "table", "blockquote", "dd", "dt"}
_VOID = {"br", "img", "hr", "input", "meta", "link", "source", "wbr"}


class _Page(HTMLParser):
    """Text lines (with how much of each is link text), links and the title."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[list] = [["", 0]]  # [text, link chars]
        self.links: list[tuple[str, str]] = []
        self.title = ""
        self.h1 = ""
        self._skip = 0
        self._link: list[str] | None = None
        self._href = ""
        self._in_title = False
        self._in_h1 = False

    def _newline(self) -> None:
        if self.lines[-1][0].strip():
            self.lines.append(["", 0])

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP and tag not in _VOID:
            self._skip += 1
        if tag in _BREAK:
            self._newline()
        if tag == "a":
            self._link, self._href = [], dict(attrs).get("href") or ""
        self._in_title = self._in_title or tag == "title"
        self._in_h1 = self._in_h1 or tag == "h1"

    def handle_endtag(self, tag):
        if tag in _SKIP and self._skip:
            self._skip -= 1
        if tag in _BREAK:
            self._newline()
        if tag == "a" and self._link is not None:
            self.links.append((self._href, " ".join("".join(self._link).split())))
            self._link = None
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_h1:
            self.h1 += data
        if self._link is not None:
            self._link.append(data)
        if self._skip:
            return
        for k, part in enumerate(data.split("\n")):
            if k:
                self._newline()
            text = " ".join(part.split())
            if text:
                line = self.lines[-1]
                line[0] = f"{line[0]} {text}".strip()
                if self._link is not None:
                    line[1] += len(text)


def parse_page(html: str) -> _Page:
    page = _Page()
    try:
        page.feed(html)
        page.close()
    except Exception:  # noqa: BLE001 - broken HTML: keep what was read
        pass
    return page


_CREDIT = re.compile(r"^(מילים|לחן|ביצוע|עיבוד|מבצע|כתיבה|הפקה|lyrics|music|written|composer)\s*[:：]", re.IGNORECASE)
_JUNK = re.compile(r"©|כל הזכויות|שתפו|שתף|פרסומת|הוסיפו תגובה|תגובות|להורדה|cookies?|privacy|הרשמה|התחברות|"
                   r"share|subscribe|advert|https?://", re.IGNORECASE)
_LETTER = re.compile(r"[א-תa-zA-Z]")


def _is_lyric(line: list) -> bool:
    text, link = line
    return (
        0 < len(text) <= 90
        and link < len(text) * 0.3
        and bool(_LETTER.search(text))
        and not _CREDIT.match(text)
        and not _JUNK.search(text)
    )


def extract_lyrics(html: str) -> tuple[str, str]:
    """(title, lyrics) from a song page; lyrics are "" when no good block is found."""
    page = parse_page(html)
    best: list[str] = []
    run: list[str] = []
    misses = 0
    for line in page.lines + [["", 0]]:
        if _is_lyric(line):
            run.append(line[0])
            misses = 0
        else:
            misses += 1
            if misses >= 2 or line[0]:  # a menu, a credit or a long paragraph ends the block
                if len(run) > len(best):
                    best = run
                run = []
    title = " ".join((page.h1 or page.title).split())[:200]
    if len(best) < 4:
        return title, ""
    return title, "\n".join(best)[:MAX_CHARS]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))  # no niqqud
    return re.sub(r"[^\w]+", " ", text.lower()).strip()


def song_links(html: str, base_url: str, query: str) -> list[str]:
    """Result links on a search page that look like the song: same site, and
    sharing words with the search."""
    page = parse_page(html)
    words = {w for w in _norm(query).split() if len(w) > 1}
    host = (urlsplit(base_url).hostname or "").removeprefix("www.")
    scored: list[tuple[int, str]] = []
    seen = set()
    for href, text in page.links:
        if not href or href.startswith(("#", "javascript:", "mailto:")):
            continue
        url = urljoin(base_url, href).split("#")[0]
        link_host = (urlsplit(url).hostname or "").removeprefix("www.")
        if link_host != host or url in seen or url.rstrip("/") == base_url.rstrip("/"):
            continue
        seen.add(url)
        hay = set(_norm(f"{text} {unquote(urlsplit(url).path)}").split())
        score = len(words & hay)
        if score:
            scored.append((score, url))
    scored.sort(key=lambda s: -s[0])
    return [url for _, url in scored[:PAGES_PER_SOURCE]]


# ------------------------------------------------------------------ searching
@dataclass
class SourceReport:
    template: str
    host: str
    search_url: str
    status: str  # "ok" | "no_results" | an error code
    results: list[dict] = field(default_factory=list)


def search_source(template: str, query: str) -> SourceReport:
    try:
        template = normalize_template(template)
    except SourceError as exc:
        return SourceReport(template, "", "", exc.code)
    search_url = template.replace("{q}", quote(query.strip()))
    host = (urlsplit(search_url).hostname or "").removeprefix("www.")
    report = SourceReport(template, host, search_url, "no_results")
    try:
        final_url, html = fetch_page(search_url)
    except SourceError as exc:
        report.status = exc.code
        return report
    seen_lyrics = set()
    for url in song_links(html, final_url, query):
        try:
            page_url, page_html = fetch_page(url)
        except SourceError:
            continue
        title, lyrics = extract_lyrics(page_html)
        if lyrics and lyrics not in seen_lyrics:
            seen_lyrics.add(lyrics)
            report.results.append({"title": title or host, "url": page_url, "lyrics": lyrics, "source": host})
    if report.results:
        report.status = "ok"
    return report


def search_sources(templates: list[str], query: str) -> list[dict]:
    templates = list(dict.fromkeys(t for t in templates if t.strip()))[:MAX_SOURCES]
    if not templates or not query.strip():
        return []
    with ThreadPoolExecutor(max_workers=min(4, len(templates))) as pool:
        return [asdict(r) for r in pool.map(lambda t: search_source(t, query), templates)]
