import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListChecks } from "lucide-react";
import { startJob, useAction, useCases, useExhibits, useWorkflows } from "@/lib/queries";
import { fmtBytes } from "@/lib/format";
import { SOURCE_KIND } from "@/lib/labels";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Field, Input, Select } from "../ui/form";
import { Ltr } from "../ui/misc";

export function StartWorkflowDialog({ open, onOpenChange, workflow: fixed, caseId: initCase, exhibitId: initEx }: {
  open: boolean; onOpenChange: (o: boolean) => void; workflow?: string; caseId?: number; exhibitId?: number;
}) {
  const nav = useNavigate();
  const wfs = useWorkflows();
  const cases = useCases();
  const [wf, setWf] = useState(fixed ?? "full_media");
  const [caseId, setCaseId] = useState<number | undefined>(initCase);
  const [exId, setExId] = useState<number | undefined>(initEx);
  const [srcId, setSrcId] = useState<number | undefined>();
  const [title, setTitle] = useState("דוח עיבוד מדיה");
  const exhibits = useExhibits(caseId);
  useEffect(() => {
    if (open) {
      setWf(fixed ?? "full_media");
      setCaseId(initCase);
      setExId(initEx);
      setSrcId(undefined);
    }
  }, [open, fixed, initCase, initEx]);
  const def = wfs.data?.find((w) => w.key === wf);
  const ex = exhibits.data?.find((e) => e.id === exId);
  const sources = ex?.sources ?? [];
  useEffect(() => { if (sources.length === 1) setSrcId(sources[0].id); }, [exId, sources.length]); // eslint-disable-line

  const run = useAction(startJob, {
    success: (j) => `המשימה #${j.id} נוספה לתור`, invalidate: [["jobs"]],
    onSuccess: (j) => { onOpenChange(false); nav(`/automation?job=${j.id}`); },
  });

  const missing = useMemo(() => {
    if (!def) return "בחרו תהליך";
    if (!caseId) return "בחרו תיק";
    if (def.scope === "exhibit" && !exId) return "בחרו מוצג";
    if (def.scope === "source" && !srcId) return "בחרו מקור ראיות מורשה";
    return null;
  }, [def, caseId, exId, srcId]);

  const submit = () => {
    if (missing || !def) return;
    const body: Record<string, unknown> = { workflow: def.key, case_id: caseId };
    if (def.scope !== "case" && exId) body.exhibit_id = exId;
    if (def.scope === "source") body.source_id = srcId;
    if (def.key === "report") body.report_title = title;
    run.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={def ? `הפעלת תהליך: ${def.name}` : "הפעלת תהליך"}
      description={def?.description}
      footer={<><Button onClick={submit} disabled={!!missing} loading={run.isPending}><ListChecks />הוספה לתור</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button>
        {missing && <span className="text-sm text-ink-3">{missing}</span>}</>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {!fixed && (
          <Field label="תהליך עבודה" className="md:col-span-2">
            <Select value={wf} onChange={(e) => setWf(e.target.value)}>
              {wfs.data?.filter((w) => w.scope !== "camera").map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="תיק" required>
          <Select value={caseId ?? ""} onChange={(e) => { setCaseId(Number(e.target.value) || undefined); setExId(undefined); setSrcId(undefined); }}>
            <option value="">— בחרו תיק —</option>
            {cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference} · {c.title}</option>)}
          </Select>
        </Field>
        {def && def.scope !== "case" && (
          <Field label="מוצג" required>
            <Select value={exId ?? ""} onChange={(e) => { setExId(Number(e.target.value) || undefined); setSrcId(undefined); }}
              disabled={!caseId}>
              <option value="">— בחרו מוצג —</option>
              {exhibits.data?.map((e) => <option key={e.id} value={e.id}>מוצג {e.identifier} · {e.label}</option>)}
            </Select>
          </Field>
        )}
        {def?.scope === "source" && exId && (
          <div className="md:col-span-2 space-y-2">
            <p className="text-sm font-medium text-ink-2">מקור ראיות מורשה (קריאה בלבד)</p>
            {sources.length === 0 ? (
              <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm text-ink-2">
                למוצג זה עדיין לא אושר מקור. יש לבחור תיקייה או כונן מורשה ב
                <Link className="text-accent hover:underline mx-1" to={`/media?case=${caseId}&exhibit=${exId}&action=source`}
                  onClick={() => onOpenChange(false)}>מעבדת המדיה</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="מקור ראיות">
                {sources.map((s) => (
                  <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${srcId === s.id ? "border-accent bg-accent/10" : "border-line"}`}>
                    <input type="radio" name="src" checked={srcId === s.id} onChange={() => setSrcId(s.id)} className="mt-1 accent-[#319BFF]" />
                    <div className="min-w-0 text-sm">
                      <div className="font-medium">{s.label} <span className="text-ink-3">· {SOURCE_KIND[s.kind]}</span></div>
                      <Ltr mono className="block truncate text-ink-3">{s.path}</Ltr>
                      {s.last_scanned_at && <div className="text-xs text-ink-3">{s.file_count} קבצים · <Ltr>{fmtBytes(s.total_bytes)}</Ltr></div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {def?.key === "report" && (
          <Field label="כותרת הדוח" className="md:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        )}
        {def && (
          <div className="md:col-span-2 rounded-lg border border-line/70 bg-[#0c1b2e] p-3">
            <p className="mb-2 text-xs font-semibold text-ink-3">שלבי התהליך</p>
            <ol className="flex flex-wrap gap-1.5 text-xs">
              {def.steps.map((s, i) => (
                <li key={s.key} className="rounded-md border border-line/70 px-2 py-1 text-ink-2">{i + 1}. {s.name}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Dialog>
  );
}
