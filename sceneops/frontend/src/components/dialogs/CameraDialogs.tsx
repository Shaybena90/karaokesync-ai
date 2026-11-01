import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Download, PlugZap, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAction, useCameras, useCases, useExhibits } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import type { Camera, Job } from "@/lib/types";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Checkbox, Field, Input, Select } from "../ui/form";
import { Ltr, SimBadge } from "../ui/misc";

export function CameraTestDialog({ open, onOpenChange, cameraId }: {
  open: boolean; onOpenChange: (o: boolean) => void; cameraId?: number;
}) {
  const cams = useCameras();
  const [id, setId] = useState<number | undefined>(cameraId);
  const [result, setResult] = useState<Camera | null>(null);
  useEffect(() => { if (open) { setId(cameraId); setResult(null); } }, [open, cameraId]);
  const test = useAction((cid: number) => api<Camera>(`/api/cameras/${cid}/test`, { method: "POST" }), {
    invalidate: [["cameras"]], onSuccess: setResult,
  });
  const cam = cams.data?.find((c) => c.id === id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={<span className="flex items-center gap-2">בדיקת חיבור למכשיר <SimBadge /></span>}
      description="בדיקה מדומה בלבד – לא נשלחת תעבורת רשת למכשיר. אין סריקת רשת או ניחוש פרטי גישה."
      footer={<><Button onClick={() => id && test.mutate(id)} disabled={!id} loading={test.isPending}><PlugZap />בדיקת חיבור</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>סגירה</Button></>}>
      <div className="space-y-4">
        <Field label="מכשיר רשום" required>
          <Select value={id ?? ""} onChange={(e) => { setId(Number(e.target.value) || undefined); setResult(null); }}>
            <option value="">— בחרו מכשיר —</option>
            {cams.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.vendor} {c.model}</option>)}
          </Select>
        </Field>
        {cam && (
          <div className="rounded-lg border border-line/70 p-3 text-sm space-y-1">
            <div>כתובת מורשית: <Ltr mono>{cam.endpoint || "—"}</Ltr></div>
            <div>אסמכתת הרשאה: {cam.authorization_ref || <span className="text-warn">חסרה</span>}</div>
            <div>בדיקה אחרונה: {fmtDateTime(cam.last_test_at)}</div>
          </div>
        )}
        {result && (
          <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${result.status === "online" ? "border-ok/50 bg-ok/10" : "border-danger/50 bg-danger/10"}`}>
            {result.status === "online" ? <CheckCircle2 className="size-5 text-ok shrink-0" /> : <XCircle className="size-5 text-danger shrink-0" />}
            <span>{result.last_test_result}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function ExportDialog({ open, onOpenChange, cameraId }: {
  open: boolean; onOpenChange: (o: boolean) => void; cameraId?: number;
}) {
  const nav = useNavigate();
  const cams = useCameras();
  const cases = useCases();
  const [camId, setCamId] = useState<number | undefined>(cameraId);
  const [caseId, setCaseId] = useState<number | undefined>();
  const [exId, setExId] = useState<number | undefined>();
  const [channels, setChannels] = useState<number[]>([]);
  const [start, setStart] = useState("2025-01-25T22:00");
  const [end, setEnd] = useState("2025-01-25T22:02");
  const [auth, setAuth] = useState("");
  const [cred, setCred] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exhibits = useExhibits(caseId);
  const cam = cams.data?.find((c) => c.id === camId);
  useEffect(() => {
    if (open) { setCamId(cameraId); setChannels([]); setCred(false); setErr(null); }
  }, [open, cameraId]);
  useEffect(() => { if (cam) { setAuth(cam.authorization_ref); if (cam.case_id) setCaseId(cam.case_id); } }, [cam?.id]); // eslint-disable-line

  const run = useAction((body: Record<string, unknown>) => api<Job>(`/api/cameras/${camId}/export`, { method: "POST", json: body }), {
    success: (j) => `בקשת ייצוא (סימולציה) נוספה לתור – משימה #${j.id}`, invalidate: [["jobs"]],
    onSuccess: (j) => { onOpenChange(false); nav(`/automation?job=${j.id}`); },
  });

  function submit() {
    setErr(null);
    if (!camId) return setErr("יש לבחור מכשיר");
    if (!cam?.authorization_ref) return setErr("למכשיר אין אסמכתת הרשאה – לא ניתן לייצא");
    if (!exId) return setErr("יש לבחור תיק ומוצג יעד");
    if (!channels.length) return setErr("יש לבחור לפחות ערוץ אחד");
    if (!start || !end || end <= start) return setErr("זמן הסיום חייב להיות אחרי זמן ההתחלה");
    if (auth.trim().length < 3) return setErr("יש להזין אסמכתת הרשאה לייצוא");
    if (!cred) return setErr("יש לאשר שימוש בפרטי גישה מורשים");
    // הזמנים מתייחסים לשעון המכשיר ולכן נשלחים כפי שהוזנו
    run.mutate({ exhibit_id: exId, channels, start: `${start}:00`, end: `${end}:00`, authorization_ref: auth.trim(),
      credential_confirmed: cred, destination_note: "אחסון מקומי מאושר" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide
      title={<span className="flex items-center gap-2">ייצוא הקלטות ממכשיר <SimBadge /></span>}
      description="ב-MVP הייצוא מדומה: נוצרים קטעי וידאו סינתטיים המסומנים SIMULATED EXPORT, עם Hash, עותק עבודה ותיעוד מלא."
      footer={<><Button onClick={submit} loading={run.isPending}><Download />בקשת ייצוא</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button>
        {err && <span role="alert" className="text-sm text-danger">{err}</span>}</>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="מכשיר" required>
          <Select value={camId ?? ""} onChange={(e) => { setCamId(Number(e.target.value) || undefined); setChannels([]); }}>
            <option value="">— בחרו מכשיר —</option>
            {cams.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.location}{!c.authorization_ref ? " (ללא הרשאה)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="אסמכתת הרשאה לייצוא" required hint="מספר צו / טופס הסכמת בעל המערכת">
          <Input value={auth} onChange={(e) => setAuth(e.target.value)} />
        </Field>
        <Field label="תיק" required>
          <Select value={caseId ?? ""} onChange={(e) => { setCaseId(Number(e.target.value) || undefined); setExId(undefined); }}>
            <option value="">— בחרו תיק —</option>
            {cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference} · {c.title}</option>)}
          </Select>
        </Field>
        <Field label="מוצג יעד" required>
          <Select value={exId ?? ""} onChange={(e) => setExId(Number(e.target.value) || undefined)} disabled={!caseId}>
            <option value="">— בחרו מוצג —</option>
            {exhibits.data?.map((e) => <option key={e.id} value={e.id}>מוצג {e.identifier} · {e.label}</option>)}
          </Select>
        </Field>
        <Field label="מזמן (שעון המכשיר)" required><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="עד זמן (שעון המכשיר)" required><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-medium text-ink-2">ערוצים <span className="text-danger">*</span></legend>
          {!cam ? <p className="text-sm text-ink-3">בחרו מכשיר להצגת ערוצים</p> : (
            <div className="flex flex-wrap gap-2">
              {cam.channels.filter((c) => c.enabled).map((c) => {
                const on = channels.includes(c.number);
                return (
                  <button key={c.number} type="button" aria-pressed={on}
                    onClick={() => setChannels(on ? channels.filter((x) => x !== c.number) : [...channels, c.number])}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-2 hover:border-accent/50"}`}>
                    ערוץ {c.number}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="md:col-span-2 rounded-lg border border-line/70 bg-[#0c1b2e] p-3 space-y-2 text-sm">
          <p className="text-ink-2">יעד: אחסון מקומי מאושר (עותק עבודה מאומת). הבקשה תתועד ביומן הביקורת ובשרשרת המשמורת.</p>
          <Checkbox checked={cred} onChange={setCred}
            label="אני מאשר/ת שהגישה למכשיר מתבצעת בפרטי גישה מורשים ובהתאם לאסמכתת ההרשאה. פרטי הגישה אינם נשמרים במערכת." />
        </div>
      </div>
    </Dialog>
  );
}
