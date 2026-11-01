import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, FileDown, FileText, History, RefreshCw, Send, XCircle } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction } from "@/lib/queries";
import { fmtDateTime, shortHash } from "@/lib/format";
import type { Job, ReportDetail } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { ErrorState, KV, Loading, Ltr } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ReportStatusBadge } from "@/components/StatusBadge";

export default function ReportDetailPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { user, can } = useAuth();
  const q = useQuery({ queryKey: ["reports", "detail", id], queryFn: () => api<ReportDetail>(`/api/reports/${id}`) });
  const [decision, setDecision] = useState<null | "approved" | "rejected">(null);
  const [comment, setComment] = useState("");
  const [regen, setRegen] = useState(false);
  const submit = useAction(() => api(`/api/reports/${id}/submit`, { method: "POST" }), { success: "הדוח הוגש לבדיקה", invalidate: [["reports"]] });
  const decide = useAction((b: { decision: string; comment: string }) => api(`/api/reports/${id}/decision`, { method: "POST", json: b }), {
    success: (r: any) => (r.status === "approved" ? "הדוח אושר – נוצרה גרסה מאושרת חתומה" : "הדוח נדחה"), invalidate: [["reports"]],
    onSuccess: () => { setDecision(null); setComment(""); },
  });
  const regenerate = useAction(() => api<Job>(`/api/reports/${id}/regenerate`, { method: "POST" }), {
    success: (j) => `הפקת גרסה חדשה נוספה לתור (משימה #${j.id})`, invalidate: [["jobs"]],
    onSuccess: (j) => nav(`/automation?job=${j.id}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const r = q.data;
  const c = r.content ?? {};
  const cur = r.revisions.find((x) => x.revision === r.current_revision);
  const ownRevision = cur?.created_by_id === user?.id && !can("admin");

  return (
    <div className="space-y-5">
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-accent"><ArrowRight className="size-4" />חזרה לדוחות</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold"><FileText className="size-7 text-accent" />{r.title}<ReportStatusBadge status={r.status} /></h1>
          <p className="mt-1 text-ink-2">תיק <Link className="text-accent" to={`/cases/${r.case_id}`}><bdi dir="ltr">{r.case_reference}</bdi></Link> · גרסה {r.current_revision}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cur && <>
            <Button variant="secondary" asChild><a href={fileUrl(`/api/reports/${id}/download/${cur.revision}/pdf`)} target="_blank" rel="noreferrer"><FileDown />PDF</a></Button>
            <Button variant="secondary" asChild><a href={fileUrl(`/api/reports/${id}/download/${cur.revision}/docx`)}><FileDown />DOCX</a></Button>
          </>}
          {can("investigator") && ["draft", "rejected"].includes(r.status) && <Button onClick={() => submit.mutate(undefined)} loading={submit.isPending}><Send />הגשה לבדיקה</Button>}
          {can("investigator") && r.status === "in_review" && <>
            <Button variant="success" onClick={() => setDecision("approved")} disabled={ownRevision} title={ownRevision ? "לא ניתן לאשר גרסה שהפקתם" : ""}><CheckCircle2 />אישור</Button>
            <Button variant="danger" onClick={() => setDecision("rejected")} disabled={ownRevision}><XCircle />דחייה</Button>
          </>}
          {can("investigator") && <Button variant="ghost" onClick={() => setRegen(true)}><RefreshCw />גרסה חדשה</Button>}
        </div>
      </div>
      {ownRevision && r.status === "in_review" && <p className="text-sm text-warn">אישור הדוח דורש בודק אחר או מנהל מערכת (הפרדת סמכויות).</p>}
      {r.status !== "approved" && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-ink-2">טיוטה – הדוח טרם נבדק ואושר על ידי חוקר מורשה. קבצי הטיוטה מסומנים בסימן מים "טיוטה".</p>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="תצוגת תוכן הגרסה הנוכחית" icon={<FileText />} subtitle={c.generated_at ? `הופק ${c.generated_at}` : undefined} />
          <CardBody className="space-y-5">
            {c.case && (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KV label="מספר תיק"><Ltr>{c.case.reference}</Ltr></KV><KV label="חוקר אחראי">{c.case.investigator}</KV>
                <KV label="סטטוס">{c.case.status}</KV><KV label="מוצגים">{c.summary?.exhibits}</KV>
                <KV label="קבצי מדיה">{c.summary?.media}</KV><KV label="עותקים מאומתים">{c.summary?.verified}</KV>
              </dl>
            )}
            {!!c.media?.length && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">ערכי SHA-256</h3>
                <Table><thead><tr><Th>קובץ</Th><Th>מקור</Th><Th>עותק עבודה</Th><Th>אומת</Th></tr></thead>
                  <tbody>{c.media.map((m: any, i: number) => (
                    <Tr key={i}><Td><Ltr className="text-xs">{m.path}</Ltr></Td><Td><Ltr mono className="text-xs">{shortHash(m.source_sha256, 10)}</Ltr></Td>
                      <Td><Ltr mono className="text-xs">{shortHash(m.wc_sha256, 10)}</Ltr></Td><Td>{m.verified ? "כן" : "לא"}</Td></Tr>
                  ))}</tbody></Table>
              </div>
            )}
            {!!c.findings?.length && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">ממצאים הדורשים בדיקה ({c.findings.length})</h3>
                <p className="mb-2 text-xs text-ink-3">הממצאים הופקו אלגוריתמית ואינם קביעה עובדתית.</p>
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                  {c.findings.map((f: any, i: number) => <li key={i} className="rounded border border-line/50 px-2 py-1"><b>{f.kind}</b> · <Ltr>{f.camera}</Ltr> · <Ltr>{f.start}</Ltr> — {f.description} <span className="text-ink-3">({f.review})</span></li>)}
                </ul>
              </div>
            )}
            {!!c.errors?.length && (
              <div><h3 className="mb-1 text-sm font-semibold">שגיאות ואזהרות</h3>
                <ul className="list-disc ps-5 text-sm text-ink-2">{c.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></div>
            )}
            {c.tools && <div><h3 className="mb-1 text-sm font-semibold">כלים וגרסאות</h3>
              <p className="text-xs text-ink-3" dir="ltr">{Object.entries(c.tools).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p></div>}
            {c.disclaimer && <p className="text-xs text-ink-3">{c.disclaimer}</p>}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="גרסאות" icon={<History />} />
            <CardBody className="space-y-3">
              {[...r.revisions].reverse().map((v) => (
                <div key={v.id} className="rounded-lg border border-line/60 p-3 text-sm">
                  <div className="flex items-center justify-between"><b>גרסה {v.revision}</b><span className="text-xs text-ink-3">{fmtDateTime(v.created_at)}</span></div>
                  {v.change_note && <p className="text-xs text-ink-3">{v.change_note}</p>}
                  <p className="mt-1 text-[11px] text-ink-3">PDF SHA-256: <Ltr mono>{shortHash(v.pdf_sha256, 10)}</Ltr></p>
                  <div className="mt-2 flex gap-2">
                    <a className="text-xs text-accent hover:underline" href={fileUrl(`/api/reports/${id}/download/${v.revision}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
                    <a className="text-xs text-accent hover:underline" href={fileUrl(`/api/reports/${id}/download/${v.revision}/docx`)}>DOCX</a>
                    {v.job_id && <Link className="text-xs text-ink-3 hover:text-accent" to={`/automation?job=${v.job_id}`}>משימה #{v.job_id}</Link>}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="היסטוריית אישורים" icon={<CheckCircle2 />} />
            <CardBody>
              {!r.approvals.length ? <p className="text-sm text-ink-3">טרם התקבלה החלטה.</p> : (
                <ul className="space-y-2 text-sm">{r.approvals.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line/60 p-3">
                    <b className={a.decision === "approved" ? "text-ok" : "text-danger"}>{a.decision === "approved" ? "אושר" : "נדחה"}</b> · גרסה {a.revision} · {a.user.full_name}
                    <div className="text-xs text-ink-3">{fmtDateTime(a.created_at)}</div>{a.comment && <p className="mt-1 text-ink-2">{a.comment}</p>}
                  </li>))}</ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)} title={decision === "approved" ? "אישור הדוח" : "דחיית הדוח"}
        description={decision === "approved" ? "האישור יתועד ותיווצר גרסה מאושרת של קבצי PDF ו-DOCX ללא סימן המים." : "יש לפרט את סיבת הדחייה. ניתן להפיק גרסה מתוקנת לאחר מכן."}
        footer={<><Button variant={decision === "approved" ? "success" : "danger"} loading={decide.isPending}
          onClick={() => decision && decide.mutate({ decision, comment })}>{decision === "approved" ? "אישור סופי" : "דחייה"}</Button>
          <Button variant="secondary" onClick={() => setDecision(null)}>ביטול</Button></>}>
        <Field label="הערת בודק" required={decision === "rejected"}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Dialog>
      <ConfirmDialog open={regen} onOpenChange={setRegen} title="הפקת גרסה חדשה" loading={regenerate.isPending}
        description="תופק גרסה חדשה מהנתונים העדכניים בתיק. הדוח יחזור לסטטוס טיוטה ויידרש אישור מחדש. הגרסאות הקודמות נשמרות."
        confirmLabel="הפקה" onConfirm={() => { setRegen(false); regenerate.mutate(undefined); }} />
    </div>
  );
}
