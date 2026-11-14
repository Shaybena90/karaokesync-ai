"""The user's own lyrics websites: reading pages, safety checks, the API (sites faked)."""

import contextlib

import pytest

from karaokesync import lyrics_sources as src

USER = {"Authorization": "Bearer user-token"}

SEARCH_PAGE = """<html><head><title>חיפוש</title></head><body>
<nav><a href="/">ראשי</a><a href="/songs">שירים</a><a href="/about">אודות</a></nav>
<div class="results">
  <a href="/song/123-%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D-%D7%A9%D7%9C-%D7%96%D7%94%D7%91">ירושלים של זהב - נעמי שמר</a>
  <a href="/song/999">שיר אחר לגמרי</a>
  <a href="https://other-site.com/ירושלים">ירושלים באתר אחר</a>
</div></body></html>"""

SONG_PAGE = """<html><head><title>ירושלים של זהב | אתר שירים</title></head><body>
<header><a href="/">ראשי</a> <a href="/top">מצעד</a></header>
<h1>ירושלים של זהב</h1>
<div class="credits">מילים: נעמי שמר<br>לחן: נעמי שמר</div>
<div class="lyrics">
אויר הרים צלול כיין<br>וריח אורנים<br>נישא ברוח הערביים<br>עם קול פעמונים<br><br>
ובתרדמת אילן ואבן<br>שבויה בחלומה<br>העיר אשר בדד יושבת<br>ובליבה חומה
</div>
<p>כל הזכויות שמורות © 2026</p>
<ul><li><a href="/a">שיר א</a></li><li><a href="/b">שיר ב</a></li><li><a href="/c">שיר ג</a></li><li><a href="/d">שיר ד</a></li></ul>
<script>var lyrics = "not this";</script>
</body></html>"""


def test_templates_from_what_users_paste():
    assert src.normalize_template("https://site.co.il/search?q={q}") == "https://site.co.il/search?q={q}"
    assert src.normalize_template("https://site.co.il/search?q=test&type=song") == "https://site.co.il/search?q={q}&type=song"
    assert src.normalize_template("site.co.il/?s=%D7%91%D7%93%D7%99%D7%A7%D7%94") == "https://site.co.il/?s={q}"
    assert src.normalize_template("https://site.co.il") == "https://site.co.il/?s={q}"
    for bad in ("ftp://site.co.il/{q}", "https://site.co.il/some/page", "javascript:alert(1)"):
        with pytest.raises(src.SourceError):
            src.normalize_template(bad)


def test_lyrics_come_out_of_a_song_page():
    title, lyrics = src.extract_lyrics(SONG_PAGE)
    assert title == "ירושלים של זהב"
    lines = lyrics.split("\n")
    assert lines[0] == "אויר הרים צלול כיין" and lines[-1] == "ובליבה חומה" and len(lines) == 8
    assert "נעמי שמר" not in lyrics and "©" not in lyrics and "שיר א" not in lyrics and "not this" not in lyrics


def test_a_page_without_lyrics_gives_nothing():
    assert src.extract_lyrics("<p>שלום</p><p>" + "טקסט ארוך מאוד " * 20 + "</p>")[1] == ""


def test_result_links_that_look_like_the_song():
    links = src.song_links(SEARCH_PAGE, "https://www.shirim.example/search?q=x", "ירושלים של זהב")
    assert links == ["https://www.shirim.example/song/123-%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D-%D7%A9%D7%9C-%D7%96%D7%94%D7%91"]


@pytest.mark.parametrize("url", ["http://127.0.0.1/x", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data",
                                 "http://[::1]/", "http://192.168.1.1/", "https://8.8.8.8:8443/"])
def test_private_and_odd_addresses_are_refused(url):
    with pytest.raises(src.SourceError) as err:
        src.fetch_page(url)
    assert err.value.code == "blocked_source"


def test_redirects_are_checked_too(monkeypatch):
    class Reply:
        status_code, headers, encoding = 302, {"location": "http://127.0.0.1/admin"}, "utf-8"

    @contextlib.contextmanager
    def fake_stream(method, url, **kw):
        yield Reply()

    monkeypatch.setattr(src, "_check_host", lambda url: (_ for _ in ()).throw(src.SourceError("blocked_source"))
                        if "127.0.0.1" in url else None)
    monkeypatch.setattr(src.httpx, "stream", fake_stream)
    with pytest.raises(src.SourceError) as err:
        src.fetch_page("https://public.example/")
    assert err.value.code == "blocked_source"


@pytest.fixture
def sites(monkeypatch):
    pages = {
        "https://shirim.example/?s=%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D%20%D7%A9%D7%9C%20%D7%96%D7%94%D7%91": SEARCH_PAGE,
        "https://shirim.example/song/123-%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D-%D7%A9%D7%9C-%D7%96%D7%94%D7%91": SONG_PAGE,
    }
    fetched = []

    def fake_fetch(url, timeout=8.0):
        fetched.append(url)
        if "blocked.example" in url:
            raise src.SourceError("blocked_source")
        if url not in pages:
            return url, "<html><body><p>אין תוצאות</p></body></html>"
        return url, pages[url]

    monkeypatch.setattr(src, "fetch_page", fake_fetch)
    return fetched


def test_search_my_sites_end_to_end(client, fake_sb, sites):
    fake_sb.add_user("user-token")
    body = {"q": "ירושלים של זהב", "sources": ["https://shirim.example", "https://empty.example/find?w={q}",
                                                "https://blocked.example/?s={q}"]}
    assert client.post("/lyrics-sources/search", json=body).status_code == 401
    reports = client.post("/lyrics-sources/search", json=body, headers=USER).json()["sources"]
    assert [r["status"] for r in reports] == ["ok", "no_results", "blocked_source"]
    hit = reports[0]["results"][0]
    assert hit["source"] == "shirim.example" and hit["title"] == "ירושלים של זהב"
    assert hit["lyrics"].startswith("אויר הרים צלול כיין")
    assert reports[1]["search_url"] == "https://empty.example/find?w=%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D%20%D7%A9%D7%9C%20%D7%96%D7%94%D7%91"


def test_api_normalizes_and_limits(client, fake_sb):
    fake_sb.add_user("user-token")
    r = client.post("/lyrics-sources/normalize", json={"url": "https://site.co.il/search?q=test"}, headers=USER)
    assert r.json() == {"template": "https://site.co.il/search?q={q}"}
    r = client.post("/lyrics-sources/normalize", json={"url": "https://site.co.il/a/b"}, headers=USER)
    assert r.status_code == 422 and r.json()["detail"] == "invalid_source"
    too_many = {"q": "שיר", "sources": [f"https://s{i}.example/?s={{q}}" for i in range(9)]}
    assert client.post("/lyrics-sources/search", json=too_many, headers=USER).status_code == 422
