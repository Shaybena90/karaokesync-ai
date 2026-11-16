"""The worker updates itself: it notices a newer published version while idle."""

from pathlib import Path

import httpx
import pytest

from karaokesync.worker import runner, self_update

ROOT = Path(__file__).resolve().parents[2]


def client(text: str, status: int = 200) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(status, text=text)))


def test_reads_the_published_version():
    assert self_update.latest_version(client('x = 1\nWORKER_VERSION = "2027-01-02.1 (new)"\n')) == "2027-01-02.1 (new)"
    assert self_update.latest_version(client("nothing here")) is None
    assert self_update.latest_version(client("", 404)) is None


def test_compares_versions_by_date_and_number():
    assert self_update.is_newer("2026-11-16.4 (x)", "2026-11-16.3 (auto update)")
    assert self_update.is_newer("2026-12-01.1", "2026-11-30.9")
    assert not self_update.is_newer("2026-11-16.3 (other words)", "2026-11-16.3 (auto update)")
    assert not self_update.is_newer(None, runner.WORKER_VERSION)


def test_idle_supervised_worker_stops_to_update(monkeypatch):
    from karaokesync.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "worker_poll_seconds", 0)
    monkeypatch.setattr(runner, "get_settings", lambda: settings)
    monkeypatch.setattr(runner, "SupabaseClient", lambda s: object())
    monkeypatch.setattr(runner, "Presence", lambda *a: type("P", (), {
        "paused": type("E", (), {"is_set": lambda self: False})(), "start": lambda self: None,
        "stop": lambda self: None, "set_activity": lambda self, k: None})())
    monkeypatch.setattr(runner, "run_retention", lambda sb, s: None)
    monkeypatch.setattr(runner, "process_one", lambda *a: False)   # nothing to do: idle
    monkeypatch.setattr(runner.gpu, "summary", lambda: [])
    monkeypatch.setattr(runner.gpu, "torch_gpu", lambda: None)
    monkeypatch.setattr(runner.gpu, "whisper_gpus", lambda: [])
    monkeypatch.setattr(runner.signal, "signal", lambda *a: None)
    monkeypatch.setattr(self_update, "latest_version", lambda: "2099-01-01.1 (future)")
    monkeypatch.setenv("KARAOKESYNC_SUPERVISED", "1")
    monkeypatch.delenv("KARAOKESYNC_JUST_UPDATED", raising=False)
    with pytest.raises(SystemExit) as stop:
        runner.main()
    assert stop.value.code == self_update.UPDATE_EXIT_CODE


def test_the_windows_scripts_update_and_restart():
    forever = (ROOT / "scripts/windows/worker-forever.bat").read_bytes()
    update = (ROOT / "scripts/windows/9-update-worker.bat").read_bytes()
    assert b"\r\n" in forever and b"\r\n" in update            # Windows line ends
    assert b"KARAOKESYNC_SUPERVISED=1" in forever and b"if errorlevel 3 goto update" in forever
    assert b'ks-update-worker.bat" auto' in forever           # a copy runs the update
    assert b"/XF .env worker-forever.bat" in update and b"requirements-ai.txt" in update
