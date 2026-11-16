"""Local HTTP API + static Hebrew UI. Run: python -m vsearch (binds to 127.0.0.1 by default)."""
from __future__ import annotations

import csv
import io
import re
import shutil
import uuid
from pathlib import Path

import cv2
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .attributes import COLOR_VERSION, COLORS_HE, UnavailableMakeClassifier
from .config import Settings
from .detection import TYPES_HE, load_detector
from .jobs import JobRunner
from .media import MediaError, export_clip, frame_at, probe, sha256_file
from .pipeline import evaluate
from .query import MAKES, normalize_fields, parse_query
from .regions import RULE_ID, RULE_TEXT_HE, Region, RegionError
from .store import Store

STATIC = Path(__file__).parent / "static"


class Engines:
    def __init__(self, s: Settings, detector=None, make_clf=None):
        self.detector = detector or load_detector(s.detector_weights, s.detector_imgsz, s.detector_conf, s.device)
        self.make_clf = make_clf or UnavailableMakeClassifier()

    def describe(self):
        d, m = self.detector, self.make_clf
        return {
            "detector": {"available": d.available, "name": d.name, "version": d.version, "reason": d.unavailable_reason},
            "make_classifier": {"available": m.available, "name": m.name, "version": m.version, "reason": m.unavailable_reason},
            "color": {"available": True, "version": COLOR_VERSION},
            "plates": {"available": False, "reason": "קריאת לוחיות שייכת לשלב מאוחר יותר ואינה ממומשת"},
            "multi_camera": {"available": False, "reason": "קישור בין מצלמות שייך לשלב מאוחר יותר ואינו ממומש"},
        }


class AddSource(BaseModel):
    path: str
    camera: str | None = None


class ParseReq(BaseModel):
    text: str


class JobReq(BaseModel):
    source_id: str
    region: dict
    fields: dict = Field(default_factory=dict)
    start: float = 0.0
    end: float | None = None
    rate: float | None = 10.0


class DecisionReq(BaseModel):
    decision: str | None = None  # "approved" | "rejected" | None
    note: str | None = None


class ClipReq(BaseModel):
    before: float = 3.0
    after: float = 3.0


def create_app(settings: Settings | None = None, engines: Engines | None = None) -> FastAPI:
    s = settings or Settings()
    s.ensure_dirs()
    store = Store(s.db_path, s.thumbs_dir)
    store.mark_interrupted_jobs()
    eng = engines or Engines(s)
    runner = JobRunner(store, eng)
    app = FastAPI(title="video-search", version=__version__)
    app.state.store, app.state.engines, app.state.runner = store, eng, runner

    def src_or_404(sid):
        src = store.get_source(sid)
        if not src:
            raise HTTPException(404, "המקור לא נמצא")
        return src

    def job_or_404(jid):
        j = store.get_job(jid)
        if not j:
            raise HTTPException(404, "המשימה לא נמצאה")
        return j

    def add(path: Path, camera=None):
        try:
            info = probe(path)
        except MediaError as e:
            raise HTTPException(422, str(e))
        return store.add_source(info["path"], sha256_file(path), info, camera)

    @app.get("/api/status")
    def status():
        return {"version": __version__, "engines": eng.describe(), "region_rule": {"id": RULE_ID, "text": RULE_TEXT_HE},
                "types": TYPES_HE, "colors": COLORS_HE, "makes": sorted(MAKES),
                "processing": "local", "note": "כל העיבוד נעשה במחשב זה. שום קובץ אינו נשלח לשירות חיצוני."}

    @app.post("/api/sources")
    def add_source(req: AddSource):
        p = Path(req.path.strip().strip('"')).expanduser()
        return add(p, req.camera)

    @app.post("/api/sources/upload")
    def upload(file: UploadFile = File(...)):
        name = re.sub(r"[^\w.\-]+", "_", Path(file.filename or "video").name)[-120:]
        dst = s.uploads_dir / f"{uuid.uuid4().hex[:8]}_{name}"
        with open(dst, "wb") as f:
            shutil.copyfileobj(file.file, f, 4 * 1024 * 1024)
        try:
            return add(dst)
        except HTTPException:
            dst.unlink(missing_ok=True)
            raise

    @app.get("/api/sources")
    def sources():
        return store.list_sources()

    @app.get("/api/sources/{sid}")
    def source(sid: str):
        return src_or_404(sid)

    @app.get("/api/sources/{sid}/video")
    def video(sid: str):
        src = src_or_404(sid)
        return FileResponse(src["path"], media_type="video/mp4" if src["path"].lower().endswith((".mp4", ".m4v", ".mov")) else None)

    @app.get("/api/sources/{sid}/frame")
    def frame(sid: str, t: float = 0.0):
        """Decoded frame at media time t — used when the browser cannot play the codec, and for checks."""
        src = src_or_404(sid)
        try:
            ft, img = frame_at(Path(src["path"]), t)
        except MediaError as e:
            raise HTTPException(422, str(e))
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return Response(buf.tobytes(), media_type="image/jpeg", headers={"X-Frame-Time": f"{ft:.6f}"})

    @app.post("/api/query/parse")
    def parse(req: ParseReq):
        return parse_query(req.text)

    @app.post("/api/jobs")
    def create_job(req: JobReq):
        src = src_or_404(req.source_id)
        if not eng.detector.available:
            raise HTTPException(503, "מודל הזיהוי אינו זמין: " + (eng.detector.unavailable_reason or ""))
        try:
            region = Region.from_json(req.region)
        except RegionError as e:
            raise HTTPException(422, str(e))
        dur = src["probe"].get("duration")
        start = max(0.0, req.start)
        end = req.end if req.end is not None else dur
        if end is not None and end <= start:
            raise HTTPException(422, "טווח הזמן אינו תקין")
        if req.rate is not None and req.rate <= 0:
            raise HTTPException(422, "קצב הניתוח אינו תקין")
        fields = normalize_fields(req.fields)
        models = eng.describe()
        jid = store.create_job(src["id"], region.to_json(), fields,
                               {"start": start, "end": end, "rate": req.rate}, models)
        runner.submit(jid)
        return store.get_job(jid)

    @app.get("/api/jobs")
    def jobs(source_id: str | None = None):
        return store.list_jobs(source_id)

    @app.get("/api/jobs/{jid}")
    def job(jid: str):
        return job_or_404(jid)

    @app.post("/api/jobs/{jid}/cancel")
    def cancel(jid: str):
        job_or_404(jid)
        runner.cancel(jid)
        return store.get_job(jid)

    def results_for(jid: str, fields: dict | None):
        j = job_or_404(jid)
        f = normalize_fields(fields) if fields is not None else j["fields"]
        out = {"match": [], "candidate": [], "excluded": []}
        for t in store.get_tracks(jid):
            ev = evaluate(t, f)
            t["evaluation"] = ev
            out[ev["category"]].append(t)
        return {"job": j, "fields": f, "results": out,
                "counts": {k: len(v) for k, v in out.items()}}

    @app.get("/api/jobs/{jid}/results")
    def results(jid: str):
        return results_for(jid, None)

    @app.post("/api/jobs/{jid}/results")
    def results_with_fields(jid: str, fields: dict):
        """Re-apply corrected fields to stored attributes without re-processing."""
        return results_for(jid, fields)

    @app.post("/api/tracks/{tid}/decision")
    def decision(tid: str, req: DecisionReq):
        if not store.get_track(tid):
            raise HTTPException(404, "התוצאה לא נמצאה")
        if req.decision not in (None, "approved", "rejected"):
            raise HTTPException(422, "החלטה לא תקינה")
        store.set_decision(tid, req.decision, req.note)
        return store.get_track(tid)

    @app.post("/api/tracks/{tid}/clip")
    def clip(tid: str, req: ClipReq):
        t = store.get_track(tid)
        if not t:
            raise HTTPException(404, "התוצאה לא נמצאה")
        src = src_or_404(t["source_id"])
        a = max(0.0, t["t_first"] - max(0.0, req.before))
        b = t["t_last"] + max(0.0, req.after)
        dur = src["probe"].get("duration")
        if dur:
            b = min(b, dur)
        name = f"{Path(src['path']).stem}_track{t['track_no']}_{a:.2f}-{b:.2f}.mp4"
        dst = s.exports_dir / t["job_id"] / name
        try:
            export_clip(Path(src["path"]), dst, a, b)
        except MediaError as e:
            raise HTTPException(500, str(e))
        return {"file": f"/api/exports/{t['job_id']}/{name}", "source_start": a, "source_end": b,
                "source_path": src["path"], "source_sha256": src["sha256"]}

    @app.get("/api/exports/{jid}/{name}")
    def export_file(jid: str, name: str):
        p = (s.exports_dir / jid / name).resolve()
        if not str(p).startswith(str(s.exports_dir.resolve())) or not p.is_file():
            raise HTTPException(404)
        return FileResponse(p, filename=name)

    @app.get("/api/thumbs/{jid}/{name}")
    def thumb(jid: str, name: str):
        p = (s.thumbs_dir / jid / name).resolve()
        if not str(p).startswith(str(s.thumbs_dir.resolve())) or not p.is_file():
            raise HTTPException(404)
        return FileResponse(p, media_type="image/jpeg")

    @app.get("/api/jobs/{jid}/export.json")
    def export_json(jid: str):
        r = results_for(jid, None)
        src = store.get_source(r["job"]["source_id"])
        payload = {"source": {"id": src["id"], "path": src["path"], "sha256": src["sha256"], "probe": src["probe"]},
                   **r, "time_reference": "זמני מדיה בשניות מתחילת הקובץ"}
        return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="results_{jid}.json"'})

    @app.get("/api/jobs/{jid}/export.csv")
    def export_csv(jid: str):
        r = results_for(jid, None)
        src = store.get_source(r["job"]["source_id"])
        buf = io.StringIO()
        buf.write("﻿")  # Excel-friendly UTF-8 (Hebrew)
        w = csv.writer(buf)
        w.writerow(["קטגוריה", "מזהה", "מסלול", "סוג", "כניסה לאזור (שניות)", "יציאה מהאזור (שניות)",
                    "תחילת מסלול", "סוף מסלול", "צבע", "מצב צבע", "יצרן", "מצב יצרן", "בדיקה ידנית", "הערה",
                    "קובץ מקור", "SHA-256"])
        names = {"match": "מתאים", "candidate": "מועמד לבדיקה", "excluded": "לא מתאים"}
        for cat, items in r["results"].items():
            for t in items:
                c, m = t.get("color") or {}, t.get("make") or {}
                w.writerow([names[cat], t["id"], t["track_no"], TYPES_HE.get(t["obj_type"], t["obj_type"]),
                            f"{t['t_in_first']:.3f}", f"{t['t_in_last']:.3f}", f"{t['t_first']:.3f}", f"{t['t_last']:.3f}",
                            COLORS_HE.get(c.get("value"), c.get("value") or ""), c.get("status", ""),
                            m.get("value") or "", m.get("status", ""), t.get("decision") or "", t.get("note") or "",
                            src["path"], src["sha256"]])
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                                 headers={"Content-Disposition": f'attachment; filename="results_{jid}.csv"'})

    app.mount("/", StaticFiles(directory=STATIC, html=True), name="ui")
    return app
