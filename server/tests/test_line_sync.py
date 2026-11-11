"""Automatic sync of words typed in the editor: API, alignment helpers, worker."""

import pytest

from karaokesync.supabase_client import SupabaseError
from karaokesync.worker import runner
from karaokesync.worker.errors import PipelineError
from karaokesync.worker.line_sync import assign_to_words, locate_region, run_line_sync, to_song_time, trim_edges

from .conftest import make_audio, needs_ffmpeg

AUTH = {"Authorization": "Bearer alice-token"}


@pytest.fixture
def project(fake_sb):
    alice = fake_sb.add_user("alice-token")
    fake_sb.add_user("bob-token")
    p = fake_sb.insert("projects", {"user_id": alice.id, "title": "שיר", "status": "ready", "language": "he"})
    fake_sb.insert("audio_files", {"project_id": p["id"], "user_id": alice.id, "storage_path": "a/p/x.mp3",
                                   "status": "verified", "duration_ms": 20000})
    return p


def _body(**kw):
    return {"words": ["שלום", "עולם"], "window_start_ms": 1000, "window_end_ms": 6000, **kw}


# ---------------------------------------------------------------------- API
def test_create_sync_job(client, fake_sb, project):
    resp = client.post(f"/projects/{project['id']}/sync-jobs", json=_body(words=[" שלום ", "עולם"]), headers=AUTH)
    assert resp.status_code == 201, resp.text
    job = resp.json()
    assert job["words"] == ["שלום", "עולם"] and job["language"] == "he" and job["status"] == "queued"
    assert job["user_id"] == project["user_id"]


def test_sync_window_is_clamped_to_the_song(client, project):
    job = client.post(f"/projects/{project['id']}/sync-jobs", json=_body(window_start_ms=15000, window_end_ms=40000),
                      headers=AUTH).json()
    assert job["window_end_ms"] == 20000


@pytest.mark.parametrize("body,code", [
    (_body(window_end_ms=70000), "invalid_sync_window"),
    (_body(window_start_ms=5000, window_end_ms=5100), "invalid_sync_window"),
    (_body(window_start_ms=21000, window_end_ms=25000), "invalid_sync_window"),
])
def test_sync_rejects_bad_windows(client, project, body, code):
    resp = client.post(f"/projects/{project['id']}/sync-jobs", json=body, headers=AUTH)
    assert resp.status_code == 422 and resp.json()["detail"] == code


def test_sync_validates_words(client, project):
    url = f"/projects/{project['id']}/sync-jobs"
    assert client.post(url, json=_body(words=[]), headers=AUTH).status_code == 422
    assert client.post(url, json=_body(words=["ok", "  "]), headers=AUTH).status_code == 422
    assert client.post(url, json=_body(words=["x" * 101]), headers=AUTH).status_code == 422
    assert client.post(url, json=_body(words=["w"] * 81), headers=AUTH).status_code == 422


def test_sync_requires_owner_and_ready_project(client, fake_sb, project):
    url = f"/projects/{project['id']}/sync-jobs"
    assert client.post(url, json=_body(), headers={"Authorization": "Bearer bob-token"}).status_code == 404
    assert client.post(url, json=_body()).status_code == 401
    fake_sb.update("projects", {"id": f"eq.{project['id']}"}, {"status": "processing"})
    assert client.post(url, json=_body(), headers=AUTH).json()["detail"] == "not_ready"


def test_sync_limits(client, fake_sb, project, monkeypatch):
    from karaokesync.config import get_settings

    url = f"/projects/{project['id']}/sync-jobs"
    for _ in range(3):
        assert client.post(url, json=_body(), headers=AUTH).status_code == 201
    resp = client.post(url, json=_body(), headers=AUTH)
    assert resp.status_code == 429 and resp.json()["detail"] == "too_many_active_syncs"
    for job in fake_sb.tables["sync_jobs"]:
        job["status"] = "succeeded"
    monkeypatch.setattr(get_settings(), "max_syncs_per_day", 3)
    resp = client.post(url, json=_body(), headers=AUTH)
    assert resp.status_code == 429 and resp.json()["detail"] == "daily_sync_limit"


# --------------------------------------------------------------- alignment
def test_assign_to_words_groups_split_pieces():
    # Typed: "שלום," (3 tokens) and "עולם" (2 tokens); Whisper splits the comma off.
    alignment = [
        {"tokens": [1, 2], "start": 1.0, "end": 1.4, "probability": 0.9},
        {"tokens": [3], "start": 1.4, "end": 1.5, "probability": 0.5},
        {"tokens": [4, 5], "start": 1.6, "end": 2.2, "probability": 0.8},
    ]
    times = assign_to_words([3, 2], alignment)
    assert times[0] == (1.0, 1.5, pytest.approx(0.7))
    assert times[1] == (1.6, 2.2, 0.8)


def test_trim_edges_caps_words_stretched_over_silence():
    times = [(0.0, 4.0, 0.9), (4.0, 4.4, 0.9), (4.5, 4.9, 0.9), (5.0, 12.0, 0.9)]
    out = trim_edges(times)
    assert out[0] == (3.0, 4.0, 0.9)  # cap = max(1 s, 2 × median word)
    assert out[-1] == (5.0, 6.0, 0.9)
    assert out[1:3] == times[1:3]


def test_locate_region_prefers_matching_words():
    heard = [("blah", 1.0, 1.5), ("שָׁלוֹם", 20.0, 20.5), ("עולם!", 21.0, 21.6), ("noise", 50.0, 51.0)]
    assert locate_region(heard, ["שלום", "עולם"], 60.0) == (19.0, 22.6)
    # Nothing matches: any singing is used.
    assert locate_region([("la", 40.0, 41.0)], ["שלום"], 60.0) == (39.0, 42.0)
    assert locate_region([], ["שלום"], 60.0) is None
    # Never more than 30 s.
    start, end = locate_region([("a", 0.0, 1.0), ("b", 55.0, 56.0)], ["a", "b"], 60.0)
    assert start == 0.0 and end == 30.0


def test_to_song_time_keeps_the_editor_rules():
    out = to_song_time([(0.5, 0.9, 0.9), (0.4, 0.45, 1.4), (1.0, 9.0, -1)], 10_000, 12_000)
    assert [w["start_ms"] for w in out] == [10_500, 10_500, 11_000]  # never goes back in time
    assert out[1]["end_ms"] >= out[1]["start_ms"] + 80 or out[1]["end_ms"] == out[2]["start_ms"]
    assert out[2]["end_ms"] == 12_000  # inside the window
    assert out[1]["confidence"] == 1.0 and out[2]["confidence"] == 0.0


# ------------------------------------------------------------------ worker
@needs_ffmpeg
def test_run_line_sync_cuts_the_window(fake_sb, project, tmp_path, monkeypatch):
    from karaokesync.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_tmp_dir", str(tmp_path / "work"))
    fake_sb.put_object("audio", "a/p/x.mp3", make_audio(tmp_path, "mp3", 6))
    seen = {}

    def fake_align(model, samples, words, language):
        seen.update(n=len(samples), words=words, language=language)
        return [(0.2, 0.6, 0.9), (0.7, 1.2, 0.6)]

    monkeypatch.setattr("karaokesync.worker.line_sync._load_model", lambda *a: object())
    monkeypatch.setattr("karaokesync.worker.line_sync.align_words", fake_align)
    job = fake_sb.insert("sync_jobs", {"project_id": project["id"], "user_id": project["user_id"], "words": ["שלום", "עולם"],
                                       "window_start_ms": 2000, "window_end_ms": 4500, "language": "he"})
    progress = []
    result = run_line_sync(job, fake_sb, settings, progress.append)
    assert abs(seen["n"] - 2.5 * 16000) < 400  # only the 2.5 s window was decoded
    assert seen["words"] == ["שלום", "עולם"] and seen["language"] == "he"
    assert result == [{"start_ms": 2200, "end_ms": 2600, "confidence": 0.9},
                      {"start_ms": 2700, "end_ms": 3200, "confidence": 0.6}]
    assert progress == sorted(progress) and not any((tmp_path / "work").iterdir())


def test_worker_keeps_processing_without_the_newer_queues(monkeypatch):
    class OldDatabase:
        def __init__(self):
            self.calls = []

        def rpc(self, fn, args):
            self.calls.append(fn)
            if fn in ("claim_sync_job", "claim_instrumental_job"):
                raise SupabaseError(404, "Could not find the function", "PGRST202")
            return []

    monkeypatch.setattr(runner, "_unavailable", set())
    sb = OldDatabase()
    from karaokesync.config import get_settings

    assert runner.process_one(sb, get_settings(), "w1") is False
    assert runner.process_one(sb, get_settings(), "w1") is False
    # Each missing queue is tried once, then skipped; songs and exports keep working.
    assert sb.calls == ["claim_sync_job", "claim_processing_job", "claim_instrumental_job", "claim_export_job",
                        "claim_processing_job", "claim_export_job"]


def test_sync_errors_are_reported(fake_sb, project, monkeypatch):
    from karaokesync.config import get_settings

    calls = []
    monkeypatch.setattr(fake_sb, "rpc", lambda fn, args: calls.append((fn, args)) or True)
    monkeypatch.setattr(runner, "run_line_sync", lambda *a: (_ for _ in ()).throw(PipelineError("sync_no_vocals", False)))
    job = {"id": "j1", "project_id": project["id"], "words": ["a"]}
    runner._run_sync(fake_sb, get_settings(), "w1", job)
    fail = [args for fn, args in calls if fn == "fail_sync_job"]
    assert fail == [{"p_job_id": "j1", "p_worker_id": "w1", "p_error_code": "sync_no_vocals", "p_retryable": False}]


class FakeWhisper:
    """Just enough of faster-whisper's WhisperModel to drive align_words."""

    class model:
        is_multilingual = True

    class feature_extractor:
        nb_max_frames = 3000

        def __new__(cls, samples):
            import numpy as np

            return np.zeros((80, len(samples) // 160 + 1), dtype="float32")

    hf_tokenizer = None

    def __init__(self, heard=()):
        self.heard, self.aligned_frames, self.transcribed = list(heard), None, False

    def encode(self, features):
        assert features.shape[-1] == 3000  # padded to Whisper's 30 s window
        return "encoded"

    def transcribe(self, samples, **kw):
        from types import SimpleNamespace as NS

        self.transcribed = kw["initial_prompt"]
        words = [NS(word=w, start=s, end=e) for w, s, e in self.heard]
        return iter([NS(words=words)]), None

    def find_alignment(self, tokenizer, text_tokens, encoder_output, num_frames):
        self.aligned_frames = num_frames
        n = len(text_tokens[0])
        return [[{"tokens": [t], "start": 1.0 + i, "end": 1.5 + i, "probability": 0.8} for i, t in enumerate(text_tokens[0])]][:n]


class FakeTokenizer:
    def __init__(self, *a, **kw):
        self.language = kw["language"]

    def encode(self, text):
        return [len(text)]  # one token per word


def test_align_words_short_window(monkeypatch):
    np = pytest.importorskip("numpy")
    pytest.importorskip("faster_whisper")
    from karaokesync.worker.line_sync import align_words

    monkeypatch.setattr("faster_whisper.tokenizer.Tokenizer", FakeTokenizer)
    model = FakeWhisper()
    times = align_words(model, np.zeros(16000 * 10, dtype="float32"), ["שלום", "עולם"], "he")
    assert model.aligned_frames == 1000 and model.transcribed is False
    assert times == [(1.0, 1.5, 0.8), (2.0, 2.5, 0.8)]


def test_align_words_long_window_finds_the_singing_first(monkeypatch):
    np = pytest.importorskip("numpy")
    pytest.importorskip("faster_whisper")
    from karaokesync.worker.line_sync import align_words

    monkeypatch.setattr("faster_whisper.tokenizer.Tokenizer", FakeTokenizer)
    model = FakeWhisper(heard=[("שלום", 40.0, 40.5), ("עולם", 41.0, 41.5)])
    times = align_words(model, np.zeros(16000 * 50, dtype="float32"), ["שלום", "עולם"], "he")
    assert model.transcribed == "שלום עולם"
    assert times[0][0] == pytest.approx(39.0 + 1.0)  # region starts 1 s before the singing
    with pytest.raises(PipelineError):
        align_words(FakeWhisper(heard=[]), np.zeros(16000 * 50, dtype="float32"), ["x"], "he")
