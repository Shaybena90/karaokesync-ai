import time

import pytest
from fastapi.testclient import TestClient

from vsearch.api import Engines, create_app
from vsearch.attributes import UnavailableMakeClassifier
from vsearch.config import Settings
from vsearch.detection import UnavailableDetector
from conftest import BrightBlobDetector

RIGHT_HALF = {"kind": "rect", "points": [[0.5, 0.0], [1.0, 1.0]]}


def make_client(tmp_path, detector):
    s = Settings(data_dir=tmp_path / "data", detector_weights=tmp_path / "none.pt")
    app = create_app(s, Engines(s, detector=detector, make_clf=UnavailableMakeClassifier()))
    return TestClient(app)


def wait(c, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = c.get(f"/api/jobs/{jid}").json()
        if j["status"] not in ("queued", "running"):
            return j
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_full_flow(tmp_path, moving_box_video):
    c = make_client(tmp_path, BrightBlobDetector())
    st = c.get("/api/status").json()
    assert st["engines"]["detector"]["available"] and not st["engines"]["make_classifier"]["available"]
    src = c.post("/api/sources", json={"path": str(moving_box_video)}).json()
    assert src["probe"]["width"] == 640 and len(src["sha256"]) == 64
    fields = c.post("/api/query/parse", json={"text": "רכבי קיה לבנים"}).json()
    job = c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF,
                                    "fields": fields, "rate": None}).json()
    j = wait(c, job["id"])
    assert j["status"] == "completed", j
    cov = j["coverage"]
    assert cov["frames_decoded"] == cov["frames_analysed"] == 60 and not cov["sampled"]
    assert cov["decode"]["error_count"] == 0
    r = c.get(f"/api/jobs/{job['id']}/results").json()
    # one pass, white, make not checked → a candidate, not a match and not dropped
    assert r["counts"] == {"match": 0, "candidate": 1, "excluded": 0}
    t = r["results"]["candidate"][0]
    assert t["color"]["value"] == "white" and t["make"]["status"] == "unavailable"
    # box centre crosses x=0.5 (320 px) when 20+9i+40 >= 320 → i = 29 → t = 1.45 s
    assert abs(t["t_in_first"] - 1.45) < 0.051 and abs(t["t_first"]) < 1e-6
    # re-apply corrected fields without re-processing: no make → match
    r2 = c.post(f"/api/jobs/{job['id']}/results", json={"types": ["passenger_car"], "colors": ["white"], "makes": []}).json()
    assert r2["counts"]["match"] == 1
    r3 = c.post(f"/api/jobs/{job['id']}/results", json={"types": ["passenger_car"], "colors": ["red"]}).json()
    assert r3["counts"]["excluded"] == 1
    # thumbnails, decision, exports
    assert c.get("/api/thumbs/" + t["images"]["context"]["file"]).status_code == 200
    d = c.post(f"/api/tracks/{t['id']}/decision", json={"decision": "approved", "note": "נבדק"}).json()
    assert d["decision"] == "approved"
    csv = c.get(f"/api/jobs/{job['id']}/export.csv").text
    assert "מועמד לבדיקה" in csv and src["sha256"] in csv
    clip = c.post(f"/api/tracks/{t['id']}/clip", json={"before": 1, "after": 1}).json()
    assert c.get(clip["file"]).status_code == 200


def test_sampled_scan_is_marked(tmp_path, moving_box_video):
    c = make_client(tmp_path, BrightBlobDetector())
    src = c.post("/api/sources", json={"path": str(moving_box_video)}).json()
    job = c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF,
                                    "fields": {"types": ["passenger_car"]}, "rate": 5}).json()
    j = wait(c, job["id"])
    cov = j["coverage"]
    assert cov["sampled"] and cov["frames_analysed"] == 15 and abs(cov["max_gap_between_analysed_frames"] - 0.2) < 1e-3


def test_cancel_reports_partial_coverage(tmp_path, moving_box_video):
    c = make_client(tmp_path, BrightBlobDetector(delay=0.05))
    src = c.post("/api/sources", json={"path": str(moving_box_video)}).json()
    job = c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF,
                                    "fields": {"types": ["passenger_car"]}, "rate": None}).json()
    time.sleep(0.6)
    c.post(f"/api/jobs/{job['id']}/cancel")
    j = wait(c, job["id"])
    assert j["status"] == "cancelled"
    assert j["coverage"]["cancelled"] and j["coverage"]["processed_end"] < 2.9


def test_detector_unavailable_refuses_jobs(tmp_path, moving_box_video):
    c = make_client(tmp_path, UnavailableDetector("אין משקולות"))
    src = c.post("/api/sources", json={"path": str(moving_box_video)}).json()
    r = c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF, "fields": {}})
    assert r.status_code == 503


def test_bad_inputs(tmp_path, moving_box_video):
    c = make_client(tmp_path, BrightBlobDetector())
    bad = tmp_path / "x.mp4"; bad.write_bytes(b"0" * 1000)
    assert c.post("/api/sources", json={"path": str(bad)}).status_code == 422
    src = c.post("/api/sources", json={"path": str(moving_box_video)}).json()
    assert c.post("/api/jobs", json={"source_id": src["id"], "region": {"points": [[0, 0], [1, 1]]}}).status_code == 422
    assert c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF, "start": 2, "end": 1}).status_code == 422


def test_changed_source_is_refused(tmp_path, moving_box_video):
    import shutil
    p = tmp_path / "copy.mp4"; shutil.copy(moving_box_video, p)
    c = make_client(tmp_path, BrightBlobDetector())
    src = c.post("/api/sources", json={"path": str(p)}).json()
    with open(p, "ab") as f:
        f.write(b"\0" * 10)
    job = c.post("/api/jobs", json={"source_id": src["id"], "region": RIGHT_HALF, "fields": {"types": ["passenger_car"]}}).json()
    j = wait(c, job["id"])
    assert j["status"] == "failed" and "השתנה" in j["error"]
