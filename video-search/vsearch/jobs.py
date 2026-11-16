"""Background job runner: one search at a time, progress in media time, cancellation."""
from __future__ import annotations

import queue
import threading
import time
import traceback
from pathlib import Path

from .media import MediaError
from .pipeline import Cancelled, SearchParams, run_search
from .regions import Region


class JobRunner:
    def __init__(self, store, engines):
        self.store = store
        self.engines = engines  # object with .detector and .make_clf
        self._q: queue.Queue[str] = queue.Queue()
        self._cancel: dict[str, threading.Event] = {}
        self._t = threading.Thread(target=self._loop, daemon=True, name="vsearch-jobs")
        self._t.start()

    def submit(self, job_id: str):
        self._cancel[job_id] = threading.Event()
        self._q.put(job_id)

    def cancel(self, job_id: str) -> bool:
        ev = self._cancel.get(job_id)
        if not ev:
            return False
        ev.set()
        j = self.store.get_job(job_id)
        if j and j["status"] == "queued":
            self.store.update_job(job_id, status="cancelled", finished_at=time.time())
        return True

    def _loop(self):
        while True:
            jid = self._q.get()
            try:
                self._run(jid)
            except Exception:  # never kill the worker thread
                self.store.update_job(jid, status="failed", error=traceback.format_exc()[-1500:], finished_at=time.time())

    def _run(self, jid: str):
        job = self.store.get_job(jid)
        ev = self._cancel.get(jid) or threading.Event()
        if not job or job["status"] != "queued" or ev.is_set():
            return
        src = self.store.get_source(job["source_id"])
        det = self.engines.detector
        if not det.available:
            self.store.update_job(jid, status="failed", error="מודל הזיהוי אינו זמין: " + (det.unavailable_reason or ""),
                                  finished_at=time.time())
            return
        p = Path(src["path"])
        if not p.is_file():
            self.store.update_job(jid, status="failed", error="קובץ המקור לא נמצא", finished_at=time.time())
            return
        st = p.stat()
        if st.st_size != src["probe"]["size_bytes"] or abs(st.st_mtime - src["probe"]["mtime"]) > 1:
            self.store.update_job(jid, status="failed", finished_at=time.time(),
                                  error="קובץ המקור השתנה מאז שנבחר (גודל או זמן שינוי). יש להוסיף אותו מחדש.")
            return

        params = SearchParams(**job["params"])
        region = Region.from_json(job["region"])
        self.store.update_job(jid, status="running", started_at=time.time())
        last = [0.0]

        def prog(t, counters):
            now = time.time()
            if now - last[0] > 0.5:
                last[0] = now
                self.store.update_job(jid, progress_time=t, progress=counters)

        try:
            records, coverage = run_search(p, region, params, det, self.engines.make_clf,
                                           on_progress=prog, should_cancel=ev.is_set)
            status = "completed"
        except Cancelled as c:
            records, coverage, status = c.records, c.coverage, "cancelled"
        except MediaError as e:
            self.store.update_job(jid, status="failed", error=str(e), finished_at=time.time())
            return
        self.store.save_tracks(jid, src["id"], records)
        self.store.update_job(jid, status=status, coverage=coverage, finished_at=time.time(),
                              progress_time=coverage.get("processed_end"),
                              progress={"frames_decoded": coverage["frames_decoded"],
                                        "frames_analysed": coverage["frames_analysed"]})
