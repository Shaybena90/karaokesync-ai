import { useEffect, useState } from "react";
import { Cctv, Download, Info, Pencil, PlugZap, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction, useCameras, useCases } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import { ADAPTER, CAMERA_STATUS } from "@/lib/labels";
import type { Camera } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, ErrorState, Loading, Ltr, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { CameraTestDialog, ExportDialog } from "@/components/dialogs/CameraDialogs";

function fmtOffset(s: number) {
  if (!s) return "0 שנ׳";
  const sign = s > 0 ? "+" : "−";
  const a = Math.abs(s);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")} דק׳`;
}

function CameraForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: Camera }) {
  const cases = useCases();
  const empty = { name: "", vendor: "", model: "", device_type: "DVR", endpoint: "", location: "", timezone: "Asia/Jerusalem",
    clock_offset_seconds: "0", adapter: "simulated", authorization_ref: "", credential_ref: "", case_id: "", notes: "", channels: "8" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(existing ? { ...empty, ...existing, clock_offset_seconds: String(existing.clock_offset_seconds),
      case_id: existing.case_id ? String(existing.case_id) : "", channels: String(existing.channels.length) } as typeof empty : empty);
  }, [open, existing]); // eslint-disable-line
  const save = useAction((b: Record<string, unknown>) => existing
    ? api(`/api/cameras/${existing.id}`, { method: "PATCH", json: b }) : api("/api/cameras", { method: "POST", json: b }), {
    success: existing ? "המכשיר עודכן" : "המכשיר נרשם", invalidate: [["cameras"]], onSuccess: () => onOpenChange(false),
  });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!existing && f.name.trim().length < 2) e.name = "יש להזין שם מכשיר";
    if (f.endpoint && /[\s*;|&`$<>]/.test(f.endpoint)) e.endpoint = "כתובת אחת בלבד, ללא טווחים או תווים מיוחדים";
    const n = Number(f.channels);
    if (!Number.isInteger(n) || n < 1 || n > 64) e.channels = "מספר ערוצים בין 1 ל-64";
    if (!Number.isInteger(Number(f.clock_offset_seconds))) e.clock = "היסט בשניות (מספר שלם)";
    setErr(e);
    if (Object.keys(e).length) return;
    const prev = existing?.channels ?? [];
    const channels = Array.from({ length: n }, (_, i) => prev[i] ?? { number: i + 1, name: `מצלמה ${String(i + 1).padStart(2, "0")}`, enabled: true, resolution: "" })
      .map(({ number, name, enabled, resolution }) => ({ number, name, enabled, resolution }));
    const body: Record<string, unknown> = {
      vendor: f.vendor, model: f.model, endpoint: f.endpoint.trim(), location: f.location, timezone: f.timezone,
      clock_offset_seconds: Number(f.clock_offset_seconds), authorization_ref: f.authorization_ref, credential_ref: f.credential_ref,
      case_id: f.case_id ? Number(f.case_id) : null, notes: f.notes, channels,
    };
    if (!existing) Object.assign(body, { name: f.name.trim(), device_type: f.device_type, adapter: f.adapter });
    save.mutate(body);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={existing ? `עריכת מכשיר ${existing.name}` : "רישום מכשיר DVR/NVR"}
      description="יש להזין רק כתובת מכשיר מורשית אחת. המערכת אינה סורקת רשתות ואינה שומרת סיסמאות."
      footer={<><Button onClick={submit} loading={save.isPending}>שמירה</Button><Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="שם מכשיר" required error={err.name}><Input value={f.name} onChange={set("name")} disabled={!!existing} dir="ltr" className="text-start" placeholder="DVR-04" /></Field>
        <Field label="יצרן"><Input value={f.vendor} onChange={set("vendor")} dir="ltr" className="text-start" /></Field>
        <Field label="דגם"><Input value={f.model} onChange={set("model")} dir="ltr" className="text-start" /></Field>
        <Field label="סוג"><Select value={f.device_type} onChange={set("device_type")} disabled={!!existing}>
          <option value="DVR">DVR</option><option value="NVR">NVR</option><option value="IPC">מצלמת IP</option></Select></Field>
        <Field label="כתובת מורשית" error={err.endpoint} hint="IP או שם מארח יחיד"><Input value={f.endpoint} onChange={set("endpoint")} dir="ltr" className="text-start" placeholder="192.168.1.20" /></Field>
        <Field label="מיקום"><Input value={f.location} onChange={set("location")} /></Field>
        <Field label="אזור זמן"><Input value={f.timezone} onChange={set("timezone")} dir="ltr" className="text-start" /></Field>
        <Field label="היסט שעון נרשם (שניות)" error={err.clock} hint="שעון המכשיר פחות שעון אמת"><Input type="number" value={f.clock_offset_seconds} onChange={set("clock_offset_seconds")} /></Field>
        <Field label="מספר ערוצים" error={err.channels}><Input type="number" min={1} max={64} value={f.channels} onChange={set("channels")} /></Field>
        <Field label="מתאם"><Select value={f.adapter} onChange={set("adapter")} disabled={!!existing}>
          {Object.entries(ADAPTER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="אסמכתת הרשאה" hint="נדרשת לבדיקה ולייצוא"><Input value={f.authorization_ref} onChange={set("authorization_ref")} /></Field>
        <Field label="הפניה לפרטי גישה" hint="מיקום בכספת הארגונית – לא הסיסמה"><Input value={f.credential_ref} onChange={set("credential_ref")} /></Field>
        <Field label="תיק משויך"><Select value={f.case_id} onChange={set("case_id")}>
          <option value="">— ללא —</option>{cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}</Select></Field>
        <Field label="הערות" className="md:col-span-2"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}

export default function CamerasPage() {
  const { can } = useAuth();
  const cams = useCameras();
  const [form, setForm] = useState<{ open: boolean; cam?: Camera }>({ open: false });
  const [test, setTest] = useState<number | null>(null);
  const [exp, setExp] = useState<number | null>(null);
  const [del, setDel] = useState<Camera | null>(null);
  const remove = useAction((id: number) => api(`/api/cameras/${id}`, { method: "DELETE" }), {
    success: "המכשיר הוסר", invalidate: [["cameras"]], onSuccess: () => setDel(null),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="מצלמות (DVR/NVR)" icon={<Cctv />} subtitle="רישום מכשירים מורשים, בדיקת חיבור מדומה וייצוא הקלטות מתועד"
        actions={can("investigator") && <Button onClick={() => setForm({ open: true })}><Plus />רישום מכשיר</Button>} />
      <div className="flex gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm text-ink-2">
        <Info className="size-5 shrink-0 text-accent" />
        <div>
          <p>ב-MVP כל פעולות המכשיר <b className="text-warn">מדומות</b>: אין תעבורת רשת, אין סריקת רשתות, אין ניחוש פרטי גישה ואין עקיפת אימות.</p>
          <p className="mt-1 text-ink-3">ממשקי מתאם ל-ONVIF Profile G ול-SDK של יצרנים מוגדרים לשילוב עתידי מאושר בלבד. כל ייצוא דורש מכשיר, אסמכתת הרשאה, ערוצים, טווח זמן ויעד – ומתועד ביומן הביקורת.</p>
        </div>
      </div>
      <Card>
        {cams.isLoading ? <Loading /> : cams.isError ? <ErrorState error={cams.error} /> : !cams.data?.length ? (
          <EmptyState icon={<Cctv />} title="אין מכשירים רשומים" action={can("investigator") && <Button onClick={() => setForm({ open: true })}><Plus />רישום מכשיר</Button>} />
        ) : (
          <Table>
            <thead><tr><Th>מכשיר</Th><Th>כתובת מורשית</Th><Th>מיקום</Th><Th>ערוצים</Th><Th>היסט שעון</Th><Th>מתאם</Th><Th>הרשאה</Th><Th>מצב</Th><Th>בדיקה אחרונה</Th><Th><span className="sr-only">פעולות</span></Th></tr></thead>
            <tbody>
              {cams.data.map((c) => (
                <Tr key={c.id}>
                  <Td className="whitespace-nowrap"><div className="font-semibold"><Ltr>{c.name}</Ltr> <span className="text-xs text-ink-3">{c.device_type}</span></div>
                    <div className="text-xs text-ink-3"><Ltr>{c.vendor} {c.model}</Ltr></div></Td>
                  <Td><Ltr mono>{c.endpoint || "—"}</Ltr></Td>
                  <Td className="min-w-[140px]">{c.location}</Td>
                  <Td className="tabular">{c.channels.length}</Td>
                  <Td className="whitespace-nowrap"><Ltr>{fmtOffset(c.clock_offset_seconds)}</Ltr>
                    {c.clock_offset_recorded_at && <div className="text-[11px] text-ink-3">נרשם {fmtDateTime(c.clock_offset_recorded_at)}</div>}</Td>
                  <Td><Badge tone={c.adapter === "simulated" ? "amber" : "gray"}>{ADAPTER[c.adapter]}</Badge></Td>
                  <Td className="max-w-[200px]">{c.authorization_ref ? <span className="text-xs">{c.authorization_ref}</span> : <Badge tone="red">חסרה</Badge>}</Td>
                  <Td><Badge tone={c.status === "online" ? "green" : c.status === "unknown" ? "gray" : "red"}>{CAMERA_STATUS[c.status]}</Badge></Td>
                  <Td className="whitespace-nowrap text-xs text-ink-3" title={c.last_test_result}>{fmtDateTime(c.last_test_at)}</Td>
                  <Td>
                    {can("investigator") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setTest(c.id)} aria-label={`בדיקת חיבור ${c.name}`} title="בדיקת חיבור"><PlugZap /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setExp(c.id)} disabled={!c.authorization_ref || c.adapter !== "simulated"}
                          aria-label={`ייצוא הקלטות ${c.name}`} title={c.adapter !== "simulated" ? "מתאם זה טרם שולב" : !c.authorization_ref ? "חסרה אסמכתת הרשאה" : "ייצוא הקלטות"}><Download /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, cam: c })} aria-label={`עריכת ${c.name}`} title="עריכה"><Pencil /></Button>
                        {can("admin") && <Button size="sm" variant="ghost" onClick={() => setDel(c)} aria-label={`הסרת ${c.name}`} title="הסרה"><Trash2 className="text-danger" /></Button>}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <CameraForm open={form.open} onOpenChange={(o) => setForm({ open: o, cam: o ? form.cam : undefined })} existing={form.cam} />
      <CameraTestDialog open={test != null} onOpenChange={(o) => !o && setTest(null)} cameraId={test ?? undefined} />
      <ExportDialog open={exp != null} onOpenChange={(o) => !o && setExp(null)} cameraId={exp ?? undefined} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} danger loading={remove.isPending} title={`הסרת המכשיר ${del?.name ?? ""}`}
        description="הרישום יוסר מהמערכת. הקלטות שיוצאו, עותקי עבודה ותיעוד הביקורת יישמרו." confirmLabel="הסרה"
        onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}
