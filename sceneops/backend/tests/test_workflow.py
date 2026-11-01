"""בדיקות קצה לקצה: סריקה, Hash, עותק עבודה מאומת, מטא-דאטה, דוח – ללא שינוי המקור."""
import hashlib
from pathlib import Path

from sqlalchemy import select

from app.audit import verify_chain
from app.db import SessionLocal
from app.models import Job, JobStatus, StepStatus, WorkingCopy
from app.security import storage_path
from app.worker import queue
from app.worker.runner import run_job, run_once
from tests.conftest import HAS_FFMPEG, noa_exhibit


def _snapshot(d: Path) -> dict[str, tuple[str, float]]:
    return {str(p.relative_to(d)): (hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_mtime)
            for p in sorted(d.rglob("*")) if p.is_file()}


def _drain():
    while (job := run_once()) is not None:
        pass


def test_full_media_pipeline_preserves_source(client, noa, admin, evidence_dir):
    before = _snapshot(evidence_dir)
    ex = noa_exhibit(client, noa)
    src = client.post(f"/api/exhibits/{ex['id']}/sources", headers=noa,
                      json={"path": str(evidence_dir), "authorization_note": "צו בדיקה 1",
                            "confirm_authorized": True})
    assert src.status_code == 201, src.text
    sid = src.json()["id"]
    r = client.post("/api/jobs", headers=noa, json={"workflow": "full_media", "source_id": sid})
    assert r.status_code == 201, r.text
    job_id = r.json()["id"]
    assert client.post("/api/jobs", headers=noa, json={"workflow": "full_media", "source_id": sid}).status_code == 409
    _drain()

    job = client.get(f"/api/jobs/{job_id}", headers=noa).json()
    assert job["status"] == "succeeded", job
    assert job["progress"] == 100
    assert all(s["status"] == "succeeded" for s in job["steps"])
    assert job["logs"]

    media = client.get("/api/media", headers=noa, params={"source_id": sid}).json()
    assert len(media) == len(before)
    for m in media:
        src_file = evidence_dir / m["relative_path"]
        assert m["source_sha256"] == hashlib.sha256(src_file.read_bytes()).hexdigest()
        if m["size_bytes"]:
            assert m["working_copy"]["verified"] is True
            assert m["working_copy"]["sha256"] == m["source_sha256"]
    videos = [m for m in media if m["media_type"] == "video"]
    assert videos and all(v["camera_label"] == "CAM 02" for v in videos)
    if HAS_FFMPEG:
        assert videos[0]["duration_seconds"] and videos[0]["codec"] == "h264"
        assert videos[0]["working_copy"]["has_proxy"]
        r = client.get(f"/api/media/{videos[0]['id']}/file/thumbnail", headers=noa)
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        fr = client.post(f"/api/media/{videos[0]['id']}/frames", headers=noa, json={"at_seconds": 1.5})
        assert fr.status_code == 200, fr.text
        tl = client.get(f"/api/media/timeline/case/{ex['case_id']}", headers=noa).json()
        gaps = [f for f in tl["findings"] if f["kind"] == "gap"]
        assert gaps and gaps[0]["review_status"] == "candidate"

    with SessionLocal() as db:
        for wc in db.scalars(select(WorkingCopy)):
            assert storage_path(wc.path).exists()
        assert verify_chain(db) == (True, None)

    # המקור לא שונה כלל
    assert _snapshot(evidence_dir) == before

    custody = client.get(f"/api/exhibits/{ex['id']}/custody", headers=noa).json()
    kinds = {c["event_type"] for c in custody}
    assert {"hashed", "copied"} <= kinds

    reports = client.get("/api/reports", headers=noa, params={"case_id": ex["case_id"]}).json()
    assert reports and reports[0]["status"] == "draft"
    rid = reports[0]["id"]
    pdf = client.get(f"/api/reports/{rid}/download/1/pdf", headers=noa)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    docx = client.get(f"/api/reports/{rid}/download/1/docx", headers=noa)
    assert docx.status_code == 200 and docx.content[:2] == b"PK"

    # תהליך אישור: הוגש, החוקר שהפיק אינו יכול לאשר, מנהל מאשר
    assert client.post(f"/api/reports/{rid}/submit", headers=noa).json()["status"] == "in_review"
    assert client.post(f"/api/reports/{rid}/decision", headers=noa,
                       json={"decision": "approved"}).status_code == 403
    r = client.post(f"/api/reports/{rid}/decision", headers=admin, json={"decision": "approved", "comment": "נבדק"})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    detail = client.get(f"/api/reports/{rid}", headers=admin).json()
    assert detail["approvals"][0]["decision"] == "approved"

    # בדיקת שלמות תיק – עוברת
    r = client.post("/api/jobs", headers=noa, json={"workflow": "case_integrity", "case_id": ex["case_id"]})
    _drain()
    assert client.get(f"/api/jobs/{r.json()['id']}", headers=noa).json()["status"] == "succeeded"


def test_cancel_and_retry(client, noa, evidence_dir):
    ex = noa_exhibit(client, noa)
    r = client.post("/api/jobs", headers=noa, json={"workflow": "motion", "exhibit_id": ex["id"]})
    jid = r.json()["id"]
    assert client.post(f"/api/jobs/{jid}/cancel", headers=noa).json()["status"] == "cancelled"
    assert client.post(f"/api/jobs/{jid}/cancel", headers=noa).status_code == 409
    assert client.post(f"/api/jobs/{jid}/retry", headers=noa).json()["status"] == "queued"
    with SessionLocal() as db:
        job = queue.claim_next(db, "t")
        assert job.id == jid
        job.status = JobStatus.cancel_requested
        db.commit()
        run_job(db, job, "t")
        assert job.status == JobStatus.cancelled
        assert job.steps[0].status == StepStatus.cancelled


def test_exclusive_lock_prevents_concurrent_processing(client, noa):
    ex = noa_exhibit(client, noa)
    a = client.post("/api/jobs", headers=noa, json={"workflow": "hash", "exhibit_id": ex["id"]}).json()["id"]
    b = client.post("/api/jobs", headers=noa, json={"workflow": "index", "exhibit_id": ex["id"]}).json()["id"]
    with SessionLocal() as db:
        first = queue.claim_next(db, "w1")
        assert first.id == a
        assert queue.claim_next(db, "w2") is None  # אותו מוצג – חסום
        run_job(db, first, "w1")
        second = queue.claim_next(db, "w2")
        assert second.id == b
        run_job(db, second, "w2")


def test_state_machine_rejects_invalid_transition():
    import pytest
    job = Job(workflow="hash", title="x", status=JobStatus.succeeded)
    with pytest.raises(queue.InvalidTransition):
        queue.transition(job, JobStatus.running)
