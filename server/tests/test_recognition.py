"""Recognition quality: vocals first, the melody-only track kept, model choice, language hint."""

import pytest

from karaokesync.worker import transcribe as tr
from karaokesync.worker.lines import Word
from karaokesync.worker.transcribe import Transcript, pick_model

from .conftest import make_audio, needs_ffmpeg
from .test_instrumental import fake_demucs  # noqa: F401 - pytest fixture

AUTH = {"Authorization": "Bearer alice-token"}


@pytest.fixture
def song(fake_sb, tmp_path):
    alice = fake_sb.add_user("alice-token")
    p = fake_sb.insert("projects", {"user_id": alice.id, "title": "שיר", "status": "processing", "language": "he"})
    path = f"{alice.id}/{p['id']}/s.mp3"
    audio = fake_sb.insert("audio_files", {"project_id": p["id"], "user_id": alice.id, "storage_path": path, "status": "verified"})
    fake_sb.put_object("audio", path, make_audio(tmp_path, "mp3", 3))
    job = fake_sb.insert("processing_jobs", {"project_id": p["id"], "audio_file_id": audio["id"], "user_id": alice.id})
    return {"project": p, "audio": audio, "job": job}


def fake_transcribe(seen: dict):
    def run(audio, model_name, device, compute_type, language=None, on_progress=None, language_models=None):
        seen.update(file=audio.name, language=language)
        words = [Word(text=t, start_ms=500 + i * 400, end_ms=850 + i * 400, confidence=0.9, segment_index=0)
                 for i, t in enumerate(["שלום", "עולם"])]
        return Transcript(language=language or "he", language_probability=1.0, words=words)
    return run


# ----------------------------------------------------------- vocals first
@needs_ffmpeg
def test_singing_is_recognised_on_the_vocals_and_the_melody_is_kept(fake_sb, song, fake_demucs, tmp_path, monkeypatch):  # noqa: F811
    from karaokesync.config import get_settings
    from karaokesync.worker.pipeline import run_pipeline

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    monkeypatch.setattr(settings, "vocal_separation", "auto")  # Demucs is installed (the stand-in)
    seen: dict = {}
    monkeypatch.setattr("karaokesync.worker.pipeline.transcribe", fake_transcribe(seen))
    stages: list[str] = []
    payload = run_pipeline(song["job"], fake_sb, settings, lambda stage, p: stages.append(stage))

    assert seen["file"] == "vocals_16k.wav"  # recognised on the vocals, not the full mix
    assert seen["language"] == "he"           # the user's choice is used
    assert "separating_vocals" in stages and payload["lines"]
    # The separation's other half became the song's melody-only track.
    rows = fake_sb.tables["instrumental_jobs"]
    assert len(rows) == 1 and rows[0]["status"] == "succeeded"
    assert rows[0]["output_path"] in fake_sb.objects["audio"]
    assert not any((tmp_path / "work").iterdir())


@needs_ffmpeg
def test_without_demucs_the_full_mix_is_used(fake_sb, song, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker import pipeline

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    monkeypatch.setattr(settings, "vocal_separation", "auto")
    monkeypatch.setattr(pipeline.importlib.util, "find_spec", lambda name: None)
    seen: dict = {}
    monkeypatch.setattr("karaokesync.worker.pipeline.transcribe", fake_transcribe(seen))
    pipeline.run_pipeline(song["job"], fake_sb, settings, lambda stage, p: None)
    assert seen["file"] == "mix_16k.wav" and fake_sb.tables["instrumental_jobs"] == []


def test_separation_setting(monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker import pipeline

    s = get_settings()
    for mode, legacy, installed, expected in (("off", False, True, False), ("on", False, False, True),
                                              ("auto", False, True, True), ("auto", False, False, False),
                                              ("off", True, False, True)):  # the older ENABLE_VOCAL_SEPARATION=true
        monkeypatch.setattr(s, "vocal_separation", mode)
        monkeypatch.setattr(s, "enable_vocal_separation", legacy)
        monkeypatch.setattr(pipeline.importlib.util, "find_spec", lambda name, ok=installed: object() if ok else None)
        assert pipeline.use_vocal_separation(s) is expected, (mode, legacy, installed)


# ------------------------------------------------------------ model choice
class FakeModel:
    def __init__(self, name):
        self.name = name

    def detect_language(self, audio):
        return ("he", 0.99, [])

    def transcribe(self, samples, **kw):
        from types import SimpleNamespace as NS

        self.used = kw
        return iter([]), NS(language=kw["language"], language_probability=1.0, duration=1.0)


@needs_ffmpeg
def test_a_language_gets_its_own_model_with_a_safe_fallback(tmp_path, monkeypatch):
    from karaokesync.worker.audio_tools import to_working_wav

    wav = to_working_wav(make_audio(tmp_path, "mp3", 1), tmp_path / "w.wav")
    loaded: list[str] = []

    def load(name, device, compute):
        loaded.append(name)
        if name == "broken/model":
            raise OSError("not found")
        return FakeModel(name)

    monkeypatch.setattr(tr, "_load_model", load)
    out = tr.transcribe(wav, "large-v3-turbo", "cpu", "int8", language_models={"he": "ivrit/model"})
    assert loaded == ["large-v3-turbo", "ivrit/model"] and out.language == "he"  # detected, then the Hebrew model

    loaded.clear()
    tr.transcribe(wav, "large-v3-turbo", "cpu", "int8", language="en", language_models={"he": "ivrit/model"})
    assert set(loaded) == {"large-v3-turbo"}  # English: the default model (cached, so asking twice is free)

    loaded.clear()
    out = tr.transcribe(wav, "large-v3-turbo", "cpu", "int8", language="he", language_models={"he": "broken/model"})
    assert loaded == ["large-v3-turbo", "broken/model", "large-v3-turbo"] and out.language == "he"


def test_language_models_setting():
    from karaokesync.config import Settings

    s = Settings(whisper_language_models=" he = ivrit-ai/x , bad, ar=y ")
    assert s.language_models() == {"he": "ivrit-ai/x", "ar": "y"}
    assert pick_model("d", s.language_models(), "HE") == "ivrit-ai/x" and pick_model("d", {}, None) == "d"


# ---------------------------------------------------------- language hint
@pytest.mark.parametrize("language,status", [("he", 201), ("en", 201), (None, 201), ("fr", 422)])
def test_upload_takes_the_song_language(client, fake_sb, language, status):
    fake_sb.add_user("alice-token")
    body = {"file_name": "a.mp3", "size_bytes": 1000, "mime_type": "audio/mpeg", "language": language}
    resp = client.post("/uploads", json=body, headers=AUTH)
    assert resp.status_code == status, resp.text
    if status == 201:
        assert fake_sb.tables["projects"][0]["language"] == language


# ------------------------------------------------------------- pasted lyrics
@needs_ffmpeg
def test_pasted_lyrics_keep_the_users_words_and_lines(fake_sb, song, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker import pasted_lyrics
    from karaokesync.worker.pipeline import run_pipeline

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    monkeypatch.setattr(settings, "vocal_separation", "off")
    fake_sb.update("projects", {"id": f"eq.{song['project']['id']}"}, {"lyrics_text": "[פזמון]\nשלום עולם\n\nזה שיר יפה"})
    # The recogniser heard "שלום עולם" (only): enough to anchor the lines.
    monkeypatch.setattr("karaokesync.worker.pipeline.transcribe", fake_transcribe({}))
    monkeypatch.setattr("karaokesync.worker.pipeline.load_model_for", lambda *a: "model")
    aligned = []

    def fake_align(model, clip, words, language):
        aligned.append(words)
        return [(0.2 + i * 0.3, 0.45 + i * 0.3, 0.95) for i in range(len(words))]

    monkeypatch.setattr(pasted_lyrics, "align_words", fake_align)
    stages: list[str] = []
    payload = run_pipeline(song["job"], fake_sb, settings, lambda stage, p: stages.append(stage))

    assert [[w["text"] for w in line["words"]] for line in payload["lines"]] == [["שלום", "עולם"], ["זה", "שיר", "יפה"]]
    assert payload["alignment_method"] == "pasted" and "aligning_pasted" in stages
    assert aligned == [["שלום", "עולם", "זה", "שיר", "יפה"]]
    starts = [w["start_ms"] for line in payload["lines"] for w in line["words"]]
    assert starts == sorted(starts)


@needs_ffmpeg
def test_pasted_lyrics_work_even_when_nothing_was_heard(fake_sb, song, tmp_path, monkeypatch):
    from karaokesync.config import get_settings
    from karaokesync.worker import pasted_lyrics
    from karaokesync.worker.pipeline import run_pipeline

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    monkeypatch.setattr(settings, "vocal_separation", "off")
    fake_sb.update("projects", {"id": f"eq.{song['project']['id']}"}, {"lyrics_text": "שלום עולם"})

    def nothing_heard(*a, **kw):
        return Transcript(language="he", language_probability=1.0, words=[])

    monkeypatch.setattr("karaokesync.worker.pipeline.transcribe", nothing_heard)
    monkeypatch.setattr("karaokesync.worker.pipeline.load_model_for", lambda *a: "model")
    monkeypatch.setattr(pasted_lyrics, "align_words", lambda m, c, words, lang: [(0.5, 0.9, 0.7), (1.0, 1.4, 0.7)])
    payload = run_pipeline(song["job"], fake_sb, settings, lambda stage, p: None)
    assert [w["text"] for w in payload["lines"][0]["words"]] == ["שלום", "עולם"]  # no "no lyrics detected" failure


# ------------------------------------------------------------ pasted lyrics API
def test_lyrics_pasted_at_upload_are_saved(client, fake_sb):
    fake_sb.add_user("alice-token")
    body = {"file_name": "a.mp3", "size_bytes": 1000, "mime_type": "audio/mpeg", "lyrics_text": "  שלום עולם\r\nזה שיר  "}
    assert client.post("/uploads", json=body, headers=AUTH).status_code == 201
    assert fake_sb.tables["projects"][0]["lyrics_text"] == "שלום עולם\nזה שיר"
    # Nothing pasted: the column is not even sent (works before the SQL file is run).
    client.post("/uploads", json={**body, "lyrics_text": "   "}, headers=AUTH)
    assert "lyrics_text" not in fake_sb.tables["projects"][1]
    too_long = client.post("/uploads", json={**body, "lyrics_text": "x" * 20001}, headers=AUTH)
    assert too_long.status_code == 422


def test_use_pasted_lyrics_processes_the_song_again(client, fake_sb, song):
    pid = song["project"]["id"]
    fake_sb.update("processing_jobs", {"id": f"eq.{song['job']['id']}"}, {"status": "succeeded"})
    fake_sb.update("projects", {"id": f"eq.{pid}"}, {"status": "ready"})
    url = f"/projects/{pid}/lyrics-text"
    assert client.post(url, json={"text": "שלום"}, headers={"Authorization": "Bearer bob-token"}).status_code == 401
    resp = client.post(url, json={"text": "שלום עולם\nזה שיר"}, headers=AUTH)
    assert resp.status_code == 200 and resp.json()["status"] == "queued"
    project = fake_sb.tables["projects"][0]
    assert project["lyrics_text"] == "שלום עולם\nזה שיר" and project["status"] == "queued"
    # Already processing: refused instead of queuing twice.
    assert client.post(url, json={"text": "x"}, headers=AUTH).json()["detail"] == "already_processing"
    # Clearing the text goes back to plain recognition.
    fake_sb.update("processing_jobs", {"status": "eq.queued"}, {"status": "succeeded"})
    assert client.post(url, json={"text": ""}, headers=AUTH).status_code == 200
    assert fake_sb.tables["projects"][0]["lyrics_text"] is None
