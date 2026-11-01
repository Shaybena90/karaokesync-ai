import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderLock, Plus, Search, Settings, ShieldAlert, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction, useUsers } from "@/lib/queries";
import { fmtBytes, fmtDateTime, shortHash } from "@/lib/format";
import { AUDIT_ENTITY } from "@/lib/labels";
import type { AuditEvent, Health, Role, User } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { EmptyState, KV, Loading, Ltr, PageHeader } from "@/components/ui/misc";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";

interface SettingsRes {
  settings: Record<string, { value: unknown; description: string; updated_at: string | null }>;
  editable: string[]; environment: Record<string, string | number | boolean>;
}
const LABEL: Record<string, string> = {
  gap_threshold_seconds: "סף פער הקלטה (שניות)", motion_sensitivity: "רגישות זיהוי תנועה",
  organization_name: "שם הארגון", require_remote_approval: "אישור מנהל למשימות מרחוק",
};

function General() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsRes>("/api/settings") });
  const h = useQuery({ queryKey: ["health", "full"], queryFn: () => api<Health>("/api/system/health") });
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setVals(Object.fromEntries(q.data.editable.map((k) => [k, String(q.data!.settings[k]?.value ?? "")])));
  }, [q.data]);
  const save = useAction((b: Record<string, unknown>) => api("/api/settings", { method: "PATCH", json: b }), { success: "ההגדרות נשמרו", invalidate: [["settings"]] });
  if (!q.data) return <Loading />;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader title="הגדרות עיבוד" icon={<Settings />} />
        <CardBody className="space-y-4">
          {q.data.editable.map((k) => (
            <Field key={k} label={LABEL[k] ?? k} hint={q.data.settings[k]?.description}>
              {k === "require_remote_approval" ? (
                <Select value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} disabled={!can("admin")}>
                  <option value="true">כן</option><option value="false">לא</option></Select>
              ) : <Input value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} disabled={!can("admin")} />}
            </Field>
          ))}
          {can("admin") && <Button loading={save.isPending} onClick={() => save.mutate(Object.fromEntries(Object.entries(vals).map(([k, v]) =>
            [k, k === "require_remote_approval" ? v === "true" : k === "organization_name" ? v : Number(v)])))}>שמירה</Button>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="סביבה וכלים" icon={<ShieldCheck />} />
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <KV label="מסד נתונים">{String(q.data.environment.database)}</KV>
            <KV label="אזור זמן לתצוגה"><Ltr>{String(q.data.environment.display_timezone)}</Ltr></KV>
            <KV label="תוקף התחברות">{String(q.data.environment.session_hours)} שעות</KV>
            <KV label="מגבלת גודל בקשה">{String(q.data.environment.max_upload_mb)} MB</KV>
            <KV label="מצב הדגמה">{q.data.environment.demo_mode ? "פעיל" : "כבוי"}</KV>
            <KV label="שטח פנוי"><Ltr>{h.data ? fmtBytes(h.data.storage_free) : "…"}</Ltr></KV>
            <div className="col-span-2"><KV label="אחסון עותקי עבודה"><Ltr mono className="break-all">{String(q.data.environment.storage_root)}</Ltr></KV></div>
          </dl>
          {h.data?.tools && (
            <div><p className="mb-1 text-xs text-ink-3">כלים וגרסאות</p>
              <ul className="space-y-0.5 text-sm" dir="ltr">{Object.entries(h.data.tools).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul></div>
          )}
          {!h.data?.ffmpeg && h.data && <p className="text-sm text-danger">FFmpeg/FFprobe לא נמצאו – מטא-דאטה ונגזרות וידאו לא יופקו.</p>}
        </CardBody>
      </Card>
      <Card className="xl:col-span-2 border-warn/40">
        <CardHeader title="אבטחה – הדגמה מול ייצור" icon={<ShieldAlert className="text-warn" />} />
        <CardBody className="grid grid-cols-1 gap-4 text-sm text-ink-2 md:grid-cols-2">
          <div><p className="mb-1 font-semibold text-ink">ממומש בהדגמה</p>
            <ul className="list-disc space-y-0.5 ps-5"><li>סיסמאות מגובבות (PBKDF2-SHA256), פקיעת התחברות</li><li>הרשאות לפי תפקיד: מנהל, חוקר, צופה</li>
              <li>יומן ביקורת בשרשרת גיבוב</li><li>הגבלת נתיבים, חסימת Path Traversal ומגבלת גודל בקשה</li><li>אי-רישום סודות ביומנים</li></ul></div>
          <div><p className="mb-1 font-semibold text-ink">נדרש לפני פריסה ארגונית</p>
            <ul className="list-disc space-y-0.5 ps-5"><li>חיבור לספק זהויות ארגוני (SSO/AD) וביטול משתמשי הדגמה</li><li>TLS ו-TLS הדדי לסוכנים, ניהול מפתחות וסודות</li>
              <li>בדיקות חדירה ואישור אבטחת מידע</li><li>תיקוף פורנזי של התהליכים – המערכת אינה מוסמכת ואינה מבטיחה קבילות</li></ul></div>
        </CardBody>
      </Card>
    </div>
  );
}

function Roots() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["settings-roots"], queryFn: () => api<{ id: number; path: string; kind: string; label: string; active: boolean; created_at: string }[]>("/api/settings/roots") });
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [ok, setOk] = useState(false);
  const add = useAction((b: Record<string, unknown>) => api("/api/settings/roots", { method: "POST", json: b }), {
    success: "הנתיב אושר", invalidate: [["settings-roots"], ["roots"], ["drives"]], onSuccess: () => { setOpen(false); setPath(""); setLabel(""); setOk(false); },
  });
  const toggle = useAction((r: { id: number; active: boolean }) => api(`/api/settings/roots/${r.id}`, { method: "PATCH", json: { active: !r.active } }), {
    invalidate: [["settings-roots"], ["roots"]],
  });
  return (
    <Card>
      <CardHeader title="נתיבים מורשים" icon={<FolderLock />} subtitle="רק בתוך נתיבי מקור אלו ניתן לעיין ולסרוק. האחסון לעותקי עבודה מופרד מהם."
        actions={can("admin") && <Button size="sm" onClick={() => setOpen(true)}><Plus />אישור נתיב</Button>} />
      {!q.data ? <Loading /> : (
        <Table><thead><tr><Th>נתיב</Th><Th>סוג</Th><Th>תיאור</Th><Th>נוסף</Th><Th>מצב</Th><Th><span className="sr-only">פעולות</span></Th></tr></thead>
          <tbody>{q.data.map((r) => (
            <Tr key={r.id}><Td><Ltr mono className="break-all">{r.path}</Ltr></Td><Td>{r.kind === "source" ? "מקור (קריאה בלבד)" : "יעד עותקי עבודה"}</Td>
              <Td>{r.label}</Td><Td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</Td>
              <Td><Badge tone={r.active ? "green" : "gray"}>{r.active ? "פעיל" : "מושבת"}</Badge></Td>
              <Td>{can("admin") && r.kind === "source" && <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>{r.active ? "השבתה" : "הפעלה"}</Button>}</Td></Tr>
          ))}</tbody></Table>
      )}
      <Dialog open={open} onOpenChange={setOpen} title="אישור נתיב מקור" description="לדוגמה: E:\ לכונן נשלף, או תיקייה ייעודית לקבלת ראיות."
        footer={<><Button onClick={() => add.mutate({ path, label, confirm_authorized: ok })} disabled={!path || !ok} loading={add.isPending}>אישור</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="נתיב מלא" required><Input value={path} onChange={(e) => setPath(e.target.value)} dir="ltr" className="text-start font-mono" placeholder="D:\Evidence\Incoming" /></Field>
          <Field label="תיאור" hint="חובה לכונן שלם"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Checkbox checked={ok} onChange={setOk} label="אני מאשר/ת שקיימת הרשאה מפורשת לגישה לנתיב זה ולכל תוכנו, לקריאה בלבד." />
        </div>
      </Dialog>
    </Card>
  );
}

function UsersTab() {
  const { user: me, can } = useAuth();
  const users = useUsers();
  const [dlg, setDlg] = useState<{ open: boolean; u?: User }>({ open: false });
  const [f, setF] = useState({ username: "", full_name: "", password: "", role: "investigator" as Role, is_active: true });
  useEffect(() => {
    if (dlg.open) setF(dlg.u ? { username: dlg.u.username, full_name: dlg.u.full_name, password: "", role: dlg.u.role, is_active: dlg.u.is_active }
      : { username: "", full_name: "", password: "", role: "investigator", is_active: true });
  }, [dlg]);
  const save = useAction((b: Record<string, unknown>) => dlg.u ? api(`/api/users/${dlg.u.id}`, { method: "PATCH", json: b }) : api("/api/users", { method: "POST", json: b }), {
    success: "המשתמש נשמר", invalidate: [["users"]], onSuccess: () => setDlg({ open: false }),
  });
  return (
    <Card>
      <CardHeader title="משתמשים והרשאות" icon={<Users />} actions={can("admin") && <Button size="sm" onClick={() => setDlg({ open: true })}><UserPlus />משתמש חדש</Button>} />
      {!users.data ? <Loading /> : (
        <Table><thead><tr><Th>שם</Th><Th>שם משתמש</Th><Th>תפקיד</Th><Th>מצב</Th><Th>התחברות אחרונה</Th><Th><span className="sr-only">פעולות</span></Th></tr></thead>
          <tbody>{users.data.map((u) => (
            <Tr key={u.id}><Td className="font-medium">{u.full_name}{u.is_demo && <span className="ms-2 text-[11px] text-warn">הדגמה</span>}</Td>
              <Td><Ltr mono>{u.username}</Ltr></Td><Td>{u.role_label}</Td>
              <Td><Badge tone={u.is_active ? "green" : "gray"}>{u.is_active ? "פעיל" : "מושבת"}</Badge></Td>
              <Td className="whitespace-nowrap">{fmtDateTime(u.last_login_at)}</Td>
              <Td>{can("admin") && <Button size="sm" variant="ghost" onClick={() => setDlg({ open: true, u })}>עריכה</Button>}</Td></Tr>
          ))}</tbody></Table>
      )}
      <Dialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, u: o ? dlg.u : undefined })} title={dlg.u ? `עריכת ${dlg.u.full_name}` : "משתמש חדש"}
        footer={<><Button loading={save.isPending} onClick={() => {
          const b: Record<string, unknown> = { full_name: f.full_name, role: f.role };
          if (dlg.u) { b.is_active = f.is_active; if (f.password) b.password = f.password; } else Object.assign(b, { username: f.username, password: f.password });
          save.mutate(b);
        }}>שמירה</Button><Button variant="secondary" onClick={() => setDlg({ open: false })}>ביטול</Button></>}>
        <div className="space-y-4">
          {!dlg.u && <Field label="שם משתמש" required hint="אותיות לועזיות, ספרות, _ . -"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} dir="ltr" className="text-start" /></Field>}
          <Field label="שם מלא" required><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label={dlg.u ? "סיסמה חדשה (אופציונלי)" : "סיסמה"} required={!dlg.u} hint="לפחות 8 תווים">
            <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} dir="ltr" /></Field>
          <Field label="תפקיד"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} disabled={dlg.u?.id === me?.id}>
            <option value="admin">מנהל מערכת</option><option value="investigator">חוקר</option><option value="viewer">צופה</option></Select></Field>
          {dlg.u && dlg.u.id !== me?.id && <Checkbox checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="חשבון פעיל" />}
        </div>
      </Dialog>
    </Card>
  );
}

function AuditTab() {
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (entity) params.set("entity_type", entity);
  const rows = useQuery({ queryKey: ["audit", params.toString()], queryFn: () => api<AuditEvent[]>(`/api/audit?${params}`) });
  const [verify, setVerify] = useState<{ ok: boolean; total: number; first_invalid_id: number | null } | null>(null);
  const check = useAction(() => api<{ ok: boolean; total: number; first_invalid_id: number | null }>("/api/audit/verify"), { onSuccess: setVerify });
  return (
    <Card>
      <CardHeader title="יומן ביקורת" icon={<ShieldCheck />} subtitle="כל רשומה מקושרת בגיבוב SHA-256 לרשומה הקודמת"
        actions={can("admin") && <Button size="sm" variant="outline" onClick={() => check.mutate(undefined)} loading={check.isPending}><ShieldCheck />אימות שרשרת</Button>} />
      {verify && <div role="status" className={`mx-5 mb-3 rounded-lg border p-3 text-sm ${verify.ok ? "border-ok/50 bg-ok/10" : "border-danger/50 bg-danger/10"}`}>
        {verify.ok ? `שרשרת היומן תקינה – ${verify.total} רשומות אומתו.` : `זוהתה אי-התאמה ברשומה #${verify.first_invalid_id}.`}</div>}
      <div className="flex flex-wrap gap-3 px-5 pb-3">
        <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בתיאור או משתמש" aria-label="חיפוש ביומן" /></div>
        <Select className="w-44" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="סינון לפי ישות">
          <option value="">כל הישויות</option>{Object.entries(AUDIT_ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      {!rows.data ? <Loading /> : !rows.data.length ? <EmptyState title="אין רשומות" /> : (
        <Table><thead><tr><Th>#</Th><Th>זמן</Th><Th>משתמש</Th><Th>ישות</Th><Th>תיאור</Th><Th>IP</Th><Th>Hash</Th></tr></thead>
          <tbody>{rows.data.map((a) => (
            <Tr key={a.id}><Td className="tabular text-ink-3">{a.id}</Td><Td className="whitespace-nowrap">{fmtDateTime(a.created_at, true)}</Td>
              <Td><Ltr>{a.actor}</Ltr></Td><Td>{AUDIT_ENTITY[a.entity_type] ?? a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ""}</Td>
              <Td className="min-w-[260px]">{a.summary}</Td><Td><Ltr mono className="text-xs">{a.ip || "—"}</Ltr></Td>
              <Td><Ltr mono className="text-xs text-ink-3">{shortHash(a.hash, 6)}</Ltr></Td></Tr>
          ))}</tbody></Table>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") ?? "general";
  return (
    <div>
      <PageHeader title="הגדרות מערכת" icon={<Settings />} subtitle="הגדרות עיבוד, נתיבים מורשים, משתמשים ויומן ביקורת" />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}
        tabs={[{ value: "general", label: "כללי" }, { value: "roots", label: "נתיבים מורשים" }, { value: "users", label: "משתמשים" }, { value: "audit", label: "יומן ביקורת" }]}>
        <TabPanel value="general"><General /></TabPanel>
        <TabPanel value="roots"><Roots /></TabPanel>
        <TabPanel value="users"><UsersTab /></TabPanel>
        <TabPanel value="audit"><AuditTab /></TabPanel>
      </Tabs>
    </div>
  );
}
