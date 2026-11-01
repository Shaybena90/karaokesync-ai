import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, FileVideo, Fingerprint, ImageDown, ListVideo, XCircle } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction } from "@/lib/queries";
import { fmtBytes, fmtDateTime, fmtDevice, fmtDuration } from "@/lib/format";
import { FINDING_KIND, MEDIA_STATUS, MEDIA_TYPE } from "@/lib/labels";
import type { Finding, HashRec, Media } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { EmptyState, ErrorState, KV, Loading, Ltr } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { VideoPreview } from "@/components/VideoPreview";
import { ReviewBadge } from "@/components/StatusBadge";
import { FindingReviewButtons } from "@/components/FindingReview";

interface Detail {
  media: Media; hashes: HashRec[]; findings: Finding[]; probe: Record<string, any>; source_path: string;
  frames: { name: string; path: string }[];
}

export default function MediaDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["media-detail", id], queryFn: () => api<Detail>(`/api/media/${id}/detail`) });
  const [t, setT] = useState(0);
  const [seek, setSeek] = useState<number | null>(null);
  const [at, setAt] = useState("");
  const frame = useAction((s: number) => api<{ name: string; sha256: string }>(`/api/media/${id}/frames`, { method: "POST", json: { at_seconds: s } }), {
    success: (r) => `הפריים חולץ מעותק העבודה (SHA-256: ${r.sha256.slice(0, 12)}…)`, invalidate: [["media-detail", String(id)], ["media-detail"]],
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const { media: m, hashes, findings, probe, source_path, frames } = q.data;
  const motion = findings.filter((f) => f.kind === "motion" && f.media_offset_start != null)
    .map((f) => ({ start: f.media_offset_start!, end: f.media_offset_end ?? f.media_offset_start! + 1, score: f.score }));
  const wc = m.working_copy;

  return (
    <div className="space-y-5">
      <Link to={`/cases/${m.case_id}?tab=media`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-accent">
        <ArrowRight className="size-4" />חזרה למדיית התיק</Link>
      <div className="flex flex-wrap items-center gap-3">
        <FileVideo className="size-7 text-accent" />
        <h1 className="text-2xl font-extrabold"><Ltr>{m.file_name}</Ltr></h1>
        <Badge tone="blue">{MEDIA_STATUS[m.status]}</Badge>
        {wc?.verified ? <Badge tone="green"><CheckCircle2 />עותק עבודה מאומת</Badge> : <Badge tone="amber">אין עותק עבודה מאומת</Badge>}
      </div>
      {m.warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="size-4" />אזהרות לבדיקה</p>
          <ul className="list-disc ps-5 text-ink-2">{m.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="צפייה בעותק העבודה" icon={<ListVideo />} subtitle="הנגן מציג קובץ תצוגה שנוצר מעותק העבודה – לא מקובץ המקור" />
          <CardBody>
            {wc?.has_proxy ? (
              <VideoPreview mediaId={m.id} camera={m.camera_label || "—"} recordedStart={m.recorded_start}
                duration={m.duration_seconds ?? 0} motion={motion} onTime={setT} seekTo={seek} />
            ) : (
              <EmptyState icon={<FileVideo />} title="אין קובץ תצוגה"
                description={m.media_type === "video" ? "הפעילו 'יצירת עותק עבודה מאומת' או 'טיפול מלא' ליצירת קובץ תצוגה." : "קובץ זה אינו וידאו."} />
            )}
            {wc?.verified && m.media_type === "video" && can("investigator") && (
              <div className="mt-5 rounded-lg border border-line/70 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ImageDown className="size-4" />חילוץ פריים מעותק העבודה</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => frame.mutate(Math.round(t * 100) / 100)} loading={frame.isPending}>
                    <Camera />חילוץ בזמן הנוכחי (<Ltr>{fmtDuration(t)}</Ltr>)</Button>
                  <span className="text-xs text-ink-3">או בשניה:</span>
                  <Input type="number" min={0} max={m.duration_seconds ?? undefined} step={0.1} value={at} onChange={(e) => setAt(e.target.value)}
                    className="h-8 w-24" aria-label="זמן בשניות" />
                  <Button size="sm" variant="secondary" disabled={at === ""} onClick={() => frame.mutate(Number(at))}>חילוץ</Button>
                </div>
                {frames.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {frames.map((f) => (
                      <a key={f.name} href={fileUrl(`/api/media/${m.id}/file/frame?name=${encodeURIComponent(f.name)}`)} target="_blank" rel="noreferrer"
                        className="group overflow-hidden rounded border border-line">
                        <img src={fileUrl(`/api/media/${m.id}/file/frame?name=${encodeURIComponent(f.name)}`)} alt={`פריים ${f.name}`} loading="lazy" />
                        <Ltr mono className="block truncate px-1 text-[10px] text-ink-3">{f.name}</Ltr>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="מטא-דאטה" icon={<FileVideo />} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3">
              <KV label="מצלמה"><Ltr>{m.camera_label}</Ltr></KV>
              <KV label="סוג">{MEDIA_TYPE[m.media_type]}</KV>
              <KV label="תחילת הקלטה (שעון מכשיר)"><Ltr>{fmtDevice(m.recorded_start)}</Ltr></KV>
              <KV label="סיום הקלטה"><Ltr>{fmtDevice(m.recorded_end)}</Ltr></KV>
              <KV label="מקור הזמן">{m.time_source}</KV>
              <KV label="משך"><Ltr>{fmtDuration(m.duration_seconds)}</Ltr></KV>
              <KV label="רזולוציה"><Ltr>{m.width ? `${m.width}×${m.height}` : "—"}</Ltr></KV>
              <KV label="קודק / FPS"><Ltr>{m.codec || "—"}{m.fps ? ` · ${m.fps}` : ""}</Ltr></KV>
              <KV label="מכולה"><Ltr>{m.container}</Ltr></KV>
              <KV label="גודל"><Ltr>{fmtBytes(m.size_bytes)}</Ltr></KV>
              <KV label="זמן שינוי במקור">{fmtDateTime(m.source_mtime, true)}</KV>
            </dl>
            <div className="mt-4 space-y-2 text-sm">
              <KV label="נתיב יחסי במקור"><Ltr mono className="break-all">{m.relative_path}</Ltr></KV>
              <KV label="תיקיית המקור (קריאה בלבד)"><Ltr mono className="break-all">{source_path}</Ltr></KV>
              {wc && <KV label="עותק עבודה (אחסון מאושר)"><Ltr mono className="break-all">{wc.path}</Ltr></KV>}
            </div>
            {probe?.streams && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-ink-2">פלט FFprobe</summary>
                <pre dir="ltr" className="mt-2 max-h-56 overflow-auto rounded bg-[#0b1626] p-2 text-ink-3">{JSON.stringify(probe, null, 2)}</pre>
              </details>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="רישומי Hash (SHA-256)" icon={<Fingerprint />} />
        {!hashes.length ? <EmptyState title="טרם חושב Hash" /> : (
          <Table>
            <thead><tr><Th>יעד</Th><Th>ערך</Th><Th>גודל</Th><Th>התאמה למקור</Th><Th>משימה</Th><Th>חושב</Th></tr></thead>
            <tbody>{hashes.map((h) => (
              <Tr key={h.id}>
                <Td>{h.target === "source" ? "קובץ מקור" : "עותק עבודה"}</Td>
                <Td><Ltr mono className="break-all text-xs">{h.value}</Ltr></Td>
                <Td className="whitespace-nowrap"><Ltr>{fmtBytes(h.size_bytes)}</Ltr></Td>
                <Td>{h.matches_source == null ? "—" : h.matches_source ? <Badge tone="green"><CheckCircle2 />תואם</Badge> : <Badge tone="red"><XCircle />לא תואם</Badge>}</Td>
                <Td>{h.job_id ? <Link className="text-accent" to={`/automation?job=${h.job_id}`}>#{h.job_id}</Link> : "—"}</Td>
                <Td className="whitespace-nowrap">{fmtDateTime(h.computed_at, true)}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="ממצאים אלגוריתמיים – מועמדים לבדיקה" icon={<AlertTriangle />}
          subtitle="תוצאות אלו אינן קביעה עובדתית; יש לבחון כל מקטע ידנית ולתעד את ההחלטה" />
        {!findings.length ? <EmptyState title="אין ממצאים לקובץ זה" /> : (
          <Table>
            <thead><tr><Th>סוג</Th><Th>מיקום בסרטון</Th><Th>זמן (שעון מכשיר)</Th><Th>ציון</Th><Th>תיאור</Th><Th>סטטוס</Th><Th><span className="sr-only">פעולות</span></Th></tr></thead>
            <tbody>{findings.map((f) => (
              <Tr key={f.id}>
                <Td>{FINDING_KIND[f.kind]}</Td>
                <Td>{f.media_offset_start != null ? (
                  <button className="text-accent hover:underline" onClick={() => setSeek(f.media_offset_start!)}>
                    <Ltr>{fmtDuration(f.media_offset_start)}–{fmtDuration(f.media_offset_end)}</Ltr></button>) : "—"}</Td>
                <Td className="whitespace-nowrap"><Ltr>{fmtDevice(f.start_time)}</Ltr></Td>
                <Td className="tabular">{f.score != null ? f.score.toFixed(2) : "—"}</Td>
                <Td className="min-w-[220px] text-ink-2">{f.description}</Td>
                <Td><ReviewBadge status={f.review_status} /></Td>
                <Td><FindingReviewButtons finding={f} /></Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
