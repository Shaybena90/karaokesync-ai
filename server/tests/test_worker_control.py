"""Processing server status for users, remote pause for the owner, worker check-ins."""

from datetime import datetime, timedelta, timezone

import pytest

from karaokesync.supabase_client import SupabaseError
from karaokesync.worker import runner

OWNER = {"Authorization": "Bearer owner-token"}
USER = {"Authorization": "Bearer user-token"}


@pytest.fixture
def setup(fake_sb, monkeypatch):
    from karaokesync.config import get_settings

    fake_sb.add_user("owner-token")
    fake_sb.add_user("user-token")
    monkeypatch.setattr(get_settings(), "admin_emails", " Owner-Token@example.com , other@example.com")
    now = datetime.now(timezone.utc)
    fake_sb.tables["workers"] += [
        {"id": "gpu-pc-1", "last_seen": (now - timedelta(seconds=10)).isoformat(), "device": "GPU (NVIDIA RTX A5000)",
         "activity": "processing", "version": "v", "started_at": now.isoformat()},
        {"id": "old-pc-2", "last_seen": (now - timedelta(minutes=10)).isoformat(), "device": "CPU", "activity": "idle",
         "version": "v", "started_at": now.isoformat()},
    ]
    return fake_sb


def test_users_see_only_whether_processing_is_online(client, setup):
    body = client.get("/worker-status", headers=USER).json()
    assert body == {"available": True, "online": True, "paused": False, "admin": False}


def test_the_owner_sees_the_servers(client, setup):
    body = client.get("/worker-status", headers=OWNER).json()
    assert body["admin"] is True
    assert [(w["id"], w["online"]) for w in body["workers"]] == [("gpu-pc-1", True), ("old-pc-2", False)]
    assert body["workers"][0]["device"] == "GPU (NVIDIA RTX A5000)"


def test_a_stopped_worker_is_offline(client, setup):
    setup.tables["workers"][0]["activity"] = "stopped"
    assert client.get("/worker-status", headers=USER).json()["online"] is False


def test_only_the_owner_can_pause(client, setup):
    assert client.post("/worker-status", json={"paused": True}, headers=USER).status_code == 403
    assert client.post("/worker-status", json={"paused": True}).status_code == 401
    assert client.post("/worker-status", json={"paused": True}, headers=OWNER).json() == {"paused": True}
    assert setup.tables["worker_control"][0]["paused"] is True
    assert client.get("/worker-status", headers=USER).json()["paused"] is True


def test_before_the_sql_file_is_run(client, fake_sb, monkeypatch):
    fake_sb.add_user("user-token")
    monkeypatch.setattr(fake_sb, "select", lambda table, params: (_ for _ in ()).throw(SupabaseError(404, "missing")))
    assert client.get("/worker-status", headers=USER).json()["available"] is False


# ------------------------------------------------------------------ worker
class CheckinDb:
    def __init__(self, paused=False, missing=False):
        self.paused, self.missing, self.calls = paused, missing, []

    def rpc(self, fn, args):
        self.calls.append((fn, args))
        if self.missing:
            raise SupabaseError(404, "no function")
        return self.paused


def test_presence_reports_activity_and_follows_the_pause():
    db = CheckinDb()
    p = runner.Presence(db, "pc", "v", "GPU (RTX)")
    p.check_in()
    assert not p.paused.is_set()
    p.set_activity("processing")
    assert db.calls[-1][1] == {"p_worker_id": "pc", "p_version": "v", "p_device": "GPU (RTX)", "p_activity": "processing"}
    db.paused = True
    p.check_in()
    assert p.paused.is_set()
    db.paused = False
    p.check_in()
    assert not p.paused.is_set()


def test_presence_turns_itself_off_without_the_sql_file():
    db = CheckinDb(missing=True)
    p = runner.Presence(db, "pc", "v", "CPU")
    p.check_in()
    p.check_in()
    assert len(db.calls) == 1 and p.available is False and not p.paused.is_set()


def test_jobs_report_their_kind_and_back_to_idle(monkeypatch):
    from karaokesync.config import get_settings

    class OneExport:
        def rpc(self, fn, args):
            return [{"id": "e1"}] if fn == "claim_export_job" else []

    monkeypatch.setattr(runner, "_unavailable", set())
    seen: list[str] = []
    monkeypatch.setattr(runner, "_run_export", lambda *a: seen.append("running"))
    assert runner.process_one(OneExport(), get_settings(), "w", seen.append) is True
    assert seen == ["export", "running", "idle"]
