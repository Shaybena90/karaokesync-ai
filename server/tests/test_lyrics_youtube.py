"""YouTube as a lyrics source, through the official API (faked here)."""

import pytest

from karaokesync import lyrics_sources as src
from karaokesync import lyrics_youtube as yt

DESCRIPTION = """הקליפ הרשמי לשיר החדש!
להאזנה בספוטיפיי: https://open.spotify.com/x
מילים ולחן: יוסי כהן

אויר הרים צלול כיין
וריח אורנים
נישא ברוח הערביים
עם קול פעמונים

ובתרדמת אילן ואבן
שבויה בחלומה

הפקה מוזיקלית: מישהו
#ירושלים #שיר"""


class Reply:
    def __init__(self, data, code=200):
        self.data, self.status_code = data, code

    def json(self):
        return self.data


@pytest.fixture
def api(monkeypatch):
    calls = []
    state = {"code": 200}

    def fake_get(url, params, timeout):
        calls.append((url, params))
        if state["code"] != 200:
            return Reply({"error": {"errors": [{"reason": state.get("reason", "")}]}}, state["code"])
        if url.endswith("/search"):
            return Reply({"items": [{"id": {"videoId": "fan12345678"}}, {"id": {"videoId": "off12345678"}}]})
        return Reply({"items": [
            {"id": "fan12345678", "snippet": {"title": "ירושלים (קאבר)", "channelTitle": "מעריץ", "description": DESCRIPTION}},
            {"id": "off12345678", "snippet": {"title": "ירושלים של זהב - הקליפ הרשמי", "channelTitle": "נעמי",
                                               "description": DESCRIPTION}},
            {"id": "nolyrics1234", "snippet": {"title": "x", "channelTitle": "y", "description": "Provided to YouTube"}},
        ]})

    monkeypatch.setattr(yt.httpx, "get", fake_get)
    state["calls"] = calls
    return state


def test_lyrics_come_out_of_a_description():
    lyrics = yt.lyrics_from_description(DESCRIPTION)
    assert lyrics.split("\n")[0] == "אויר הרים צלול כיין"
    assert lyrics.split("\n")[-1] == "שבויה בחלומה"
    assert "spotify" not in lyrics and "מילים ולחן" not in lyrics and "#" not in lyrics
    assert yt.lyrics_from_description("Provided to YouTube by X\n℗ 2020") == ""


def test_youtube_addresses_become_the_youtube_source():
    for url in ("http://www.youtube.com", "youtube.com", "https://m.youtube.com/results?search_query=test"):
        assert src.normalize_template(url) == yt.SEARCH_URL


def test_search_official_videos_first(api):
    results = yt.search_youtube("ירושלים של זהב", "KEY")
    assert [r["url"] for r in results] == ["https://www.youtube.com/watch?v=off12345678",
                                          "https://www.youtube.com/watch?v=fan12345678"]
    assert results[0]["source"] == "youtube.com" and results[0]["artist"] == "נעמי"
    search_params = api["calls"][0][1]
    assert search_params["key"] == "KEY" and search_params["videoCategoryId"] == "10"


def test_without_a_key_youtube_says_so(api):
    [report] = src.search_sources(["http://www.youtube.com"], "ירושלים", youtube_key="")
    assert report["status"] == "needs_key" and report["search_url"].startswith("https://www.youtube.com/results?search_query=")
    assert api["calls"] == []  # nothing is sent without a key


@pytest.mark.parametrize("reason,code", [("quotaExceeded", "quota"), ("keyInvalid", "bad_key")])
def test_quota_and_bad_key(api, reason, code):
    api["code"], api["reason"] = 403, reason
    [report] = src.search_sources(["https://www.youtube.com/results?search_query={q}"], "שיר", youtube_key="KEY")
    assert report["status"] == code


def test_youtube_through_the_api(client, fake_sb, api, monkeypatch):
    from karaokesync.config import get_settings

    fake_sb.add_user("user-token")
    monkeypatch.setattr(get_settings(), "youtube_api_key", "KEY")
    body = {"q": "ירושלים של זהב", "sources": ["http://www.youtube.com"]}
    [report] = client.post("/lyrics-sources/search", json=body, headers={"Authorization": "Bearer user-token"}).json()["sources"]
    assert report["status"] == "ok" and report["results"][0]["title"] == "ירושלים של זהב - הקליפ הרשמי"
