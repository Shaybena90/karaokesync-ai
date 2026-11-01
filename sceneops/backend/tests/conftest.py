"""הגדרות בדיקה: מסד וסביבת אחסון זמניים ומבודדים."""
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="sceneops-test-"))
EVIDENCE = _TMP / "evidence"
EVIDENCE.mkdir()
os.environ.update({
    "SCENEOPS_DATA_DIR": str(_TMP / "data"),
    "SCENEOPS_STORAGE_ROOT": str(_TMP / "data" / "storage"),
    "SCENEOPS_INITIAL_SOURCE_ROOTS": str(EVIDENCE),
    "SCENEOPS_DEMO_MODE": "true",
    "SCENEOPS_DATABASE_URL": "",
})

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

HAS_FFMPEG = shutil.which("ffmpeg") is not None


@pytest.fixture(scope="session", autouse=True)
def _db():
    Base.metadata.create_all(engine)
    seed(with_media=False, with_jobs=False)
    yield
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def login(client, username="admin", password="Admin!2025"):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client)


@pytest.fixture(scope="session")
def noa(client):
    return login(client, "noa", "Invest!2025")


@pytest.fixture(scope="session")
def viewer(client):
    return login(client, "viewer", "Viewer!2025")


@pytest.fixture(scope="session")
def evidence_dir():
    d = EVIDENCE / "case_test" / "CAM02"
    d.mkdir(parents=True, exist_ok=True)
    (d.parent / "notes.txt").write_text("ראיה לדוגמה – בדיקה", encoding="utf-8")
    if HAS_FFMPEG:
        for name in ("CAM02_20250125_220000.mp4", "CAM02_20250125_220030.mp4"):
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                            "testsrc=size=320x180:rate=10:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            str(d / name)], check=True)
    else:
        (d / "CAM02_20250125_220000.mp4").write_bytes(os.urandom(200_000))
    return d.parent


def noa_exhibit(client, headers):
    cases = client.get("/api/cases", headers=headers, params={"q": "4581/25"}).json()
    return client.get(f"/api/cases/{cases[0]['id']}/exhibits", headers=headers).json()[0]
