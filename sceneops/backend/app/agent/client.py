"""לקוח סוכן SceneOps AI.

הסוכן מתחבר ל-API מקומי מאומת, מבקש משימות מרשימה מותרת בלבד ומפעיל אותן. אין בו
הרצת פקודות מעטפת, שליטה מרחוק בשולחן עבודה או גישה חופשית לקבצים.

הפעלה:  python -m app.agent --url http://127.0.0.1:8000 --key <AGENT_KEY> --secret-file <path>
"""
from __future__ import annotations

import argparse
import json
import logging
import socket
import time
from pathlib import Path

import httpx

from .protocol import headers

log = logging.getLogger("sceneops.agent")
VERSION = "0.1.0"


class AgentClient:
    def __init__(self, base_url: str, agent_key: str, secret: str, transport: httpx.BaseTransport | None = None):
        self.base = base_url.rstrip("/")
        self.key, self.secret = agent_key, secret
        self.http = httpx.Client(base_url=self.base, timeout=30, transport=transport, trust_env=False)

    def post(self, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload or {}).encode()
        r = self.http.post(path, content=body, headers=headers(self.key, self.secret, "POST", path, body))
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail")
            except ValueError:
                detail = r.text
            raise RuntimeError(f"{r.status_code}: {detail}")
        return r.json()

    def run_cycle(self, wait_seconds: float = 300) -> dict:
        """מחזור אחד: פעימת חיים, בקשת משימה, הפעלה ומעקב עד לסיום."""
        self.post("/api/agent/heartbeat", {"host": socket.gethostname(), "version": VERSION})
        job = self.post("/api/agent/poll").get("job")
        if not job:
            return {"job": None}
        log.info("agent claimed job #%s (%s)", job["id"], job["workflow"])
        self.post(f"/api/agent/jobs/{job['id']}/execute")
        deadline = time.time() + wait_seconds
        status = {}
        while time.time() < deadline:
            status = self.post(f"/api/agent/jobs/{job['id']}/status")
            if status["status"] in ("succeeded", "failed", "cancelled"):
                break
            time.sleep(1)
        return {"job": job, "status": status}


def main() -> None:
    ap = argparse.ArgumentParser(description="SceneOps AI agent (allowlisted jobs only)")
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--key", required=True)
    ap.add_argument("--secret-file", required=True)
    ap.add_argument("--interval", type=float, default=5)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    client = AgentClient(a.url, a.key, Path(a.secret_file).read_text(encoding="utf-8").strip())
    while True:
        try:
            res = client.run_cycle()
            if res["job"]:
                log.info("job #%s finished: %s", res["job"]["id"], res["status"].get("status"))
        except Exception as e:  # noqa: BLE001
            log.warning("agent cycle failed: %s", e)
        if a.once:
            break
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
