import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, Layers, ListChecks, Loader2, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction, useWorkflows } from "@/lib/queries";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { JOB_STATUS } from "@/lib/labels";
import type { Job, JobDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { ErrorState, KV, Loading, PageHeader, SimBadge } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { JobsList } from "@/components/JobsList";
import { JobStatusBadge, StepStatusBadge } from "@/components/StatusBadge";
import { StartWorkflowDialog } from "@/components/dialogs/StartWorkflowDialog";

function JobPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { can } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({
    queryKey: ["job", id], queryFn: () => api<JobDetail>(`/api/jobs/${id}`),
    refetchInterval: (query) => (["running", "queued", "cancel_requested"].includes(query.state.data?.status ?? "") ? 2000 : false),
  });
  const act = useAction((a: string) => api<Job>(`/api/jobs/${id}/${a}`, { method: "POST" }), {
    success: (j) => `סטטוס המשימה: ${JOB_STATUS[j.status]}`, invalidate: [["job", String(id)], ["job"], ["jobs"]],
    onSuccess: () => setConfirm(false),
  });
  if (q.isLoading) return <Card><Loading /></Card>;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} /></Card>;
  const j = q.data;
  const active = ["running", "queued", "cancel_requested"].includes(j.status);
  return (
    <Card aria-live="polite">
      <CardHeader title={<span className="flex items-center gap-2">משימה #{j.id}{j.is_simulation && <SimBadge />}</span>} icon={<ListChecks />}
        subtitle={j.title}
        actions={<Button size="icon" variant="ghost" onClick={onClose} aria-label="סגירת פרטי משימה"><X /></Button>} />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <JobStatusBadge status={j.status} />
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Progress value={j.progress} tone={j.status === "succeeded" ? "green" : j.status === "failed" ? "red" : "blue"} label="התקדמות המשימה" />
            <span className="tabular text-sm" dir="ltr">{Math.round(j.progress)}%</span>
          </div>
        </div>
        {j.error && <p role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">{j.error}</p>}
        {j.status === "awaiting_approval" && (
          <p className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">משימה זו הוגשה לביצוע על ידי סוכן ודורשת אישור מנהל מערכת לפני שתתבצע.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {active && can("investigator") && <Button variant="danger" size="sm" onClick={() => setConfirm(true)} disabled={j.status === "cancel_requested"}>
            <CircleSlash />ביטול משימה</Button>}
          {["failed", "cancelled"].includes(j.status) && can("investigator") && (
            <Button size="sm" variant="secondary" onClick={() => act.mutate("retry")} loading={act.isPending}><RotateCcw />ניסיון חוזר (המשך משלב שלא הושלם)</Button>)}
          {j.status === "awaiting_approval" && can("admin") && (
            <Button size="sm" variant="success" onClick={() => act.mutate("approve")} loading={act.isPending}><ShieldCheck />אישור לביצוע</Button>)}
          {j.status === "awaiting_approval" && can("investigator") && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>דחייה / ביטול</Button>)}
          {typeof j.result?.report_id === "number" && <Button size="sm" variant="outline" asChild><Link to={`/reports/${j.result.report_id}`}>פתיחת הדוח שהופק</Link></Button>}
          {j.case_id && <Button size="sm" variant="ghost" asChild><Link to={`/cases/${j.case_id}`}>לתיק <bdi dir="ltr">{j.case_reference}</bdi></Link></Button>}
        </div>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KV label="תהליך">{j.workflow_name}</KV>
          <KV label="מבצע">{j.executor === "agent" ? "סוכן (מרחוק)" : "מנוע מקומי"}</KV>
          <KV label="הופעלה על ידי">{j.created_by?.full_name}</KV>
          <KV label="ניסיונות">{j.attempts}</KV>
          <KV label="נוצרה">{fmtDateTime(j.created_at, true)}</KV>
          <KV label="התחילה">{fmtDateTime(j.started_at, true)}</KV>
          <KV label="הסתיימה">{fmtDateTime(j.finished_at, true)}</KV>
          <KV label="אושרה">{fmtDateTime(j.approved_at)}</KV>
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold">שלבים</h3>
          <ol className="space-y-2">
            {j.steps.map((s) => (
              <li key={s.id} className={cn("rounded-lg border p-3", s.status === "running" ? "border-accent/60 bg-accent/5" : "border-line/60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-white/5 text-xs tabular">{s.order + 1}</span>
                  <span className="font-medium">{s.name}</span>
                  <StepStatusBadge status={s.status} />
                  {s.attempts > 1 && <span className="text-xs text-warn">ניסיון {s.attempts}</span>}
                  <span className="ms-auto text-xs text-ink-3">{s.started_at && fmtTime(s.started_at)}{s.finished_at && ` – ${fmtTime(s.finished_at)}`}</span>
                </div>
                {s.status === "running" && <Progress className="mt-2" value={s.progress * 100} />}
                {s.message && <p className="mt-1 text-xs text-ink-3">{s.message}</p>}
                {s.error && <p className="mt-1 text-xs text-danger">{s.error}</p>}
                {Object.keys(s.tool_versions ?? {}).length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-3" dir="ltr">{Object.entries(s.tool_versions).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">יומן משימה</h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line/60 bg-[#0b1626] p-2 font-mono text-xs" role="log">
            {j.logs.map((l) => (
              <div key={l.id} className={cn("flex gap-2 py-0.5", l.level === "error" ? "text-danger" : l.level === "warning" ? "text-warn" : "text-ink-2")}>
                <span className="shrink-0 text-ink-3 tabular">{fmtTime(l.created_at)}</span>
                <span className="font-sans">{l.message}</span>
              </div>
            ))}
            {active && <div className="flex items-center gap-2 py-1 text-ink-3"><Loader2 className="size-3 animate-spin" />ממתין לעדכונים…</div>}
          </div>
        </div>
      </CardBody>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} danger loading={act.isPending} title="ביטול משימה"
        description="המשימה תיעצר בגבול בטוח הבא (בין קבצים או בין שלבים). קבצי מקור אינם מושפעים, ותוצאות שהושלמו יישמרו. ניתן להפעיל ניסיון חוזר בהמשך."
        confirmLabel="ביטול המשימה" onConfirm={() => act.mutate("cancel")} />
    </Card>
  );
}

export default function AutomationPage() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const selected = Number(sp.get("job")) || undefined;
  const [status, setStatus] = useState("");
  const [wf, setWf] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const wfs = useWorkflows();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (wf) params.set("workflow", wf);
  const jobs = useQuery({ queryKey: ["jobs", params.toString()], queryFn: () => api<Job[]>(`/api/jobs?${params}`), refetchInterval: 8000 });

  return (
    <div className="space-y-5">
      <PageHeader title="אוטומציות ומשימות" icon={<Layers />}
        subtitle="תהליכי עבודה עם שלבים מסודרים, תלויות, ניסיונות חוזרים, ביטול בטוח ותיעוד מלא" />
      <section aria-label="תהליכי עבודה" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {wfs.data?.filter((w) => w.scope !== "camera").map((w) => (
          <Card key={w.key} className="flex flex-col p-4">
            <h3 className="font-bold">{w.name}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-3">{w.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-ink-3">{w.steps.length} שלבים{w.agent_allowed && " · מותר לסוכן"}</span>
              {can("investigator") && <Button size="sm" variant="secondary" onClick={() => setStart(w.key)} aria-label={`הפעלת ${w.name}`}><Play />הפעלה</Button>}
            </div>
          </Card>
        ))}
        <Card className="flex flex-col p-4 border-dashed">
          <h3 className="font-bold">ייצוא הקלטות (סימולציה)</h3>
          <p className="mt-1 flex-1 text-xs text-ink-3">מופעל ממסך המצלמות בלבד, עם בחירת מכשיר, ערוצים, טווח זמן ואסמכתת הרשאה.</p>
          <Button size="sm" variant="ghost" asChild className="mt-3 self-start"><Link to="/cameras">למסך המצלמות</Link></Button>
        </Card>
      </section>

      <div className={cn("grid gap-5", selected && "2xl:grid-cols-2")}>
        <Card className="min-w-0">
          <CardHeader title="תור המשימות" icon={<ListChecks />} actions={
            <div className="flex gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-36" aria-label="סינון לפי סטטוס">
                <option value="">כל הסטטוסים</option>
                {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <Select value={wf} onChange={(e) => setWf(e.target.value)} className="h-9 w-40" aria-label="סינון לפי תהליך">
                <option value="">כל התהליכים</option>
                {wfs.data?.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
              </Select>
            </div>} />
          {jobs.isLoading ? <Loading /> : jobs.isError ? <ErrorState error={jobs.error} /> :
            <JobsList jobs={jobs.data ?? []} selected={selected} onSelect={(id) => setSp({ job: String(id) })} />}
        </Card>
        {selected && <JobPanel id={selected} onClose={() => setSp({})} />}
      </div>
      {!selected && jobs.data && jobs.data.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-ink-3"><CheckCircle2 className="size-4" />בחרו משימה להצגת שלבים, יומן ופעולות.</p>
      )}
      <StartWorkflowDialog open={!!start} onOpenChange={(o) => !o && setStart(null)} workflow={start ?? undefined} />
    </div>
  );
}
