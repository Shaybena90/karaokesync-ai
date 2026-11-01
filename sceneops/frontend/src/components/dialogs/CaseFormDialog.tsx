import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAction, useUsers } from "@/lib/queries";
import { isoToLocalInput, localInputToIso } from "@/lib/format";
import { CASE_STATUS, PRIORITY } from "@/lib/labels";
import type { Case } from "@/lib/types";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/form";

const EMPTY = { reference: "", title: "", description: "", status: "open", priority: "medium", assigned_to_id: "",
  incident_date: "", due_date: "", notes: "" };

export function CaseFormDialog({ open, onOpenChange, existing }: {
  open: boolean; onOpenChange: (o: boolean) => void; existing?: Case;
}) {
  const nav = useNavigate();
  const users = useUsers();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(existing ? {
      reference: existing.reference, title: existing.title, description: existing.description, status: existing.status,
      priority: existing.priority, assigned_to_id: existing.assigned_to ? String(existing.assigned_to.id) : "",
      incident_date: isoToLocalInput(existing.incident_date), due_date: isoToLocalInput(existing.due_date), notes: existing.notes,
    } : EMPTY);
  }, [open, existing]);

  const save = useAction(
    (body: Record<string, unknown>) => existing
      ? api<Case>(`/api/cases/${existing.id}`, { method: "PATCH", json: body })
      : api<Case>("/api/cases", { method: "POST", json: body }),
    {
      success: existing ? "התיק עודכן" : "התיק נפתח בהצלחה", invalidate: [["cases"], ["case"]],
      onSuccess: (c) => { onOpenChange(false); if (!existing) nav(`/cases/${c.id}`); },
    },
  );

  function submit() {
    const e: Record<string, string> = {};
    if (!existing && !/^[0-9A-Za-z֐-׿/_-]{3,32}$/.test(f.reference.trim()))
      e.reference = "מספר תיק: 3–32 תווים (ספרות, אותיות, / _ -)";
    if (f.title.trim().length < 2) e.title = "יש להזין כותרת (לפחות 2 תווים)";
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: Record<string, unknown> = {
      title: f.title.trim(), description: f.description, status: f.status, priority: f.priority, notes: f.notes,
      assigned_to_id: f.assigned_to_id ? Number(f.assigned_to_id) : null,
      incident_date: localInputToIso(f.incident_date), due_date: localInputToIso(f.due_date),
    };
    if (!existing) body.reference = f.reference.trim();
    save.mutate(body);
  }

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={existing ? `עריכת תיק ${existing.reference}` : "פתיחת תיק חדש"}
      description="פרטי התיק נשמרים במסד הנתונים המקומי ומתועדים ביומן הביקורת."
      footer={<><Button onClick={submit} loading={save.isPending}>{existing ? "שמירת שינויים" : "פתיחת התיק"}</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button></>}>
      <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="מספר תיק" required error={errors.reference} hint="לדוגמה: 4590/25">
          <Input value={f.reference} onChange={set("reference")} disabled={!!existing} dir="ltr" className="text-start" />
        </Field>
        <Field label="כותרת" required error={errors.title}>
          <Input value={f.title} onChange={set("title")} placeholder="תיאור קצר של האירוע" />
        </Field>
        <Field label="תיאור" className="md:col-span-2"><Textarea value={f.description} onChange={set("description")} /></Field>
        <Field label="סטטוס">
          <Select value={f.status} onChange={set("status")}>
            {Object.entries(CASE_STATUS).filter(([k]) => k !== "archived").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="עדיפות">
          <Select value={f.priority} onChange={set("priority")}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="חוקר אחראי" hint="ברירת מחדל: המשתמש הנוכחי">
          <Select value={f.assigned_to_id} onChange={set("assigned_to_id")}>
            <option value="">— אני —</option>
            {users.data?.filter((u) => u.role !== "viewer" && u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
        </Field>
        <Field label="מועד האירוע"><Input type="datetime-local" value={f.incident_date} onChange={set("incident_date")} /></Field>
        <Field label="תאריך יעד"><Input type="datetime-local" value={f.due_date} onChange={set("due_date")} /></Field>
        <Field label="הערות" className="md:col-span-2"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      </form>
    </Dialog>
  );
}
