import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, CornerLeftUp, Film, Folder, HardDrive, Lock, Play, ScanLine, Search, ShieldCheck, Usb,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { startJob, useAction, useCases, useExhibits } from "@/lib/queries";
import { fmtBytes } from "@/lib/format";
import { MEDIA_TYPE } from "@/lib/labels";
import type { Job, Media, Source } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, Loading, Ltr, PageHeader } from "@/components/ui/misc";
import { Progress } from "@/components/ui/progress";
import { MediaTable } from "@/components/MediaTable";
import { JobStatusBadge } from "@/components/StatusBadge";

interface BrowseRes { path: string; parent: string | null; dirs: { name: string; path: string }[]; file_count: number; total_bytes: number }

function SourceWizard({ initCase, initExhibit, onDone }: { initCase?: number; initExhibit?: number; onDone: () => void }) {
  const nav = useNavigate();
  const cases = useCases();
  const [caseId, setCaseId] = useState<number | undefined>(initCase);
  const [exId, setExId] = useState<number | undefined>(initExhibit);
  const exhibits = useExhibits(caseId);
  const [path, setPath] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("folder");
  const [confirm, setConfirm] = useState(false);
  const [created, setCreated] = useState<Source | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const roots = useQuery({ queryKey: ["roots"], queryFn: () => api<{ path: string; exists: boolean }[]>("/api/media/roots") });
  const drives = useQuery({ queryKey: ["drives"], queryFn: () => api<{ path: string; type: string; removable: boolean; authorized: boolean }[]>("/api/media/drives") });
  const browse = useQuery({
    queryKey: ["browse", path], enabled: !!path,
    queryFn: () => api<BrowseRes>(`/api/media/browse?path=${encodeURIComponent(path!)}`),
  });

  const register = useAction((b: Record<string, unknown>) => api<Source>(`/api/exhibits/${exId}/sources`, { method: "POST", json: b }), {
    success: "המקור אושר ונרשם (קריאה בלבד)", invalidate: [["exhibits"]], onSuccess: setCreated,
  });
  const run = useAction(startJob, {
    success: (j) => `המשימה #${j.id} נוספה לתור`, invalidate: [["jobs"]],
    onSuccess: (j) => { onDone(); nav(`/automation?job=${j.id}`); },
  });

  const submit = () => {
    setErr(null);
    if (!exId) return setErr("יש לבחור תיק ומוצג");
    if (!browse.data) return setErr("יש לבחור תיקייה מתוך מקור מורשה");
    if (note.trim().length < 3) return setErr("יש להזין אסמכתת הרשאה (מספר צו / הסכמה)");
    if (!confirm) return setErr("יש לאשר שקיימת הרשאה מפורשת לגישה למקור");
    register.mutate({ path: browse.data.path, kind, label: browse.data.path.split(/[\\/]/).filter(Boolean).pop(),
      authorization_note: note.trim(), confirm_authorized: true });
  };

  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-ok/50 bg-ok/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-ok" />המקור נרשם בהצלחה</p>
          <Ltr mono className="mt-1 block break-all text-ink-2">{created.path}</Ltr>
          <p className="mt-1 text-ink-3">המקור ייקרא במצב קריאה בלבד. עותקי עבודה ייווצרו באחסון המאושר בלבד.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={run.isPending} onClick={() => run.mutate({ workflow: "drive_scan", source_id: created.id })}>
            <ScanLine />סריקת מלאי בלבד</Button>
          <Button loading={run.isPending} onClick={() => run.mutate({ workflow: "full_media", source_id: created.id })}>
            <Play />טיפול מלא (סריקה, Hash, עותק עבודה, אינדקס ודוח)</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm font-semibold text-ink-2">1. שיוך לתיק ומוצג</p>
        <Field label="תיק" required>
          <Select value={caseId ?? ""} onChange={(e) => { setCaseId(Number(e.target.value) || undefined); setExId(undefined); }}>
            <option value="">— בחרו תיק —</option>
            {cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference} · {c.title}</option>)}
          </Select>
        </Field>
        <Field label="מוצג" required>
          <Select value={exId ?? ""} onChange={(e) => setExId(Number(e.target.value) || undefined)} disabled={!caseId}>
            <option value="">— בחרו מוצג —</option>
            {exhibits.data?.map((e) => <option key={e.id} value={e.id}>מוצג {e.identifier} · {e.label}</option>)}
          </Select>
        </Field>
        <p className="pt-2 text-sm font-semibold text-ink-2">3. אישור הרשאה</p>
        <Field label="סוג מקור">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="folder">תיקייה מקומית</option><option value="removable_drive">כונן נשלף</option><option value="dvr_export">ייצוא DVR</option>
          </Select>
        </Field>
        <Field label="אסמכתת הרשאה" required hint="מספר צו, טופס הסכמה או אישור ממונה">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Checkbox checked={confirm} onChange={setConfirm}
          label="אני מאשר/ת שקיימת הרשאה מפורשת לגישה למקור זה, וכי הוא ייקרא במצב קריאה בלבד ללא שינוי." />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button onClick={submit} loading={register.isPending}><Lock />אישור ורישום המקור</Button>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink-2">2. בחירת תיקייה או כונן מורשה</p>
        <div className="rounded-lg border border-line/70 bg-[#0c1b2e] p-3 space-y-2">
          <p className="text-xs text-ink-3">ניתן לעיין רק בתוך נתיבים שאושרו על ידי מנהל המערכת (הגדרות › נתיבים מורשים).</p>
          {roots.data?.map((r) => (
            <button key={r.path} onClick={() => setPath(r.path)} disabled={!r.exists}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50">
              <ShieldCheck className="size-4 text-ok shrink-0" /><Ltr mono className="truncate">{r.path}</Ltr>
              {!r.exists && <span className="text-xs text-danger">לא נמצא</span>}
            </button>
          ))}
          {!!drives.data?.length && (
            <div className="border-t border-line/60 pt-2">
              <p className="mb-1 text-xs text-ink-3">כוננים שזוהו במחשב</p>
              {drives.data.map((d) => (
                <button key={d.path} onClick={() => d.authorized && setPath(d.path)} disabled={!d.authorized}
                  title={d.authorized ? "" : "כונן זה אינו מורשה – מנהל יכול לאשר אותו בהגדרות"}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
                  {d.removable ? <Usb className="size-4" /> : <HardDrive className="size-4" />}<Ltr mono>{d.path}</Ltr>
                  <span className="text-xs text-ink-3">{d.type}</span>
                  <Badge tone={d.authorized ? "green" : "gray"} className="ms-auto">{d.authorized ? "מורשה" : "לא מורשה"}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        {path && (
          <div className="rounded-lg border border-line/70 p-3">
            {browse.isLoading ? <Loading /> : browse.isError ? <ErrorState error={browse.error} /> : browse.data && (
              <>
                <div className="mb-2 flex items-center gap-2">
                  {browse.data.parent && <Button size="sm" variant="ghost" onClick={() => setPath(browse.data!.parent)} aria-label="תיקייה עליונה"><CornerLeftUp /></Button>}
                  <Ltr mono className="truncate text-sm">{browse.data.path}</Ltr>
                </div>
                <p className="mb-2 text-xs text-ink-3">{browse.data.file_count} קבצים בתיקייה זו · <Ltr>{fmtBytes(browse.data.total_bytes)}</Ltr></p>
                <ul className="max-h-56 overflow-y-auto">
                  {browse.data.dirs.length === 0 && <li className="text-xs text-ink-3">אין תתי-תיקיות</li>}
                  {browse.data.dirs.map((d) => (
                    <li key={d.path}>
                      <button onClick={() => setPath(d.path)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5">
                        <Folder className="size-4 text-warn" /><Ltr>{d.name}</Ltr><ChevronLeft className="ms-auto size-4 text-ink-3" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 rounded-md bg-accent/10 px-2 py-1.5 text-xs text-accent">התיקייה הנוכחית תיבחר כמקור – כולל כל תתי-התיקיות.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MediaLabPage() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const wizard = sp.get("action") === "source";
  const cases = useCases();
  const [caseId, setCaseId] = useState<string>(sp.get("case") ?? "");
  const [q, setQ] = useState("");
  const [camera, setCamera] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warn, setWarn] = useState(false);
  useEffect(() => { if (!caseId && cases.data?.length) setCaseId(String(cases.data.find((c) => c.media_count)?.id ?? cases.data[0].id)); }, [cases.data]); // eslint-disable-line
  const cams = useQuery({ queryKey: ["media-cams", caseId], enabled: !!caseId,
    queryFn: () => api<{ label: string; count: number }[]>(`/api/media/cameras?case_id=${caseId}`) });
  const params = new URLSearchParams();
  if (caseId) params.set("case_id", caseId);
  if (q.trim()) params.set("q", q.trim());
  if (camera) params.set("camera", camera);
  if (type) params.set("media_type", type);
  // סינון זמן לפי שעון המכשיר – הערך נשלח כפי שהוזן
  if (from) params.set("start", from);
  if (to) params.set("end", to);
  if (warn) params.set("has_warnings", "true");
  const media = useQuery({ queryKey: ["media", params.toString()], enabled: !!caseId,
    queryFn: () => api<Media[]>(`/api/media?${params}`) });
  const active = useQuery({ queryKey: ["jobs", "active"], queryFn: () => api<Job[]>("/api/jobs?active=true"), refetchInterval: 5000 });

  return (
    <div className="space-y-5">
      <PageHeader title="מעבדת מדיה" subtitle="סריקה לקריאה בלבד, Hash, עותקי עבודה מאומתים, מטא-דאטה, תצוגה מקדימה וציר זמן" icon={<Film />}
        actions={can("investigator") && !wizard && <Button onClick={() => setSp({ action: "source" })}><ScanLine />סריקת מקור חדש</Button>} />

      {wizard && can("investigator") && (
        <Card>
          <CardHeader title="בחירת מקור ראיות מורשה" icon={<HardDrive />} subtitle="המקור לעולם אינו משתנה – כל העיבוד מתבצע על עותקי עבודה מאומתים"
            actions={<Button variant="ghost" size="sm" onClick={() => setSp({})}>סגירה</Button>} />
          <CardBody>
            <SourceWizard initCase={Number(sp.get("case")) || undefined} initExhibit={Number(sp.get("exhibit")) || undefined}
              onDone={() => setSp({})} />
          </CardBody>
        </Card>
      )}

      {!!active.data?.length && (
        <Card>
          <CardHeader title="משימות פעילות" icon={<Play />} />
          <CardBody className="space-y-3">
            {active.data.map((j) => (
              <Link key={j.id} to={`/automation?job=${j.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-line/60 p-3 hover:border-accent/60">
                <span className="font-medium">{j.title}</span>
                <span className="text-xs text-ink-3">{j.current_step}</span>
                <div className="flex min-w-[200px] flex-1 items-center gap-2"><Progress value={j.progress} /><span className="tabular text-xs" dir="ltr">{Math.round(j.progress)}%</span></div>
                <JobStatusBadge status={j.status} />
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="מלאי מדיה" icon={<Search />} subtitle="חיפוש וסינון בקבצים שנסרקו" />
        <div className="grid gap-3 px-5 pb-4 md:grid-cols-3 xl:grid-cols-7 items-end">
          <Field label="תיק"><Select value={caseId} onChange={(e) => { setCaseId(e.target.value); setCamera(""); }}>
            {cases.data?.map((c) => <option key={c.id} value={c.id}>{c.reference} ({c.media_count})</option>)}
          </Select></Field>
          <Field label="חיפוש"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם קובץ, קודק…" /></Field>
          <Field label="מצלמה"><Select value={camera} onChange={(e) => setCamera(e.target.value)}>
            <option value="">הכל</option>{cams.data?.filter((c) => c.label).map((c) => <option key={c.label} value={c.label}>{c.label} ({c.count})</option>)}
          </Select></Field>
          <Field label="סוג"><Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">הכל</option>{Object.entries(MEDIA_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select></Field>
          <Field label="מזמן (שעון מכשיר)"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="עד זמן"><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="pb-2"><Checkbox checked={warn} onChange={setWarn} label="עם אזהרות בלבד" /></div>
        </div>
        {media.isLoading ? <Loading /> : media.isError ? <ErrorState error={media.error} /> : !media.data?.length ? (
          <EmptyState title="לא נמצאו קבצים" description="בחרו מקור ראיות מורשה והפעילו סריקה, או שנו את המסננים."
            action={can("investigator") && <Button onClick={() => setSp({ action: "source" })}><ScanLine />סריקת מקור חדש</Button>} />
        ) : <MediaTable items={media.data} />}
      </Card>
    </div>
  );
}
