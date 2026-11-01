from tests.conftest import login, noa_exhibit


def test_case_crud_and_validation(client, noa):
    r = client.post("/api/cases", headers=noa, json={"reference": "", "title": "x"})
    assert r.status_code == 422
    assert "מספר תיק" in r.json()["detail"]

    r = client.post("/api/cases", headers=noa, json={"reference": "7001/25", "title": "תיק בדיקה", "priority": "high"})
    assert r.status_code == 201, r.text
    case = r.json()
    assert case["assigned_to"]["full_name"].startswith("נועה")
    assert client.post("/api/cases", headers=noa, json={"reference": "7001/25", "title": "כפול"}).status_code == 409

    r = client.patch(f"/api/cases/{case['id']}", headers=noa, json={"status": "in_progress", "notes": "עודכן"})
    assert r.json()["status"] == "in_progress"
    found = client.get("/api/cases", headers=noa, params={"q": "7001"}).json()
    assert [c["reference"] for c in found] == ["7001/25"]

    ex = client.post(f"/api/cases/{case['id']}/exhibits", headers=noa,
                     json={"identifier": "001", "label": "כונן בדיקה", "exhibit_type": "removable"})
    assert ex.status_code == 201, ex.text
    custody = client.get(f"/api/exhibits/{ex.json()['id']}/custody", headers=noa).json()
    assert custody[0]["event_type"] == "received"

    assert client.post(f"/api/cases/{case['id']}/archive", headers=noa).json()["status"] == "archived"
    assert all(c["id"] != case["id"] for c in client.get("/api/cases", headers=noa).json())
    assert client.patch(f"/api/cases/{case['id']}", headers=noa, json={"notes": "x"}).status_code == 409


def test_investigator_cannot_edit_others_case(client):
    yoav = login(client, "yoav", "Invest!2025")
    cases = client.get("/api/cases", headers=yoav).json()
    noas = next(c for c in cases if c["assigned_to"] and c["assigned_to"]["full_name"].startswith("נועה"))
    assert client.patch(f"/api/cases/{noas['id']}", headers=yoav, json={"notes": "x"}).status_code == 403


def test_dashboard_metrics_from_db(client, admin):
    d = client.get("/api/dashboard", headers=admin).json()
    cases = [c for c in client.get("/api/cases", headers=admin).json()
             if c["status"] in ("open", "in_progress", "pending_review")]
    assert d["kpis"]["open_cases"] == len(cases)
    assert d["kpis"]["cameras"] == len(client.get("/api/cameras", headers=admin).json())


def test_camera_test_and_simulated_export_validation(client, noa):
    cams = client.get("/api/cameras", headers=noa).json()
    unauth = next(c for c in cams if not c["authorization_ref"])
    r = client.post(f"/api/cameras/{unauth['id']}/test", headers=noa)
    assert r.status_code == 200 and "סימולציה" in r.json()["last_test_result"]
    ex = noa_exhibit(client, noa)
    body = {"exhibit_id": ex["id"], "channels": [1], "start": "2025-01-25T22:00:00", "end": "2025-01-25T22:01:00",
            "authorization_ref": "צו 1", "credential_confirmed": True}
    assert client.post(f"/api/cameras/{unauth['id']}/export", headers=noa, json=body).status_code == 403
    authd = next(c for c in cams if c["authorization_ref"] and c["adapter"] == "simulated")
    bad = {**body, "credential_confirmed": False}
    assert client.post(f"/api/cameras/{authd['id']}/export", headers=noa, json=bad).status_code == 422
    bad = {**body, "channels": [99]}
    assert client.post(f"/api/cameras/{authd['id']}/export", headers=noa, json=bad).status_code == 422
