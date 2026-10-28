"""API tests: authentication, ownership (permissions), quotas, validation, idempotency."""

import pytest

from .conftest import make_audio, needs_ffmpeg

AUTH = {"Authorization": "Bearer alice-token"}


@pytest.fixture
def alice(fake_sb):
    return fake_sb.add_user("alice-token")


@pytest.fixture
def bob(fake_sb):
    return fake_sb.add_user("bob-token")


def init_upload(client, name="song.mp3", size=1000, mime="audio/mpeg", headers=AUTH):
    return client.post("/uploads", json={"file_name": name, "size_bytes": size, "mime_type": mime}, headers=headers)


# --------------------------------------------------------------------- auth
def test_health_is_public(client):
    assert client.get("/health").json() == {"ok": True}


def test_limits_are_public(client):
    body = client.get("/limits").json()
    assert body["allowed_extensions"] == ["mp3", "wav", "m4a"]
    assert body["max_upload_bytes"] > 0


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "Basic x"}])
def test_requires_valid_session(client, headers):
    resp = init_upload(client, headers=headers)
    assert resp.status_code == 401


# ------------------------------------------------------------ upload init
def test_init_upload_creates_private_path(client, fake_sb, alice):
    resp = init_upload(client)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    path = fake_sb.signed_upload_paths[0]
    assert path.startswith(f"{alice.id}/{body['project_id']}/")
    assert path.endswith(".mp3")
    assert body["content_type"] == "audio/mpeg"
    assert fake_sb.tables["projects"][0]["title"] == "song"


@pytest.mark.parametrize("name,mime,code", [
    ("song.exe", "audio/mpeg", 415),
    ("song", "audio/mpeg", 415),
    ("song.mp3", "video/mp4", 415),
])
def test_init_upload_rejects_bad_types(client, alice, name, mime, code):
    assert init_upload(client, name=name, mime=mime).status_code == code


def test_init_upload_rejects_large_files(client, alice):
    resp = init_upload(client, size=10 * 1024 * 1024 * 1024)
    assert resp.status_code == 413
    assert resp.json()["detail"] == "file_too_large"


def test_daily_upload_quota(client, fake_sb, alice, monkeypatch):
    from karaokesync.config import get_settings

    monkeypatch.setattr(get_settings(), "max_uploads_per_day", 2)
    assert init_upload(client).status_code == 201
    assert init_upload(client).status_code == 201
    resp = init_upload(client)
    assert resp.status_code == 429
    assert resp.json()["detail"] == "daily_upload_limit"


# --------------------------------------------------------- ownership checks
def test_cannot_complete_someone_elses_upload(client, alice, bob):
    project_id = init_upload(client).json()["project_id"]
    resp = client.post(f"/uploads/{project_id}/complete", headers={"Authorization": "Bearer bob-token"})
    assert resp.status_code == 404


def test_cannot_delete_someone_elses_project(client, fake_sb, alice, bob):
    project_id = init_upload(client).json()["project_id"]
    resp = client.delete(f"/projects/{project_id}", headers={"Authorization": "Bearer bob-token"})
    assert resp.status_code == 404
    assert len(fake_sb.tables["projects"]) == 1


def test_invalid_project_id_is_404(client, alice):
    assert client.post("/uploads/not-a-uuid/complete", headers=AUTH).status_code == 404


# ------------------------------------------------------ upload completion
def test_complete_before_upload_is_conflict(client, alice):
    project_id = init_upload(client).json()["project_id"]
    resp = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "upload_missing"


@needs_ffmpeg
@pytest.mark.parametrize("ext", ["mp3", "wav", "m4a"])
def test_complete_verifies_and_enqueues_once(client, fake_sb, alice, tmp_path, ext):
    project_id = init_upload(client, name=f"song.{ext}", mime="").json()["project_id"]
    fake_sb.put_object("audio", fake_sb.signed_upload_paths[0], make_audio(tmp_path, ext, 2))

    first = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "queued"
    assert 1900 <= first.json()["duration_ms"] <= 2200

    # A second call (double click / network retry) must not create a second job.
    second = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert second.status_code == 200
    assert second.json()["job_id"] == first.json()["job_id"]
    assert len(fake_sb.tables["processing_jobs"]) == 1


@needs_ffmpeg
def test_complete_rejects_fake_audio_and_deletes_it(client, fake_sb, alice, tmp_path):
    project_id = init_upload(client).json()["project_id"]
    fake = tmp_path / "evil.mp3"
    fake.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 500)
    path = fake_sb.signed_upload_paths[0]
    fake_sb.put_object("audio", path, fake)

    resp = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert resp.json() == {"project_id": project_id, "status": "failed", "job_id": None,
                           "duration_ms": None, "error_code": "not_audio"}
    assert path not in fake_sb.objects["audio"]
    assert fake_sb.tables["processing_jobs"] == []


@needs_ffmpeg
def test_complete_rejects_extension_mismatch(client, fake_sb, alice, tmp_path):
    project_id = init_upload(client, name="song.mp3").json()["project_id"]
    fake_sb.put_object("audio", fake_sb.signed_upload_paths[0], make_audio(tmp_path, "wav"))
    # The content (WAV) does not match the declared type (MP3): rejected.
    resp = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert resp.json()["error_code"] == "format_mismatch"
    assert fake_sb.objects["audio"] == {}


@needs_ffmpeg
def test_complete_rejects_too_long_audio(client, fake_sb, alice, tmp_path, monkeypatch):
    from karaokesync.config import get_settings

    monkeypatch.setattr(get_settings(), "max_audio_duration_seconds", 1)
    project_id = init_upload(client, name="song.wav").json()["project_id"]
    fake_sb.put_object("audio", fake_sb.signed_upload_paths[0], make_audio(tmp_path, "wav", 3))
    resp = client.post(f"/uploads/{project_id}/complete", headers=AUTH)
    assert resp.json()["error_code"] == "too_long"


# ------------------------------------------------------------ retry/delete
@needs_ffmpeg
def test_retry_only_after_failure(client, fake_sb, alice, tmp_path):
    project_id = init_upload(client, name="song.wav").json()["project_id"]
    fake_sb.put_object("audio", fake_sb.signed_upload_paths[0], make_audio(tmp_path, "wav"))
    job_id = client.post(f"/uploads/{project_id}/complete", headers=AUTH).json()["job_id"]

    # While a job is active, retry returns the same job.
    assert client.post(f"/projects/{project_id}/retry", headers=AUTH).json()["job_id"] == job_id

    # Simulate the worker failing permanently.
    fake_sb.update("processing_jobs", {"id": f"eq.{job_id}"}, {"status": "failed"})
    fake_sb.update("projects", {"id": f"eq.{project_id}"}, {"status": "failed"})
    resp = client.post(f"/projects/{project_id}/retry", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["job_id"] != job_id
    assert resp.json()["status"] == "queued"


def test_delete_removes_files_and_rows(client, fake_sb, alice, tmp_path):
    project_id = init_upload(client).json()["project_id"]
    path = fake_sb.signed_upload_paths[0]
    fake_sb.put_object("audio", path, tmp_path / "x")
    assert client.delete(f"/projects/{project_id}", headers=AUTH).status_code == 204
    assert fake_sb.objects["audio"] == {}
    assert fake_sb.tables["projects"] == []
    assert fake_sb.tables["audio_files"] == []
