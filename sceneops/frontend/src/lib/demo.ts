/**
 * מצב תצוגה (VITE_DEMO=1): הממשק פועל ללא שרת, מול צילום של תגובות API אמיתיות
 * שהופקו מנתוני ההדגמה. פעולות שינוי מושבתות ומציגות הודעה מתאימה.
 */
export const DEMO = import.meta.env.VITE_DEMO === "1";
export const DEMO_READONLY_MSG = "גרסת תצוגה בלבד – פעולות שינוי אינן זמינות כאן. להפעלה מלאה יש להריץ את המערכת מקומית.";

interface Snapshot { responses: Record<string, unknown>; files: Record<string, string> }
let snap: Snapshot = { responses: {}, files: {} };

export async function loadDemo() {
  const res = await fetch("./demo-data.json");
  snap = await res.json();
}

const LISTS: Record<string, string> = {
  "/api/cases": "/api/cases?include_archived=true",
  "/api/jobs": "/api/jobs?limit=500",
  "/api/media": "/api/media?limit=2000",
  "/api/audit": "/api/audit?limit=1000",
  "/api/notifications": "/api/notifications",
  "/api/reports": "/api/reports",
};

type Row = Record<string, any>;
const has = (v: unknown, q: string) => String(v ?? "").toLowerCase().includes(q.toLowerCase());

function filterList(base: string, params: URLSearchParams, rows: Row[]): Row[] {
  let r = rows;
  const p = (k: string) => params.get(k);
  if (base === "/api/cases") {
    if (p("q")) r = r.filter((c) => has(c.reference, p("q")!) || has(c.title, p("q")!) || has(c.description, p("q")!));
    if (p("status")) r = r.filter((c) => c.status === p("status"));
    else if (p("include_archived") !== "true") r = r.filter((c) => c.status !== "archived");
    if (p("priority")) r = r.filter((c) => c.priority === p("priority"));
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (p("sort") === "priority") r = [...r].sort((a, b) => order[a.priority] - order[b.priority]);
    if (p("sort") === "reference") r = [...r].sort((a, b) => a.reference.localeCompare(b.reference));
    if (p("sort") === "opened") r = [...r].sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
  } else if (base === "/api/media") {
    for (const k of ["case_id", "exhibit_id", "source_id"]) if (p(k)) r = r.filter((m) => String(m[k]) === p(k));
    if (p("camera")) r = r.filter((m) => m.camera_label === p("camera"));
    if (p("media_type")) r = r.filter((m) => m.media_type === p("media_type"));
    if (p("q")) r = r.filter((m) => has(m.relative_path, p("q")!) || has(m.codec, p("q")!) || has(m.camera_label, p("q")!));
    if (p("has_warnings") === "true") r = r.filter((m) => m.warnings?.length);
    if (p("start")) r = r.filter((m) => !m.recorded_end || m.recorded_end >= p("start")!);
    if (p("end")) r = r.filter((m) => !m.recorded_start || m.recorded_start <= p("end")!);
  } else if (base === "/api/jobs") {
    if (p("status")) r = r.filter((j) => j.status === p("status"));
    if (p("workflow")) r = r.filter((j) => j.workflow === p("workflow"));
    if (p("case_id")) r = r.filter((j) => String(j.case_id) === p("case_id"));
    if (p("active") === "true") r = r.filter((j) => ["queued", "running", "cancel_requested", "awaiting_approval"].includes(j.status));
  } else if (base === "/api/reports") {
    if (p("case_id")) r = r.filter((x) => String(x.case_id) === p("case_id"));
  } else if (base === "/api/audit") {
    if (p("q")) r = r.filter((a) => has(a.summary, p("q")!) || has(a.actor, p("q")!));
    if (p("entity_type")) r = r.filter((a) => a.entity_type === p("entity_type"));
    if (p("entity_id")) r = r.filter((a) => String(a.entity_id) === p("entity_id"));
    if (p("action")) r = r.filter((a) => String(a.action).startsWith(p("action")!));
  } else if (base === "/api/notifications") {
    if (p("unread_only") === "true") r = r.filter((n) => !n.read);
  }
  return r;
}

export function demoGet(path: string): unknown {
  const R = snap.responses;
  if (path in R) return R[path];
  const [base, qs = ""] = path.split("?");
  if (base in LISTS && R[LISTS[base]]) return filterList(base, new URLSearchParams(qs), R[LISTS[base]] as Row[]);
  if (base in R) return R[base];
  const err = new Error("נתון זה אינו כלול בגרסת התצוגה") as Error & { status: number };
  err.status = 404;
  throw err;
}

export function demoFile(path: string): string {
  const name = snap.files[path];
  return name ? `./files/${name}` : "";
}
