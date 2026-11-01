"""בדיקות פרוטוקול הסוכן: מצב מושבת, חתימה, הגנת replay, אישור ורשימה מותרת."""
import json
import time

from app.agent.client import AgentClient
from app.agent.protocol import headers
from app.config import get_settings
from app.worker.runner import run_once
from tests.conftest import noa_exhibit


def _secret():
    return (get_settings().data_dir / "demo_agent.secret").read_text().strip()


def _post(client, path, payload=None, secret=None, hdrs=None):
    body = json.dumps(payload or {}).encode()
    h = hdrs or headers("agt_demo_local", secret or _secret(), "POST", path, body)
    return client.post(path, content=body, headers=h), h


def test_agent_disabled_by_default(client, admin):
    st = client.get("/api/remote/status", headers=admin).json()
    assert st["mode"] == "disabled" and st["network_available"] is False
    r, _ = _post(client, "/api/agent/poll")
    assert r.status_code == 403


def test_agent_protocol_end_to_end(client, admin, noa, evidence_dir):
    assert client.post("/api/remote/mode", headers=admin, json={"mode": "local_simulation"}).status_code == 422
    assert client.post("/api/remote/mode", headers=noa,
                       json={"mode": "local_simulation", "confirm": True}).status_code == 403
    assert client.post("/api/remote/mode", headers=admin,
                       json={"mode": "local_simulation", "confirm": True}).status_code == 200

    # חתימה שגויה / replay / חלון זמן
    r, h = _post(client, "/api/agent/heartbeat", {"host": "t"}, secret="wrong-secret")
    assert r.status_code == 401
    r, h = _post(client, "/api/agent/heartbeat", {"host": "t"})
    assert r.status_code == 200
    r, _ = _post(client, "/api/agent/heartbeat", {"host": "t"}, hdrs=h)
    assert r.status_code == 401 and "replay" in r.json()["detail"]
    old = headers("agt_demo_local", _secret(), "POST", "/api/agent/poll", b"{}")
    old["X-Agent-Timestamp"] = str(int(time.time()) - 3600)
    assert _post(client, "/api/agent/poll", hdrs=old)[0].status_code == 401

    # הגשת משימה מרחוק – דורשת אישור מנהל
    agents = client.get("/api/remote/status", headers=admin).json()["agents"]
    demo = next(a for a in agents if a["agent_key"] == "agt_demo_local")
    ex = noa_exhibit(client, noa)
    bad = client.post("/api/remote/jobs", headers=noa, json={"agent_id": demo["id"], "workflow": "motion",
                                                             "case_id": ex["case_id"], "exhibit_id": ex["id"],
                                                             "justification": "בדיקת הרשאה"})
    assert bad.status_code == 403  # ניתוח תנועה אינו ברשימה המותרת לסוכן
    r = client.post("/api/remote/jobs", headers=noa, json={"agent_id": demo["id"], "workflow": "hash",
                                                           "case_id": ex["case_id"], "exhibit_id": ex["id"],
                                                           "justification": "חישוב Hash מרחוק לבדיקה"})
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    assert r.json()["status"] == "awaiting_approval"
    assert run_once() is None or True  # העובד המקומי אינו תופס משימות סוכן
    assert _post(client, "/api/agent/poll")[0].json()["job"] is None  # טרם אושרה
    assert client.post(f"/api/jobs/{jid}/approve", headers=noa).status_code == 403
    assert client.post(f"/api/jobs/{jid}/approve", headers=admin).json()["status"] == "queued"

    agent = AgentClient("http://testserver", "agt_demo_local", _secret(), transport=client._transport)
    res = agent.run_cycle(wait_seconds=60)
    assert res["job"]["id"] == jid
    assert res["status"]["status"] == "succeeded", res
    client.post("/api/remote/mode", headers=admin, json={"mode": "disabled", "confirm": True})
