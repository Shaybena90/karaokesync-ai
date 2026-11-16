"""Local SQLite store: sources, jobs, results (tracks) and the user's review decisions."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

import cv2

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, sha256 TEXT NOT NULL, probe TEXT NOT NULL,
  camera TEXT, added_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
  region TEXT NOT NULL, fields TEXT NOT NULL, params TEXT NOT NULL, models TEXT NOT NULL,
  status TEXT NOT NULL, progress_time REAL, progress TEXT, coverage TEXT, error TEXT,
  created_at REAL NOT NULL, started_at REAL, finished_at REAL
);
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), source_id TEXT NOT NULL,
  track_no INTEGER NOT NULL, obj_type TEXT NOT NULL, t_first REAL, t_last REAL,
  t_in_first REAL, t_in_last REAL, data TEXT NOT NULL, images TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_job ON tracks(job_id);
CREATE TABLE IF NOT EXISTS decisions (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id), decision TEXT, note TEXT, updated_at REAL NOT NULL
);
"""


def _j(v):
    return json.dumps(v, ensure_ascii=False)


class Store:
    def __init__(self, db_path: Path, thumbs_dir: Path):
        self.thumbs_dir = thumbs_dir
        self._lock = threading.RLock()
        self.db = sqlite3.connect(str(db_path), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.commit()

    # ---- sources
    def add_source(self, path: str, sha256: str, probe: dict, camera: str | None = None) -> dict:
        with self._lock:
            row = self.db.execute("SELECT id FROM sources WHERE path=? AND sha256=?", (path, sha256)).fetchone()
            if row:
                return self.get_source(row["id"])
            sid = uuid.uuid4().hex[:12]
            self.db.execute("INSERT INTO sources VALUES (?,?,?,?,?,?)",
                            (sid, path, sha256, _j(probe), camera, time.time()))
            self.db.commit()
            return self.get_source(sid)

    def get_source(self, sid: str) -> dict | None:
        with self._lock:
            r = self.db.execute("SELECT * FROM sources WHERE id=?", (sid,)).fetchone()
        if not r:
            return None
        d = dict(r)
        d["probe"] = json.loads(d["probe"])
        return d

    def list_sources(self) -> list[dict]:
        with self._lock:
            ids = [r["id"] for r in self.db.execute("SELECT id FROM sources ORDER BY added_at DESC")]
        return [self.get_source(i) for i in ids]

    # ---- jobs
    def create_job(self, source_id, region, fields, params, models) -> str:
        jid = uuid.uuid4().hex[:12]
        with self._lock:
            self.db.execute(
                "INSERT INTO jobs (id, source_id, region, fields, params, models, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (jid, source_id, _j(region), _j(fields), _j(params), _j(models), "queued", time.time()))
            self.db.commit()
        return jid

    def update_job(self, jid, **kw):
        cols, vals = [], []
        for k, v in kw.items():
            cols.append(f"{k}=?")
            vals.append(_j(v) if isinstance(v, (dict, list)) else v)
        with self._lock:
            self.db.execute(f"UPDATE jobs SET {', '.join(cols)} WHERE id=?", (*vals, jid))
            self.db.commit()

    def get_job(self, jid) -> dict | None:
        with self._lock:
            r = self.db.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
        if not r:
            return None
        d = dict(r)
        for k in ("region", "fields", "params", "models", "progress", "coverage"):
            if d.get(k):
                d[k] = json.loads(d[k])
        return d

    def list_jobs(self, source_id=None) -> list[dict]:
        q, a = "SELECT id FROM jobs", ()
        if source_id:
            q, a = q + " WHERE source_id=?", (source_id,)
        with self._lock:
            ids = [r["id"] for r in self.db.execute(q + " ORDER BY created_at DESC", a)]
        return [self.get_job(i) for i in ids]

    def mark_interrupted_jobs(self):
        """Jobs left 'running' by a crash/restart are not silently resumed or shown as complete."""
        with self._lock:
            self.db.execute("UPDATE jobs SET status='interrupted', error='השירות נעצר באמצע העיבוד' "
                            "WHERE status IN ('running','queued')")
            self.db.commit()

    # ---- tracks
    def save_tracks(self, job_id: str, source_id: str, records: list[dict]):
        jdir = self.thumbs_dir / job_id
        jdir.mkdir(parents=True, exist_ok=True)
        with self._lock:
            for rec in records:
                tid = f"{job_id}-{rec['track_no']}"
                images = {"crops": [], "context": None}
                for i, (t, crop) in enumerate(rec.pop("_crops", [])):
                    name = f"{rec['track_no']}_crop{i}.jpg"
                    cv2.imwrite(str(jdir / name), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
                    images["crops"].append({"file": f"{job_id}/{name}", "t": t})
                ctx = rec.pop("_context", None)
                if ctx:
                    t, img, nb = ctx
                    img = img.copy()
                    h, w = img.shape[:2]
                    cv2.rectangle(img, (int(nb[0] * w), int(nb[1] * h)), (int(nb[2] * w), int(nb[3] * h)), (0, 200, 255), 2)
                    name = f"{rec['track_no']}_context.jpg"
                    cv2.imwrite(str(jdir / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
                    images["context"] = {"file": f"{job_id}/{name}", "t": t, "box": list(nb)}
                self.db.execute(
                    "INSERT OR REPLACE INTO tracks VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (tid, job_id, source_id, rec["track_no"], rec["obj_type"], rec["t_first"], rec["t_last"],
                     rec["t_in_first"], rec["t_in_last"], _j(rec), _j(images)))
            self.db.commit()

    def get_tracks(self, job_id: str) -> list[dict]:
        with self._lock:
            rows = self.db.execute(
                "SELECT t.*, d.decision, d.note FROM tracks t LEFT JOIN decisions d ON d.track_id=t.id "
                "WHERE job_id=? ORDER BY t_in_first", (job_id,)).fetchall()
        out = []
        for r in rows:
            d = json.loads(r["data"])
            d.update(id=r["id"], job_id=r["job_id"], source_id=r["source_id"], images=json.loads(r["images"]),
                     decision=r["decision"], note=r["note"])
            out.append(d)
        return out

    def get_track(self, track_id: str) -> dict | None:
        job_id = track_id.rsplit("-", 1)[0]
        for t in self.get_tracks(job_id):
            if t["id"] == track_id:
                return t
        return None

    def set_decision(self, track_id: str, decision: str | None, note: str | None):
        with self._lock:
            self.db.execute("INSERT INTO decisions VALUES (?,?,?,?) ON CONFLICT(track_id) DO UPDATE SET "
                            "decision=excluded.decision, note=excluded.note, updated_at=excluded.updated_at",
                            (track_id, decision, note, time.time()))
            self.db.commit()
