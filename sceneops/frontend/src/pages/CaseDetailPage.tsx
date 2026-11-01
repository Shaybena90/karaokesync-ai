import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, ArrowRight, FilePlus2, FileText, FolderOpen, HardDrive, ListChecks, Pencil, Play, Plus,
  ScrollText,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction, useCase, useExhibits } from "@/lib/queries";
import { fmtBytes, fmtDateTime, isoToLocalInput, localInputToIso } from "@/lib/format";
import { CUSTODY_TYPE, EXHIBIT_STATUS, EXHIBIT_TYPE, SOURCE_KIND } from "@/lib/labels";
import type { AuditEvent, Custody, Exhibit, Job, Media, Report } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, ErrorState, KV, Loading, Ltr } from "@/components/ui/misc";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { CaseStatusBadge, PriorityBadge, ReportStatusBadge } from "@/components/StatusBadge";
import { CaseFormDialog } from "@/components/dialogs/CaseFormDialog";
import { StartWorkflowDialog } from "@/components/dialogs/StartWorkflowDialog";
import { MediaTable } from "@/components/MediaTable";
import { TimelineView } from "@/components/TimelineView";
import { JobsList } from "@/components/JobsList";

function ExhibitDialog({ open, onOpenChange, caseId, existing }: {
  open: boolean; onOpenChange: (o: boolean) => void; caseId: number; existing?: Exhibit;
}) {
  const empty = { identifier: "", label: "", description: "", exhibit_type: "folder", source_device: "", location: "",
    acquisition_method: "", acquired_at: "", storage_reference: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(existing ? { ...empty, ...existing, acquired_at: isoToLocalInput(existing.acquired_at) } as typeof empty : empty);
  }, [open, existing]); // eslint-disable-line
  const save = useAction((body: Record<string, unknown>) => existing
    ? api(`/api/exhibits/${existing.id}`, { method: "PATCH", json: body })
    : api(`/api/cases/${caseId}/exhibits`, { method: "POST", json: body }), {
    success: existing ? "המוצג עודכן" : "המוצג נרשם ונוסף אירוע משמורת", invalidate: [["exhibits", String(caseId)], ["exhibits"], ["case"]],
    onSuccess: () => onOpenChange(false),
  });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!existing && !f.identifier.trim()) e.identifier = "יש להזין מזהה מוצג";
    if (f.label.trim().length < 2) e.label = "יש להזין תיאור קצר";
    setErr(e);
    if (Object.keys(e).length) return;
    const { identifier, ...rest } = f;
    const body: Record<string, unknown> = { ...rest, acquired_at: localInputToIso(f.acquired_at) };
    if (!existing) body.identifier = identifier.trim();
    save.mutate(body);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={existing ? `עריכת מוצג ${existing.identifier}` : "הוספת מוצג"}
      footer={<><Button onClick={submit} loading={save.isPending}>שמירה</Button><Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="מזהה מוצג" required error={err.identifier} hint="לדוגמה: 003">
          <Input value={f.identifier} onChange={set("identifier")} disabled={!!existing} dir="ltr" className="text-start" />
        </Field>
        <Field label="תיאור קצר" required error={err.label}><Input value={f.label} onChange={set("label")} /></Field>
        <Field label="סוג מוצג">
          <Select value={f.exhibit_type} onChange={set("exhibit_type")}>
            {Object.entries(EXHIBIT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="התקן מקור"><Input value={f.source_device} onChange={set("source_device")} placeholder="לדוגמה: DVR-03 (8 ערוצים)" /></Field>
        <Field label="מיקום"><Input value={f.location} onChange={set("location")} /></Field>
        <Field label="שיטת רכישה"><Input value={f.acquisition_method} onChange={set("acquisition_method")} /></Field>
        <Field label="מועד רכישה"><Input type="datetime-local" value={f.acquired_at} onChange={set("acquired_at")} /></Field>
        <Field label="אסמכתת אחסון פיזי"><Input value={f.storage_reference} onChange={set("storage_reference")} /></Field>
        <Field label="תיאור מפורט" className="md:col-span-2"><Textarea value={f.description} onChange={set("description")} /></Field>
      </div>
    </Dialog>
  );
}

function CustodyDialog({ open, onOpenChange, exhibit }: { open: boolean; onOpenChange: (o: boolean) => void; exhibit: Exhibit }) {
  const [f, setF] = useState({ event_type: "transferred", description: "", from_party: "", to_party: "", location: "", occurred_at: "" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setErr(null); setF({ event_type: "transferred", description: "", from_party: "", to_party: "", location: "", occurred_at: "" }); } }, [open]);
  const save = useAction((b: Record<string, unknown>) => api(`/api/exhibits/${exhibit.id}/custody`, { method: "POST", json: b }), {
    success: "אירוע המשמורת נרשם", invalidate: [["custody", String(exhibit.id)]], onSuccess: () => onOpenChange(false),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`אירוע משמורת – מוצג ${exhibit.identifier}`}
      description="אירועי משמורת אינם ניתנים למחיקה ונשמרים ביומן הביקורת."
      footer={<><Button onClick={() => f.description.trim().length < 2 ? setErr("יש לתאר את האירוע") :
        save.mutate({ ...f, occurred_at: localInputToIso(f.occurred_at) })} loading={save.isPending}>רישום</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button></>}>
      <div className="grid grid-cols-1 gap-4">
        <Field label="סוג אירוע">
          <Select value={f.event_type} onChange={set("event_type")}>
            {Object.entries(CUSTODY_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="תיאור" required error={err}><Textarea value={f.description} onChange={set("description")} /></Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="מסר"><Input value={f.from_party} onChange={set("from_party")} /></Field>
          <Field label="מקבל"><Input value={f.to_party} onChange={set("to_party")} /></Field>
          <Field label="מיקום"><Input value={f.location} onChange={set("location")} /></Field>
          <Field label="מועד" hint="ריק = עכשיו"><Input type="datetime-local" value={f.occurred_at} onChange={set("occurred_at")} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function ExhibitCard({ ex, editable }: { ex: Exhibit; editable: boolean }) {
  const [edit, setEdit] = useState(false);
  const [cust, setCust] = useState(false);
  const [run, setRun] = useState(false);
  const custody = useQuery({ queryKey: ["custody", String(ex.id)], queryFn: () => api<Custody[]>(`/api/exhibits/${ex.id}/custody`) });
  return (
    <Card>
      <CardHeader title={<>מוצג <bdi dir="ltr">{ex.identifier}</bdi> – {ex.label}</>} icon={<HardDrive />}
        subtitle={`${EXHIBIT_TYPE[ex.exhibit_type]} · ${ex.media_count} קבצי מדיה`}
        actions={<>
          <Badge tone={ex.status === "processing" ? "blue" : ex.status === "processed" ? "green" : "gray"}>{EXHIBIT_STATUS[ex.status]}</Badge>
          {editable && <Button size="sm" variant="ghost" onClick={() => setEdit(true)} aria-label="עריכת מוצג"><Pencil /></Button>}
        </>} />
      <CardBody className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KV label="התקן מקור">{ex.source_device}</KV><KV label="מיקום">{ex.location}</KV>
          <KV label="שיטת רכישה">{ex.acquisition_method}</KV><KV label="נרכש">{fmtDateTime(ex.acquired_at)}</KV>
          <KV label="נרכש על ידי">{ex.acquired_by?.full_name}</KV><KV label="אסמכתת אחסון">{ex.storage_reference}</KV>
        </dl>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">מקורות ראיות מורשים (קריאה בלבד)</h3>
            {editable && <Button size="sm" variant="outline" asChild>
              <Link to={`/media?case=${ex.case_id}&exhibit=${ex.id}&action=source`}><Plus />הוספת מקור</Link></Button>}
          </div>
          {!ex.sources.length ? <p className="text-sm text-ink-3">טרם אושר מקור לסריקה.</p> : (
            <ul className="space-y-2">
              {ex.sources.map((s) => (
                <li key={s.id} className="rounded-lg border border-line/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 font-medium">{s.label}<Badge>{SOURCE_KIND[s.kind]}</Badge></div>
                  <Ltr mono className="block break-all text-xs text-ink-3">{s.path}</Ltr>
                  <div className="mt-1 text-xs text-ink-3">אסמכתה: {s.authorization_note || "—"} · {s.last_scanned_at
                    ? <>נסרק {fmtDateTime(s.last_scanned_at)} · {s.file_count} קבצים · <Ltr>{fmtBytes(s.total_bytes)}</Ltr></> : "טרם נסרק"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">שרשרת משמורת</h3>
            {editable && <Button size="sm" variant="ghost" onClick={() => setCust(true)}><Plus />רישום אירוע</Button>}
          </div>
          <ol className="relative space-y-3 border-s border-line/70 ps-5">
            {custody.data?.map((c) => (
              <li key={c.id} className="relative text-sm">
                <span className="absolute -start-[25px] top-1.5 size-2.5 rounded-full bg-accent ring-4 ring-card" />
                <div className="flex flex-wrap items-center gap-2"><b>{CUSTODY_TYPE[c.event_type]}</b>
                  <span className="text-xs text-ink-3">{fmtDateTime(c.occurred_at)}</span>
                  {c.job_id && <Link className="text-xs text-accent" to={`/automation?job=${c.job_id}`}>משימה #{c.job_id}</Link>}</div>
                <p className="text-ink-2">{c.description}</p>
                <p className="text-xs text-ink-3">{[c.from_party && `מסר: ${c.from_party}`, c.to_party && `מקבל: ${c.to_party}`,
                  c.recorded_by && `נרשם: ${c.recorded_by.full_name}`].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ol>
        </div>
        {editable && ex.sources.length > 0 && (
          <Button size="sm" onClick={() => setRun(true)}><Play />הפעלת תהליך על המוצג</Button>
        )}
      </CardBody>
      {editable && <>
        <ExhibitDialog open={edit} onOpenChange={setEdit} caseId={ex.case_id} existing={ex} />
        <CustodyDialog open={cust} onOpenChange={setCust} exhibit={ex} />
        <StartWorkflowDialog open={run} onOpenChange={setRun} caseId={ex.case_id} exhibitId={ex.id} />
      </>}
    </Card>
  );
}

export default function CaseDetailPage() {
  const id = Number(useParams().id);
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") ?? "exhibits";
  const { user, can } = useAuth();
  const c = useCase(id);
  const exhibits = useExhibits(id);
  const media = useQuery({ queryKey: ["media", "case", id], queryFn: () => api<Media[]>(`/api/media?case_id=${id}`), enabled: tab === "media" });
  const jobs = useQuery({ queryKey: ["jobs", "case", id], queryFn: () => api<Job[]>(`/api/jobs?case_id=${id}`), enabled: tab === "jobs" });
  const reports = useQuery({ queryKey: ["reports", "case", id], queryFn: () => api<Report[]>(`/api/reports?case_id=${id}`), enabled: tab === "reports" });
  const audit = useQuery({ queryKey: ["audit", "case", id], queryFn: () => api<AuditEvent[]>(`/api/audit?entity_type=case&entity_id=${id}`), enabled: tab === "audit" });
  const [dlg, setDlg] = useState<null | "edit" | "exhibit" | "archive" | "run" | "report">(null);
  const archive = useAction(() => api(`/api/cases/${id}/${c.data?.status === "archived" ? "restore" : "archive"}`, { method: "POST" }), {
    success: c.data?.status === "archived" ? "התיק שוחזר" : "התיק הועבר לארכיון", invalidate: [["case"], ["cases"]],
    onSuccess: () => setDlg(null),
  });

  if (c.isLoading) return <Loading />;
  if (c.isError || !c.data) return <ErrorState error={c.error} />;
  const cs = c.data;
  const editable = can("admin") || (can("investigator") && cs.status !== "archived" && (!cs.assigned_to || cs.assigned_to.id === user?.id));

  return (
    <div className="space-y-5">
      <Link to="/cases" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-accent"><ArrowRight className="size-4" />חזרה לתיקים</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl md:text-[28px] font-extrabold">
            <FolderOpen className="size-7 text-accent" />תיק <bdi dir="ltr">{cs.reference}</bdi>
            <CaseStatusBadge status={cs.status} /><PriorityBadge priority={cs.priority} />
          </h1>
          <p className="mt-1 text-lg text-ink-2">{cs.title}</p>
          {cs.is_demo && <p className="mt-1 text-xs text-warn">נתוני הדגמה בדויים</p>}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDlg("run")}><Play />הפעלת תהליך</Button>
            <Button variant="secondary" onClick={() => setDlg("report")}><FileText />הפקת דוח</Button>
            <Button variant="secondary" onClick={() => setDlg("edit")}><Pencil />עריכה</Button>
            <Button variant="ghost" onClick={() => setDlg("archive")}>{cs.status === "archived" ? <><ArchiveRestore />שחזור</> : <><Archive />העברה לארכיון</>}</Button>
          </div>
        )}
      </div>
      <Card className="p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KV label="חוקר אחראי">{cs.assigned_to?.full_name}</KV>
          <KV label="נפתח">{fmtDateTime(cs.opened_at)}</KV>
          <KV label="מועד אירוע">{fmtDateTime(cs.incident_date)}</KV>
          <KV label="תאריך יעד">{fmtDateTime(cs.due_date)}</KV>
          <div className="sm:col-span-2 lg:col-span-4"><KV label="תיאור">{cs.description}</KV></div>
          {cs.notes && <div className="sm:col-span-2 lg:col-span-4"><KV label="הערות">{cs.notes}</KV></div>}
        </dl>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })} tabs={[
        { value: "exhibits", label: `מוצגים (${cs.exhibit_count})` }, { value: "media", label: `מדיה (${cs.media_count})` },
        { value: "timeline", label: "ציר זמן" }, { value: "jobs", label: "משימות" }, { value: "reports", label: "דוחות" },
        { value: "audit", label: "ביקורת" },
      ]}>
        <TabPanel value="exhibits" className="space-y-4">
          {editable && <Button variant="outline" onClick={() => setDlg("exhibit")}><FilePlus2 />הוספת מוצג</Button>}
          {exhibits.isLoading ? <Loading /> : !exhibits.data?.length
            ? <EmptyState title="אין מוצגים בתיק" description="הוסיפו מוצג כדי לרשום מקור ראיות ושרשרת משמורת." />
            : exhibits.data.map((ex) => <ExhibitCard key={ex.id} ex={ex} editable={editable} />)}
        </TabPanel>
        <TabPanel value="media">
          <Card>{media.isLoading ? <Loading /> : !media.data?.length
            ? <EmptyState title="אין קבצי מדיה" description="סרקו מקור ראיות מורשה כדי לבנות מלאי מדיה." />
            : <MediaTable items={media.data} />}</Card>
        </TabPanel>
        <TabPanel value="timeline"><Card className="p-5"><TimelineView caseId={id} /></Card></TabPanel>
        <TabPanel value="jobs"><Card>{jobs.isLoading ? <Loading /> : <JobsList jobs={jobs.data ?? []} />}</Card></TabPanel>
        <TabPanel value="reports">
          <Card>{reports.isLoading ? <Loading /> : !reports.data?.length
            ? <EmptyState icon={<ScrollText />} title="אין דוחות" action={editable && <Button onClick={() => setDlg("report")}><FileText />הפקת דוח</Button>} />
            : (
              <Table><thead><tr><Th>#</Th><Th>כותרת</Th><Th>סטטוס</Th><Th>גרסה</Th><Th>עודכן</Th></tr></thead>
                <tbody>{reports.data.map((r) => (
                  <Tr key={r.id}><Td>{r.id}</Td><Td><Link className="text-accent hover:underline" to={`/reports/${r.id}`}>{r.title}</Link></Td>
                    <Td><ReportStatusBadge status={r.status} /></Td><Td className="tabular">{r.current_revision}</Td><Td>{fmtDateTime(r.updated_at)}</Td></Tr>
                ))}</tbody></Table>
            )}</Card>
        </TabPanel>
        <TabPanel value="audit">
          <Card>{audit.isLoading ? <Loading /> : !audit.data?.length ? <EmptyState icon={<ListChecks />} title="אין רשומות" /> : (
            <Table><thead><tr><Th>זמן</Th><Th>משתמש</Th><Th>פעולה</Th></tr></thead>
              <tbody>{audit.data.map((a) => <Tr key={a.id}><Td className="whitespace-nowrap">{fmtDateTime(a.created_at, true)}</Td><Td>{a.actor}</Td><Td>{a.summary}</Td></Tr>)}</tbody></Table>
          )}</Card>
        </TabPanel>
      </Tabs>

      <CaseFormDialog open={dlg === "edit"} onOpenChange={(o) => setDlg(o ? "edit" : null)} existing={cs} />
      <ExhibitDialog open={dlg === "exhibit"} onOpenChange={(o) => setDlg(o ? "exhibit" : null)} caseId={id} />
      <StartWorkflowDialog open={dlg === "run"} onOpenChange={(o) => setDlg(o ? "run" : null)} caseId={id} />
      <StartWorkflowDialog open={dlg === "report"} onOpenChange={(o) => setDlg(o ? "report" : null)} caseId={id} workflow="report" />
      <ConfirmDialog open={dlg === "archive"} onOpenChange={(o) => setDlg(o ? "archive" : null)} loading={archive.isPending}
        title={cs.status === "archived" ? "שחזור תיק מהארכיון" : "העברת תיק לארכיון"} danger={cs.status !== "archived"}
        description={cs.status === "archived" ? "התיק יחזור לסטטוס 'פתוח' ויהיה ניתן לעריכה." :
          "תיק בארכיון אינו ניתן לעריכה ואינו מוצג ברשימות ברירת המחדל. הנתונים, המוצגים והתיעוד נשמרים במלואם."}
        confirmLabel={cs.status === "archived" ? "שחזור" : "העברה לארכיון"} onConfirm={() => archive.mutate(undefined)} />
    </div>
  );
}
