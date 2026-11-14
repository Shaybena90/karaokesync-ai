"""Online lyrics search (LRCLIB), with the service faked."""

import httpx
import pytest

from karaokesync import lyrics_search as ls

USER = {"Authorization": "Bearer user-token"}

SONG = {
    "id": 11, "trackName": "שיר בדיקה", "artistName": "זמרת", "albumName": "אלבום", "duration": 183.4,
    "instrumental": False, "plainLyrics": "שורה ראשונה\nשורה שנייה",
    "syncedLyrics": "[00:12.10] שורה ראשונה\n[00:15.80] שורה שנייה",
}
OTHER = {"id": 12, "trackName": "שיר בדיקה (לייב)", "artistName": "זמרת", "albumName": "", "duration": 240,
         "instrumental": False, "plainLyrics": "", "syncedLyrics": "[00:01.00][00:30.00] רק מתוזמן\n[01:02.5] עוד"}
INSTRUMENTAL = {"id": 13, "trackName": "שיר בדיקה", "artistName": "x", "duration": 183, "instrumental": True,
                "plainLyrics": None, "syncedLyrics": None}


@pytest.fixture
def service(monkeypatch):
    calls = []

    class Reply:
        def __init__(self, data, code=200):
            self.data, self.status_code = data, code

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("bad", request=httpx.Request("GET", "https://x"), response=None)

        def json(self):
            return self.data

    state = {"data": [OTHER, SONG, INSTRUMENTAL], "fail": False}

    def fake_get(url, params, timeout, headers):
        calls.append((url, params, headers))
        if state["fail"]:
            raise httpx.ConnectError("down")
        return Reply(state["data"])

    monkeypatch.setattr(ls.httpx, "get", fake_get)
    monkeypatch.setattr(ls, "_cache", {})
    state["calls"] = calls
    return state


def test_clean_query_removes_file_noise():
    assert ls.clean_query("Omer_Adam - Song Name (Official Video) [HD].mp3") == "Omer Adam - Song Name"
    assert ls.clean_query("עומר אדם - שיר (קליפ רשמי).m4a") == "עומר אדם - שיר"
    assert ls.clean_query("   ") == ""


def test_results_best_first_with_plain_words(service):
    results = ls.search_lyrics("זמרת - שיר בדיקה", "https://lrclib.net", duration_ms=184_000)
    assert [r["id"] for r in results] == [11, 12]  # the instrumental one is left out
    best = results[0]
    assert best["matches_length"] is True and best["synced"] is True
    assert best["lyrics"] == "שורה ראשונה\nשורה שנייה"
    assert results[1]["lyrics"] == "רק מתוזמן\nעוד"  # time tags removed
    # "Artist - Song": searched as free text and both ways round, with only the song name sent
    params = [c[1] for c in service["calls"]]
    assert params == [{"q": "זמרת - שיר בדיקה"}, {"track_name": "שיר בדיקה", "artist_name": "זמרת"},
                      {"track_name": "זמרת", "artist_name": "שיר בדיקה"}]
    assert service["calls"][0][2]["User-Agent"] == ls.USER_AGENT


def test_results_are_kept_for_a_while(service):
    ls.search_lyrics("שיר", "https://lrclib.net")
    ls.search_lyrics("שיר", "https://lrclib.net")
    assert len(service["calls"]) == 1


def test_service_down(service):
    service["fail"] = True
    with pytest.raises(ls.LyricsSearchError):
        ls.search_lyrics("שיר", "https://lrclib.net")


def test_api_needs_sign_in_and_reports_a_down_service(client, fake_sb, service):
    fake_sb.add_user("user-token")
    assert client.get("/lyrics-search", params={"q": "שיר"}).status_code == 401
    body = client.get("/lyrics-search", params={"q": "שיר בדיקה", "duration_ms": 183000}, headers=USER).json()
    assert body["results"][0]["title"] == "שיר בדיקה" and body["results"][0]["matches_length"]
    assert client.get("/lyrics-search", params={"q": ""}, headers=USER).status_code == 422
    service["fail"] = True
    r = client.get("/lyrics-search", params={"q": "אחר"}, headers=USER)
    assert r.status_code == 503 and r.json()["detail"] == "lyrics_search_unavailable"
