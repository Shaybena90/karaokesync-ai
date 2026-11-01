import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, CalendarDays, CheckCircle2, ChevronsLeft, Clock, FileText, FolderPlus, FolderOpen, Hash,
  HardDrive, History, Home, Info, ListChecks, Play, Plus, ScanLine, Video, XCircle, Zap, Download, FileVideo,
  Clapperboard, Webcam,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtLongDate, fmtTime } from "@/lib/format";
import type { AuditEvent, Dashboard, Job, Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/StatusBadge";
import { VideoPreview } from "@/components/VideoPreview";
import { CaseFormDialog } from "@/components/dialogs/CaseFormDialog";
import { StartWorkflowDialog } from "@/components/dialogs/StartWorkflowDialog";
import { CameraTestDialog, ExportDialog } from "@/components/dialogs/CameraDialogs";

function Clock_() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line/80 bg-card/70 px-5 py-3 shadow-card">
      <div className="text-start leading-snug">
        <div className="font-semibold">{fmtLongDate(now)}</div>
        <div className="tabular font-semibold">{fmtTime(now.toISOString())}</div>
      </div>
      <CalendarDays className="size-7 text-ink-2" aria-hidden />
    </div>
  );
}

function Kpi({ value, label, icon, footer, tone, to }: {
  value: number | string; label: string; icon: ReactNode; footer: ReactNode; tone: "blue" | "violet" | "green";
  to: string;
}) {
  const styles = {
    blue: "border-accent/50 bg-gradient-to-bl from-[#18406b]/70 to-[#122a47]/80 hover:shadow-glow",
    violet: "border-violet/60 bg-gradient-to-bl from-[#2c2766]/80 to-[#18213f]/80 shadow-glow-violet",
    green: "border-ok/60 bg-gradient-to-bl from-[#0f3b3a]/80 to-[#11283a]/80 shadow-glow-ok",
  }[tone];
  const iconBg = { blue: "bg-accent/15 text-accent", violet: "bg-violet/20 text-violet", green: "bg-ok/90 text-[#05261c]" }[tone];
  return (
    <Link to={to} className={cn("group block rounded-xl border px-5 py-4 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", styles)}>
      <div className="flex items-center gap-4">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full [&_svg]:size-7", iconBg)}>{icon}</span>
        <div className="text-start">
          <div className="text-[34px] font-extrabold leading-none tabular">{value}</div>
          <div className="mt-1.5 text-[17px] font-bold">{label}</div>
        </div>
      </div>
      <div className="mt-3 flex text-sm text-ink-2 ps-16">{footer}</div>
    </Link>
  );
}

function QuickAction({ icon, label, sub, onClick, primary, disabled, title }: {
  icon: ReactNode; label: string; sub?: string; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={cn("flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed",
        primary ? "border-accent bg-gradient-to-b from-[#1a4a7d] to-[#143760] shadow-glow"
          : "border-line bg-[#132840]/80 hover:border-accent/60 hover:bg-[#173252]")}>
      <span className={cn("[&_svg]:size-7", primary ? "grid size-9 place-items-center rounded-full bg-white text-accent [&_svg]:size-5" : "text-ink")}>{icon}</span>
      <span className="text-[16px] font-bold leading-tight">{label}</span>
      {sub && <span className="text-xs text-ink-2 leading-tight">{sub}</span>}
    </button>
  );
}

const WF_ICON: Record<string, ReactNode> = {
  full_media: <HardDrive />, drive_scan: <HardDrive />, hash: <Hash />, working_copy: <FileVideo />, index: <ListChecks />,
  timeline: <History />, motion: <Clapperboard />, report: <FileText />, case_integrity: <CheckCircle2 />,
  camera_export_sim: <Video />,
};

function JobsTable({ jobs }: { jobs: Job[] }) {
  const nav = useNavigate();
  if (!jobs.length) return <EmptyState title="אין משימות פעילות" description="משימות חדשות יופיעו כאן עם התקדמות בזמן אמת." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-2 border-b border-line/80">
            <th scope="col" className="py-2.5 px-3 text-start font-semibold">משימה</th>
            <th scope="col" className="py-2.5 px-3 text-start font-semibold">תיק / מוצג</th>
            <th scope="col" className="py-2.5 px-3 text-start font-semibold min-w-[180px]">התקדמות</th>
            <th scope="col" className="py-2.5 px-3 text-start font-semibold">סטטוס</th>
            <th scope="col" className="py-2.5 px-3"><span className="sr-only">פעולה</span></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-line/40 hover:bg-white/[0.03] cursor-pointer" onClick={() => nav(`/automation?job=${j.id}`)}>
              <td className="py-3 px-3">
                <div className="flex items-center gap-2.5 font-medium">
                  <span className="text-ink-2 [&_svg]:size-[18px]">{WF_ICON[j.workflow] ?? <ListChecks />}</span>
                  <span>{j.workflow_name}</span>
                  {j.is_simulation && <span className="text-[11px] text-warn">(סימולציה)</span>}
                </div>
                {j.current_step && j.status === "running" && <div className="ms-7 text-xs text-ink-3">{j.current_step}</div>}
              </td>
              <td className="py-3 px-3 whitespace-nowrap">תיק <bdi dir="ltr">{j.case_reference ?? "—"}</bdi>
                {j.exhibit_identifier && <> – מוצג <bdi dir="ltr">{j.exhibit_identifier}</bdi></>}</td>
              <td className="py-3 px-3">
                <div className="flex items-center gap-3">
                  <span className="w-11 text-start tabular font-medium" dir="ltr">{Math.round(j.progress)}%</span>
                  <Progress value={j.progress} tone={j.status === "succeeded" ? "green" : j.status === "failed" ? "red" : "blue"}
                    label={`התקדמות ${j.workflow_name}`} />
                </div>
              </td>
              <td className="py-3 px-3"><JobStatusBadge status={j.status} /></td>
              <td className="py-3 px-3 text-end">
                <Link to={`/automation?job=${j.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-accent hover:underline">פרטים</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function activityIcon(a: AuditEvent) {
  if (a.action.startsWith("job.succeeded")) return <CheckCircle2 className="text-ok" />;
  if (a.action.startsWith("job.failed")) return <XCircle className="text-danger" />;
  if (a.action.startsWith("job")) return <FileVideo className="text-accent" />;
  if (a.action.startsWith("camera")) return <Plus className="text-accent" />;
  if (a.action.startsWith("report")) return <FileText className="text-accent" />;
  if (a.action.startsWith("case")) return <FolderOpen className="text-accent" />;
  return <History className="text-accent" />;
}

function noteIcon(n: Notification) {
  return { success: <CheckCircle2 className="text-ok" />, warning: <AlertTriangle className="text-warn" />,
    error: <XCircle className="text-danger" />, info: <Info className="text-accent" /> }[n.level];
}

function FeedList({ items, empty }: { items: { id: number; icon: ReactNode; text: string; time: string; to?: string }[]; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-line/50">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={i.to ?? "#"} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent">
            <span className="shrink-0 [&_svg]:size-5">{i.icon}</span>
            <span className="flex-1 truncate">{i.text}</span>
            <span className="tabular text-ink-2 text-[13px]">{fmtTime(i.time)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/dashboard"), refetchInterval: 15000 });
  const [dlg, setDlg] = useState<null | "case" | "full" | "test" | "export" | "report">(null);
  const d = q.data;
  const canAct = can("investigator");
  const noPerm = canAct ? undefined : "נדרשת הרשאת חוקר";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[28px] md:text-[32px] font-extrabold">
            <Home className="size-8 text-accent" aria-hidden />מרכז שליטה
          </h1>
          <p className="mt-1 text-[17px] text-ink-2">סקירה כללית, משימות פעילות ופעולות מהירות</p>
        </div>
        <Clock_ />
      </div>

      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <>
          <section aria-label="מדדים" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {!d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />) : (
              <>
                <Kpi to="/cases" tone="blue" value={d.kpis.open_cases} label="תיקים פתוחים" icon={<FolderOpen />}
                  footer={<span className="flex items-center gap-1.5">{d.kpis.cases_attention} דורשים טיפול
                    {d.kpis.cases_attention > 0 && <AlertTriangle className="size-4 text-warn" />}</span>} />
                <Kpi to="/cameras" tone="blue" value={d.kpis.cameras} label="מצלמות רשומות" icon={<Webcam />}
                  footer={<span className="flex items-center gap-1.5">{d.kpis.cameras_online} פעילות מתוך {d.kpis.cameras}
                    <span className="size-2.5 rounded-full bg-ok" /></span>} />
                <Kpi to="/automation" tone="violet" value={d.kpis.jobs_active} label="משימות בתהליך" icon={<Clock />}
                  footer={<div className="w-full space-y-1">
                    <Progress value={d.kpis.jobs_avg_progress} tone="violet" label="התקדמות ממוצעת" />
                    {d.kpis.jobs_awaiting > 0 && <div className="text-xs text-warn">{d.kpis.jobs_awaiting} ממתינות לאישור</div>}
                  </div>} />
                <Kpi to="/automation" tone="green" value={d.kpis.jobs_done_24h} label="משימות שהושלמו" icon={<CheckCircle2 />}
                  footer={<span>ב-24 השעות האחרונות{d.kpis.jobs_failed_24h ? ` · ${d.kpis.jobs_failed_24h} נכשלו` : ""}</span>} />
              </>
            )}
          </section>

          <Card>
            <CardHeader title="פעולות מהירות" icon={<Zap className="fill-accent" />} />
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 md:grid-cols-3 xl:grid-cols-6">
              <QuickAction icon={<FolderPlus />} label="פתח תיק חדש" onClick={() => setDlg("case")} disabled={!canAct} title={noPerm} />
              <QuickAction icon={<HardDrive />} label="סריקת מדיה" onClick={() => nav("/media?action=source")} disabled={!canAct} title={noPerm} />
              <QuickAction primary icon={<Play className="fill-current" />} label="התחל טיפול מלא"
                sub="סריקה, העתקה, Hash, אינדקס ודוח" onClick={() => setDlg("full")} disabled={!canAct} title={noPerm} />
              <QuickAction icon={<Webcam />} label="בדיקת מצלמה" onClick={() => setDlg("test")} disabled={!canAct} title={noPerm} />
              <QuickAction icon={<Download />} label="ייצוא הקלטות" onClick={() => setDlg("export")} disabled={!canAct} title={noPerm} />
              <QuickAction icon={<FileText />} label="הפקת דוח" onClick={() => setDlg("report")} disabled={!canAct} title={noPerm} />
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-12">
            <div className="space-y-5 xl:col-span-7 2xl:col-span-8 min-w-0">
              <Card>
                <CardHeader title="משימות פעילות" icon={<ListChecks />}
                  actions={<Link to="/automation" className="text-sm text-accent hover:underline">לכל המשימות</Link>} />
                <div className="px-3 pb-3">{d ? <JobsTable jobs={d.jobs} /> : <Skeleton className="h-40" />}</div>
              </Card>
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader title="פעילות אחרונה" icon={<History />} />
                  <div className="px-5 pb-2">
                    <FeedList empty="אין פעילות עדיין" items={(d?.activity ?? []).map((a) => ({
                      id: a.id, icon: activityIcon(a), text: a.summary, time: a.created_at,
                      to: a.entity_type === "job" ? `/automation?job=${a.entity_id}` : a.entity_type === "case" ? `/cases/${a.entity_id}` : "/settings?tab=audit",
                    }))} />
                  </div>
                  <div className="px-5 pb-4"><Link to="/settings?tab=audit" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                    לכל הפעילות <ChevronsLeft className="size-4" /></Link></div>
                </Card>
                <Card>
                  <CardHeader title="התראות ועדכונים" icon={<Bell />} />
                  <div className="px-5 pb-2">
                    <FeedList empty="אין התראות" items={(d?.notifications ?? []).map((n) => ({
                      id: n.id, icon: noteIcon(n), text: n.title, time: n.created_at, to: n.link || "/notifications",
                    }))} />
                  </div>
                  <div className="px-5 pb-4"><Link to="/notifications" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                    לכל ההתראות <ChevronsLeft className="size-4" /></Link></div>
                </Card>
              </div>
            </div>

            <Card className="xl:col-span-5 2xl:col-span-4 min-w-0">
              <CardHeader title="תצוגה מקדימה – ניתוח מדיה" icon={<FileVideo />}
                subtitle={d?.preview ? <>תיק <bdi dir="ltr">{d.preview.case_reference}</bdi> · <bdi dir="ltr">{d.preview.file_name}</bdi></> : undefined}
                actions={d?.preview && <Link to={`/media/${d.preview.media_id}`} className="text-sm text-accent hover:underline">פתיחה</Link>} />
              <div className="px-5 pb-5">
                {!d ? <Skeleton className="aspect-video" /> : d.preview ? (
                  <VideoPreview mediaId={d.preview.media_id} camera={d.preview.camera || "—"}
                    recordedStart={d.preview.recorded_start} duration={d.preview.duration} motion={d.preview.motion} />
                ) : (
                  <div className="rounded-lg border border-dashed border-line p-6 text-center">
                    <div className="mx-auto grid aspect-video max-w-sm place-items-center rounded-md bg-[#0b1626] text-ink-3">
                      <div><ScanLine className="mx-auto size-10" /><p className="mt-2 text-sm">תצוגה מקדימה תופיע לאחר עיבוד</p></div>
                    </div>
                    <p className="mt-3 text-sm text-ink-3">טרם נוצר עותק עבודה עם קובץ תצוגה. הפעילו "טיפול מלא" על מקור ראיות מורשה.</p>
                    {canAct && <Button className="mt-3" size="sm" onClick={() => setDlg("full")}><Play />התחל טיפול מלא</Button>}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <CaseFormDialog open={dlg === "case"} onOpenChange={(o) => setDlg(o ? "case" : null)} />
      <StartWorkflowDialog open={dlg === "full"} onOpenChange={(o) => setDlg(o ? "full" : null)} workflow="full_media" />
      <StartWorkflowDialog open={dlg === "report"} onOpenChange={(o) => setDlg(o ? "report" : null)} workflow="report" />
      <CameraTestDialog open={dlg === "test"} onOpenChange={(o) => setDlg(o ? "test" : null)} />
      <ExportDialog open={dlg === "export"} onOpenChange={(o) => setDlg(o ? "export" : null)} />
    </div>
  );
}
