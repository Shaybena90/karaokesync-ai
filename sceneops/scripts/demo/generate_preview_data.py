"""Generate demo data + snapshot of GET API responses for the static preview."""
import json, os, re, shutil, sys, urllib.parse
from pathlib import Path
OUT = Path("/tmp/claude-0/demo/out"); shutil.rmtree(OUT, ignore_errors=True); (OUT / "files").mkdir(parents=True)
D = Path("/tmp/claude-0/demo/data"); shutil.rmtree(D, ignore_errors=True)
os.environ.update({"SCENEOPS_DATA_DIR": str(D), "SCENEOPS_STORAGE_ROOT": str(D / "storage")})
sys.path.insert(0, "/home/user/karaokesync-ai/sceneops/backend")
from fastapi.testclient import TestClient
from app.db import Base, engine, SessionLocal
from app.main import app
from app.seed import seed
from app.worker.runner import run_once
from app.models import MediaFile, WorkingCopy, ReportRevision, Job
from app.security import storage_path
Base.metadata.create_all(engine); seed(with_media=True, with_jobs=True)
c = TestClient(app)
def tok(u, p): return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"username": u, "password": p}).json()["token"]}
A, N, Y = tok("admin", "Admin!2025"), tok("noa", "Invest!2025"), tok("yoav", "Invest!2025")
def drain():
    while run_once(): pass
drain()  # full_media 4581/25
cases = {x["reference"]: x for x in c.get("/api/cases", headers=A).json()}
ex79 = c.get(f"/api/cases/{cases['4579/25']['id']}/exhibits", headers=A).json()[0]
cams = {x["name"]: x for x in c.get("/api/cameras", headers=A).json()}
r = c.post(f"/api/cameras/{cams['NVR-07']['id']}/export", headers=Y, json={"exhibit_id": ex79["id"], "channels": [3, 4],
    "start": "2025-01-24T18:30:00", "end": "2025-01-24T18:31:00", "authorization_ref": "הרשאת בעל המערכת – טופס 12 (בדוי)", "credential_confirmed": True}); assert r.status_code == 200, r.text
drain()
c.post("/api/reports", headers=Y, json={"case_id": cases["4579/25"]["id"], "title": "דוח ייצוא הקלטות"}); drain()
c.post("/api/jobs", headers=N, json={"workflow": "case_integrity", "case_id": cases["4581/25"]["id"]}); drain()
# approve report 1
c.post("/api/reports/1/submit", headers=N); print(c.post("/api/reports/1/decision", headers=A, json={"decision": "approved", "comment": "נבדק מול עותקי העבודה – תקין"}).status_code)
# frames + finding reviews
vids = [m for m in c.get(f"/api/media?case_id={cases['4581/25']['id']}", headers=A).json() if m["media_type"] == "video"]
for t in (9.5, 12.0): c.post(f"/api/media/{vids[0]['id']}/frames", headers=N, json={"at_seconds": t})
fs = c.get(f"/api/media/findings/list?case_id={cases['4581/25']['id']}", headers=A).json()
mot = [f for f in fs if f["kind"] == "motion"]
if mot: c.patch(f"/api/media/findings/{mot[0]['id']}", headers=N, json={"review_status": "confirmed"})
# remote agent job
c.post("/api/remote/mode", headers=A, json={"mode": "local_simulation", "confirm": True})
ag = next(a for a in c.get("/api/remote/status", headers=A).json()["agents"] if a["agent_key"] == "agt_demo_local")
j = c.post("/api/remote/jobs", headers=N, json={"agent_id": ag["id"], "workflow": "index", "case_id": cases["4581/25"]["id"], "exhibit_id": vids[0]["exhibit_id"], "justification": "בניית אינדקס מתחנת המעבדה"}).json()
c.post(f"/api/jobs/{j['id']}/approve", headers=A)
from app.agent.client import AgentClient
AgentClient("http://testserver", "agt_demo_local", (D / "demo_agent.secret").read_text().strip(), transport=c._transport).run_cycle(60)
# a pending remote job awaiting approval
c.post("/api/remote/jobs", headers=Y, json={"agent_id": ag["id"], "workflow": "hash", "case_id": cases["4579/25"]["id"], "exhibit_id": ex79["id"], "justification": "חישוב Hash חוזר לבקשת התביעה (בדוי)"})
c.post("/api/cameras/%d/test" % cams["DVR-02"]["id"], headers=N)
from app.worker.runner import heartbeat
with SessionLocal() as db: heartbeat(db, "demo-worker")

# ---------------- snapshot
snap = {}
def get(path):
    r = c.get(path, headers=A)
    if r.status_code == 200: snap[path] = r.json()
    return r.json() if r.status_code == 200 else None
for p in ["/api/auth/me", "/api/dashboard", "/api/system/health", "/api/notifications/unread-count", "/api/cases?include_archived=true",
          "/api/workflows", "/api/cameras", "/api/users", "/api/jobs?limit=500", "/api/reports", "/api/remote/status", "/api/notifications",
          "/api/settings", "/api/settings/roots", "/api/audit?limit=1000", "/api/audit/verify", "/api/media/roots", "/api/media/drives", "/api/exhibits"]:
    get(p)
for cs in snap["/api/cases?include_archived=true"]:
    get(f"/api/cases/{cs['id']}"); get(f"/api/media/timeline/case/{cs['id']}"); get(f"/api/media/cameras?case_id={cs['id']}")
    for e in get(f"/api/cases/{cs['id']}/exhibits") or []: get(f"/api/exhibits/{e['id']}/custody")
media = get("/api/media?limit=2000")
for m in media: get(f"/api/media/{m['id']}/detail")
for jb in snap["/api/jobs?limit=500"]: get(f"/api/jobs/{jb['id']}")
for rp in snap["/api/reports"]: get(f"/api/reports/{rp['id']}")
def crawl(p):
    b = get("/api/media/browse?path=" + urllib.parse.quote(p, safe=""))
    if b:
        for d in b["dirs"]: crawl(d["path"])
for rt in snap["/api/media/roots"]: crawl(rt["path"])
snap["/api/auth/me"]["full_name"] = snap["/api/auth/me"]["full_name"]
# ---------------- files
files = {}
with SessionLocal() as db:
    for wc in db.query(WorkingCopy).all():
        for kind, rel, ext in (("thumbnail", wc.thumbnail_path, "jpg"), ("proxy", wc.proxy_path, "mp4")):
            if rel and storage_path(rel).exists():
                name = f"m{wc.media_file_id}-{kind}.{ext}"; shutil.copy(storage_path(rel), OUT / "files" / name)
                files[f"/api/media/{wc.media_file_id}/file/{kind}"] = name
    for m in media:
        for fr in snap.get(f"/api/media/{m['id']}/detail", {}).get("frames", []):
            name = f"m{m['id']}-{fr['name']}"; shutil.copy(storage_path(fr["path"]), OUT / "files" / name)
            files[f"/api/media/{m['id']}/file/frame?name={urllib.parse.quote(fr['name'], safe='')}"] = name
    for rv in db.query(ReportRevision).all():
        for fmt, rel in (("pdf", rv.pdf_path), ("docx", rv.docx_path)):
            name = f"report{rv.report_id}-r{rv.revision}.{fmt}"; shutil.copy(storage_path(rel), OUT / "files" / name)
            files[f"/api/reports/{rv.report_id}/download/{rv.revision}/{fmt}"] = name
# ---------------- winify paths
PFX = [(str(D), "C:\\SceneOps\\data"), ("/home/user/karaokesync-ai/sceneops", "C:\\SceneOps")]
rx = re.compile("|".join(re.escape(a) for a, _ in PFX) + r"[^\s\"]*")
def win(s):
    def f(m):
        t = m.group()
        for a, b in PFX:
            if t.startswith(a): t = b + t[len(a):]
        return t.replace("/", "\\")
    return rx.sub(f, s)
def walk(o):
    if isinstance(o, dict): return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list): return [walk(v) for v in o]
    if isinstance(o, str): return win(o)
    return o
out = {}
for k, v in snap.items():
    if k.startswith("/api/media/browse?path="):
        p = win(urllib.parse.unquote(k.split("=", 1)[1])); k = "/api/media/browse?path=" + urllib.parse.quote(p, safe="-_.!~*'()")
    out[k] = walk(v)
json.dump({"responses": out, "files": files}, open(OUT / "demo-data.json", "w"), ensure_ascii=False)
print("keys", len(out), "files", len(files), "size", (OUT / "demo-data.json").stat().st_size)
