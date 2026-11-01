import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Bot, Copy, KeyRound, Monitor, Play, Plus, Send, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction, useCases, useExhibits } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import type { Agent, Job } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ErrorState, Loading, Ltr, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { JobsList } from "@/components/JobsList";

interface RemoteStatus {
  mode: string; mode_label: string; modes: Record<string, string>; network_available: boolean; network_note: string;
  allowlist: { key: string; name: string }[]; agents: Agent[]; jobs: Job[]; demo_agent_ready: boolean;
}

function SubmitJob({ st }: { st: RemoteStatus }) {
  const cases = useCases();
  const agents = st.agents.filter((a) => a.kind === "remote_agent" && a.enabled);
  const [agentId, setAgentId] = useState<number | undefined>(agents[0]?.id);
  const agent = agents.find((a) => a.id === agentId);
  const [wf, setWf] = useState("hash");
  const [caseId, setCaseId] = useState<number | undefined>();
  const [exId, setExId] = useState<number | undefined>();
  const [srcId, setSrcId] = useState<number | undefined>();
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const exhibits = useExhibits(caseId);
  const ex = exhibits.data?.find((e) => e.id === exId);
  const needsSource = wf === "drive_scan";
  const submit = useAction((b: Record<string, unknown>) => api<Job>("/api/remote/jobs", { method: "POST", json: b }), {
    success: (j) => `המשימה #${j.id} הוגשה וממתינה לאישור מנהל`, invalidate: [["remote"], ["jobs"]], onSuccess: () => setWhy(""),
  });
  const go = () => {
    setErr(null);
    if (!agentId) return setErr("בחרו סוכן");
    if (!caseId) return setErr("בחרו תיק");
    if (wf !== "report" && !exId) return setErr("בחרו מוצג");
    if (needsSource && !srcId) return setErr("בחרו מקור");
    if (why.trim().length < 5) return setErr("יש לנמק את הבקשה (לפחות 5 תווים)");
    submit.mutate({ agent_id: agentId, workflow: wf, case_id: caseId, exhibit_id: exId, source_id: needsSource ? srcId : undefined, justification: why.trim() });
  };
  if (st.mode === "disabled") return <p className="text-sm text-ink-3">הגשת משימות לסוכן אפשרית רק כאשר מצב סימולציה מקומית פעיל.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="סוכן"><Select value={agentId ?? ""} onChange={(e) => setAgentId(Number(e.target.value) || undefined)}>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      <Field label="סוג משימה (רשימה מותרת)"><Select value={wf} onChange={(e) => setWf(e.target.value)}>
        {st.allowlist.filter((w) => agent?.allowed_job_types.includes(w.key)).map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}</Select></Field>
      <Field label="תיק"><Select value={caseId ?? ""} onChange={(e) => { setCaseId(Number(e.target.value) || undefined); setExId(undefined); }}>
        <option value="">— בחרו —</option>{cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}</Select></Field>
      {wf !== "report" && <Field label="מוצג"><Select value={exId ?? ""} onChange={(e) => setExId(Number(e.target.value) || undefined)} disabled={!caseId}>
        <option value="">— בחרו —</option>{exhibits.data?.map((e) => <option key={e.id} value={e.id}>מוצג {e.identifier}</option>)}</Select></Field>}
      {needsSource && <Field label="מקור"><Select value={srcId ?? ""} onChange={(e) => setSrcId(Number(e.target.value) || undefined)}>
        <option value="">— בחרו —</option>{ex?.sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>}
      <Field label="הצדקה" required className="md:col-span-2"><Textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="מדוע נדרש ביצוע באמצעות סוכן" /></Field>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button onClick={go} loading={submit.isPending}><Send />הגשה לאישור</Button>
        {err && <span role="alert" className="text-sm text-danger">{err}</span>}
      </div>
    </div>
  );
}

export default function RemotePage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["remote"], queryFn: () => api<RemoteStatus>("/api/remote/status"), refetchInterval: 5000 });
  const [modeDlg, setModeDlg] = useState<string | null>(null);
  const [reg, setReg] = useState(false);
  const [name, setName] = useState("");
  const [allowed, setAllowed] = useState<string[]>(["drive_scan", "hash"]);
  const [secret, setSecret] = useState<{ key: string; secret: string } | null>(null);
  const setMode = useAction((mode: string) => api("/api/remote/mode", { method: "POST", json: { mode, confirm: true } }), {
    success: "מצב השליטה מרחוק עודכן", invalidate: [["remote"], ["health"]], onSuccess: () => setModeDlg(null),
  });
  const register = useAction((b: Record<string, unknown>) => api<{ agent: Agent; secret: string }>("/api/remote/agents", { method: "POST", json: b }), {
    success: "הסוכן נרשם", invalidate: [["remote"]], onSuccess: (r) => { setReg(false); setName(""); setSecret({ key: r.agent.agent_key, secret: r.secret }); },
  });
  const toggle = useAction((a: Agent) => api(`/api/remote/agents/${a.id}`, { method: "PATCH", json: { enabled: !a.enabled } }), { invalidate: [["remote"]] });
  const demo = useAction(() => api("/api/remote/demo/run-cycle", { method: "POST" }), {
    success: "סוכן ההדגמה הופעל למחזור אחד – אם קיימת משימה מאושרת היא תבוצע", invalidate: [["remote"], ["jobs"]],
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const st = q.data;
  const enabled = st.mode === "local_simulation";

  return (
    <div className="space-y-5">
      <PageHeader title="שליטה מרחוק" icon={<Monitor />} subtitle="ארכיטקטורת סוכן בטוחה – רשימת משימות מותרת, אישור מנהל, חתימה והגנת replay" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className={enabled ? "border-ok/50" : ""}>
          <CardHeader title="מצב" icon={enabled ? <ShieldCheck className="text-ok" /> : <ShieldOff />} />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 text-lg font-bold">{st.mode_label}
              <Badge tone={enabled ? "green" : "gray"}>{enabled ? "פעיל" : "כבוי"}</Badge></div>
            <p className="text-sm text-ink-3">{st.network_note}</p>
            <div className="rounded-lg border border-line/60 p-3 text-sm">
              <p className="font-medium">גישה ברשת: <span className="text-danger">לא זמינה ב-MVP</span></p>
            </div>
            {can("admin") && (enabled
              ? <Button variant="danger" onClick={() => setModeDlg("disabled")}><Ban />השבתה</Button>
              : <Button onClick={() => setModeDlg("local_simulation")}><ShieldCheck />הפעלת סימולציה מקומית</Button>)}
            {!can("admin") && <p className="text-xs text-ink-3">שינוי המצב שמור למנהל מערכת.</p>}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="מה הסוכן רשאי לעשות" icon={<ShieldCheck />} />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="mb-2 font-semibold text-ok">מותר (רשימה סגורה)</p>
              <ul className="space-y-1">{st.allowlist.map((w) => <li key={w.key} className="flex items-center gap-2"><ShieldCheck className="size-4 text-ok" />{w.name}</li>)}</ul>
            </div>
            <div>
              <p className="mb-2 font-semibold text-danger">אסור – לא ממומש כלל</p>
              <ul className="space-y-1 text-ink-2">
                {["הרצת פקודות מעטפת שרירותיות", "שולחן עבודה מרוחק", "חילוץ פרטי גישה", "גישה חופשית לקבצים מחוץ לנתיבים מורשים", "סריקת רשתות"].map((x) =>
                  <li key={x} className="flex items-center gap-2"><Ban className="size-4 text-danger" />{x}</li>)}
              </ul>
            </div>
            <p className="md:col-span-2 text-xs text-ink-3">כל בקשה נחתמת ב-HMAC-SHA256 עם חותמת זמן ו-nonce חד-פעמי, מתועדת ביומן הביקורת, ומחייבת אישור מנהל לפני ביצוע. בפריסה ארגונית נדרשים TLS הדדי וניהול מפתחות.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="סוכנים" icon={<Bot />} actions={can("admin") && <Button size="sm" variant="outline" onClick={() => setReg(true)}><Plus />רישום סוכן</Button>} />
        <Table>
          <thead><tr><Th>שם</Th><Th>סוג</Th><Th>מזהה</Th><Th>משימות מותרות</Th><Th>נתיבים מותרים</Th><Th>נראה לאחרונה</Th><Th>מצב</Th><Th><span className="sr-only">פעולות</span></Th></tr></thead>
          <tbody>{st.agents.map((a) => (
            <Tr key={a.id}>
              <Td className="font-medium">{a.name}</Td>
              <Td>{a.kind === "local_worker" ? "מנוע מקומי" : "סוכן"}</Td>
              <Td><Ltr mono className="text-xs">{a.agent_key}</Ltr></Td>
              <Td className="text-xs">{a.kind === "local_worker" ? "כל התהליכים (מקומי)" : a.allowed_job_types.map((k) => st.allowlist.find((w) => w.key === k)?.name ?? k).join(", ")}</Td>
              <Td className="max-w-[260px] text-xs">{a.allowed_roots.map((r) => <Ltr key={r} mono className="block truncate">{r}</Ltr>)}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtDateTime(a.last_seen_at, true)}</Td>
              <Td><Badge tone={a.online ? "green" : a.enabled ? "gray" : "red"}>{a.online ? "מחובר" : a.enabled ? "לא מחובר" : "מושבת"}</Badge></Td>
              <Td>{can("admin") && a.kind === "remote_agent" && <Button size="sm" variant="ghost" onClick={() => toggle.mutate(a)}>{a.enabled ? "השבתה" : "הפעלה"}</Button>}</Td>
            </Tr>))}</tbody>
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="הגשת משימה לסוכן" icon={<Send />} />
          <CardBody><SubmitJob st={st} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="הדגמה מקומית" icon={<Play />} subtitle="מריץ את לקוח הסוכן מול ה-API המקומי – אותו פרוטוקול חתום ואותה רשימה מותרת" />
          <CardBody className="space-y-3 text-sm text-ink-2">
            <ol className="list-decimal space-y-1 ps-5">
              <li>מנהל מפעיל "סימולציה מקומית".</li><li>חוקר מגיש משימה מותרת עם הצדקה.</li>
              <li>מנהל מאשר את המשימה במסך אוטומציות ומשימות.</li><li>סוכן ההדגמה מושך את המשימה, מפעיל אותה ומדווח סטטוס.</li>
            </ol>
            <p className="text-xs text-ink-3">לחלופין ניתן להריץ את הסוכן כתהליך נפרד: <Ltr mono>scripts\start-agent.ps1</Ltr></p>
            <Button onClick={() => demo.mutate(undefined)} loading={demo.isPending} disabled={!enabled || !st.demo_agent_ready || !can("investigator")}>
              <Play />הפעלת מחזור סוכן הדגמה</Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="משימות סוכן" icon={<Bot />} />
        <JobsList jobs={st.jobs} />
      </Card>

      <ConfirmDialog open={!!modeDlg} onOpenChange={(o) => !o && setModeDlg(null)} loading={setMode.isPending} danger={modeDlg === "disabled"}
        title={modeDlg === "disabled" ? "השבתת שליטה מרחוק" : "הפעלת סימולציה מקומית"}
        description={modeDlg === "disabled" ? "סוכנים לא יוכלו למשוך משימות. משימות שכבר רצות יסתיימו." :
          "סוכנים מקומיים (127.0.0.1 בלבד) יוכלו למשוך משימות מהרשימה המותרת לאחר אישור מנהל. גישה ברשת נשארת חסומה."}
        confirmLabel={modeDlg === "disabled" ? "השבתה" : "הפעלה"} onConfirm={() => modeDlg && setMode.mutate(modeDlg)} />
      <Dialog open={reg} onOpenChange={setReg} title="רישום סוכן" description="הסוד יוצג פעם אחת בלבד ולא יישמר במערכת בצורה קריאה."
        footer={<><Button onClick={() => name.trim().length >= 2 && allowed.length && register.mutate({ name: name.trim(), allowed_job_types: allowed, allowed_roots: [] })}
          loading={register.isPending} disabled={name.trim().length < 2 || !allowed.length}><KeyRound />רישום והפקת סוד</Button>
          <Button variant="secondary" onClick={() => setReg(false)}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="שם הסוכן" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="תחנת מעבדה 2" /></Field>
          <fieldset className="space-y-2"><legend className="text-sm font-medium text-ink-2 mb-1">משימות מותרות</legend>
            {st.allowlist.map((w) => <Checkbox key={w.key} label={w.name} checked={allowed.includes(w.key)}
              onChange={(v) => setAllowed(v ? [...allowed, w.key] : allowed.filter((x) => x !== w.key))} />)}</fieldset>
        </div>
      </Dialog>
      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)} title="פרטי הסוכן – יוצגו פעם אחת"
        footer={<Button onClick={() => setSecret(null)}>שמרתי את הסוד</Button>}>
        {secret && <div className="space-y-3 text-sm">
          <p className="text-warn">העתיקו את הסוד לקובץ מוגן במחשב הסוכן. לא ניתן יהיה להציגו שוב.</p>
          <div><p className="text-ink-3">מזהה</p><Ltr mono>{secret.key}</Ltr></div>
          <div><p className="text-ink-3">סוד</p><div className="flex items-center gap-2"><Ltr mono className="break-all">{secret.secret}</Ltr>
            <Button size="icon" variant="ghost" aria-label="העתקה" onClick={() => navigator.clipboard?.writeText(secret.secret).then(() => toast.success("הועתק"))}><Copy /></Button></div></div>
        </div>}
      </Dialog>
    </div>
  );
}
