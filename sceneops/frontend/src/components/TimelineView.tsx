import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock4 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDevice } from "@/lib/format";
import { FINDING_KIND } from "@/lib/labels";
import type { Finding } from "@/lib/types";
import { EmptyState, Loading, Ltr } from "./ui/misc";
import { ReviewBadge } from "./StatusBadge";
import { FindingReviewButtons } from "./FindingReview";

interface Lane { camera: string; segments: { media_id: number; file_name: string; start: string | null; end: string | null; warnings: number }[] }

const ms = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso)!;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
};

/** ציר זמן לפי מצלמה (שעון מכשיר), עם פערים ואי-התאמות המסומנים כמועמדים לבדיקה. */
export function TimelineView({ caseId }: { caseId: number }) {
  const q = useQuery({
    queryKey: ["timeline", caseId],
    queryFn: () => api<{ lanes: Lane[]; findings: Finding[] }>(`/api/media/timeline/case/${caseId}`),
  });
  if (q.isLoading) return <Loading />;
  const lanes = q.data?.lanes.filter((l) => l.segments.some((s) => s.start)) ?? [];
  if (!lanes.length) return <EmptyState icon={<Clock4 />} title="אין עדיין ציר זמן" description="ציר הזמן נבנה לאחר סריקה וחילוץ מטא-דאטה של קבצי וידאו." />;
  const all = lanes.flatMap((l) => l.segments).filter((s) => s.start && s.end);
  const t0 = Math.min(...all.map((s) => ms(s.start!)));
  const t1 = Math.max(...all.map((s) => ms(s.end!)));
  const span = Math.max(t1 - t0, 1000);
  const pct = (iso: string) => ((ms(iso) - t0) / span) * 100;
  const findings = (q.data?.findings ?? []).filter((f) => f.kind !== "motion");
  const motion = (q.data?.findings ?? []).filter((f) => f.kind === "motion" && f.start_time && f.end_time);
  const ticks = Array.from({ length: 6 }, (_, i) => new Date(t0 + (span * i) / 5));
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="space-y-5">
      <div dir="ltr" className="rounded-lg border border-line/70 bg-[#0c1b2e] p-4">
        <div className="space-y-3">
          {lanes.map((l) => (
            <div key={l.camera} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-sm font-semibold text-ink-2">{l.camera}</div>
              <div className="relative h-8 flex-1 rounded bg-[#1d2d45]">
                {l.segments.filter((s) => s.start && s.end).map((s) => (
                  <Link key={s.media_id} to={`/media/${s.media_id}`} title={`${s.file_name}\n${fmtDevice(s.start)} – ${fmtDevice(s.end)}`}
                    className={`absolute inset-y-1 rounded-sm border ${s.warnings ? "border-warn bg-warn/30" : "border-accent/70 bg-accent/35"} hover:bg-accent/60`}
                    style={{ left: `${pct(s.start!)}%`, width: `${Math.max(pct(s.end!) - pct(s.start!), 0.5)}%` }} />
                ))}
                {motion.filter((f) => f.camera_label === l.camera).map((f) => (
                  <span key={f.id} className="absolute bottom-0 h-1.5 rounded-sm bg-violet"
                    style={{ left: `${pct(f.start_time!)}%`, width: `${Math.max(pct(f.end_time!) - pct(f.start_time!), 0.3)}%` }} />
                ))}
                {findings.filter((f) => f.kind === "gap" && f.camera_label === l.camera && f.start_time && f.end_time).map((f) => (
                  <span key={f.id} className="absolute inset-y-0 border-x-2 border-dashed border-danger bg-danger/15"
                    style={{ left: `${pct(f.start_time!)}%`, width: `${Math.max(pct(f.end_time!) - pct(f.start_time!), 0.5)}%` }}
                    title={f.description} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between ps-[92px] font-mono text-[11px] text-ink-3">
          {ticks.map((d, i) => <span key={i}>{pad(d.getUTCHours())}:{pad(d.getUTCMinutes())}:{pad(d.getUTCSeconds())}</span>)}
        </div>
      </div>
      <div dir="rtl" className="flex flex-wrap gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-accent/50" />קטע הקלטה</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-sm bg-violet" />תנועה (מועמד)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 border-x-2 border-dashed border-danger bg-danger/15" />פער הקלטה אפשרי</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm border border-warn bg-warn/30" />קובץ עם אזהרה</span>
        <span>הזמנים לפי שעון המכשיר, ללא תיקון היסט.</span>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warn" />ממצאים לבדיקה ({findings.length})</h3>
        <p className="mb-3 text-xs text-ink-3">ממצאים אלה הופקו אלגוריתמית ואינם מהווים קביעה עובדתית. יש לבחון כל ממצא ידנית.</p>
        {!findings.length ? <p className="text-sm text-ink-3">לא סומנו פערים או אי-התאמות.</p> : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line/70 p-3 text-sm">
                <span className="font-semibold text-warn">{FINDING_KIND[f.kind]}</span>
                <Ltr className="text-ink-2">{f.camera_label}</Ltr>
                <Ltr className="tabular text-ink-2">{fmtDevice(f.start_time)}{f.end_time ? ` → ${fmtDevice(f.end_time)}` : ""}</Ltr>
                <span className="flex-1 min-w-[200px]">{f.description}</span>
                <ReviewBadge status={f.review_status} />
                <FindingReviewButtons finding={f} invalidate={["timeline", String(caseId)]} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
