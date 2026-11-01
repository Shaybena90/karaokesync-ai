import os
from pathlib import Path

import pytest

from app.db import SessionLocal
from app.security import PathNotAuthorized, ensure_source_path, hash_password, storage_path, verify_password
from tests.conftest import EVIDENCE, noa_exhibit


def test_password_hashing():
    h = hash_password("Secret!123")
    assert h.startswith("pbkdf2_sha256$") and "Secret" not in h
    assert verify_password("Secret!123", h)
    assert not verify_password("wrong", h)
    assert not verify_password("x", "garbage")


def test_source_path_must_be_within_authorized_root(evidence_dir):
    with SessionLocal() as db:
        assert ensure_source_path(db, str(evidence_dir)) == Path(os.path.realpath(evidence_dir))
        for bad in (str(EVIDENCE / ".." / ".."), "/etc", "bad\x00path", ""):
            with pytest.raises(PathNotAuthorized):
                ensure_source_path(db, bad)


def test_storage_path_blocks_traversal():
    with pytest.raises(PathNotAuthorized):
        storage_path("../../etc/passwd")
    assert storage_path("cases/x/y.mp4").name == "y.mp4"


def test_protected_endpoints_require_auth(client):
    for url in ("/api/cases", "/api/dashboard", "/api/jobs", "/api/audit", "/api/media"):
        assert client.get(url).status_code == 401


def test_bad_login_hebrew_error(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401
    assert "שגויים" in r.json()["detail"]


def test_role_enforcement(client, viewer, noa):
    assert client.post("/api/cases", headers=viewer, json={"reference": "9999/25", "title": "בדיקה"}).status_code == 403
    assert client.get("/api/audit/verify", headers=noa).status_code == 403
    assert client.post("/api/settings/roots", headers=noa,
                       json={"path": "/tmp", "confirm_authorized": True}).status_code == 403


def test_browse_outside_root_forbidden(client, noa):
    assert client.get("/api/media/browse", params={"path": "/"}, headers=noa).status_code == 403


def test_source_registration_requires_explicit_authorization(client, noa, evidence_dir):
    ex = noa_exhibit(client, noa)
    r = client.post(f"/api/exhibits/{ex['id']}/sources", headers=noa,
                    json={"path": str(evidence_dir), "authorization_note": "צו", "confirm_authorized": False})
    assert r.status_code == 422
    assert "הרשאה" in r.json()["detail"]
    r = client.post(f"/api/exhibits/{ex['id']}/sources", headers=noa,
                    json={"path": "/etc", "authorization_note": "צו בדיקה", "confirm_authorized": True})
    assert r.status_code == 403


def test_secrets_not_logged_in_audit(client, admin):
    client.post("/api/users", headers=admin, json={"username": "tmpuser", "full_name": "משתמש זמני",
                                                    "password": "VerySecret!1", "role": "viewer"})
    rows = client.get("/api/audit", headers=admin, params={"action": "user."}).json()
    assert rows and all("VerySecret" not in str(r) for r in rows)
