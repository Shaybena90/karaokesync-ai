import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { fileUrl } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface MotionSeg { start: number; end: number; score?: number | null }

function addSeconds(iso: string | null, s: number): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  // זמן מכשיר – מחושב כ-UTC כדי למנוע המרת אזור זמן
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + s * 1000);
}
const pad = (n: number) => String(n).padStart(2, "0");
const fmtOverlay = (d: Date) =>
  `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const fmtClock = (d: Date, sec = false) =>
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${sec ? `:${pad(d.getUTCSeconds())}` : ""}`;

/** נגן וידאו לקובץ תצוגה שנוצר מעותק עבודה מאומת, עם ציר תנועה (מועמדים לבדיקה). */
export function VideoPreview({ mediaId, camera, recordedStart, duration, motion, compact, onTime, seekTo }: {
  mediaId: number; camera: string; recordedStart: string | null; duration: number; motion: MotionSeg[];
  compact?: boolean; onTime?: (t: number) => void; seekTo?: number | null;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(duration || 0);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (seekTo != null && v.current) {
      v.current.currentTime = seekTo;
      setT(seekTo);
    }
  }, [seekTo]);

  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setError(true));
    else el.pause();
  };
  const seek = (s: number) => {
    if (v.current) v.current.currentTime = Math.max(0, Math.min(s, dur));
    setT(s);
  };
  const overlay = addSeconds(recordedStart, t);
  const ticks = 7;
  const tickLabels = Array.from({ length: ticks }, (_, i) => addSeconds(recordedStart, (dur * i) / (ticks - 1)));

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line bg-black">
        {error ? (
          <div className="grid aspect-video place-items-center text-sm text-ink-3">לא ניתן לנגן את קובץ התצוגה</div>
        ) : (
          <video ref={v} src={fileUrl(`/api/media/${mediaId}/file/proxy`)} poster={fileUrl(`/api/media/${mediaId}/file/thumbnail`)}
            className="block aspect-video w-full object-cover" muted={muted} playsInline preload="metadata"
            onClick={toggle} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError(true)}
            onLoadedMetadata={(e) => setDur(e.currentTarget.duration || duration)}
            onTimeUpdate={(e) => { setT(e.currentTarget.currentTime); onTime?.(e.currentTarget.currentTime); }}
            aria-label={`הקלטה ממצלמה ${camera}`} />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 py-2 font-mono text-[13px] font-semibold text-white" dir="ltr">
          <span>{overlay ? fmtOverlay(overlay) : ""}</span>
          <span>{camera}</span>
        </div>
        {/* בקרות – בכיוון LTR כמקובל בנגני וידאו */}
        <div dir="ltr" className="flex items-center gap-3 bg-[#0b1626]/95 px-3 py-2">
          <button onClick={toggle} aria-label={playing ? "השהיה" : "ניגון"} className="text-white hover:text-accent">
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>
          <input type="range" min={0} max={dur || 0} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))}
            aria-label="מיקום בסרטון" className="h-1.5 flex-1 cursor-pointer accent-[#319BFF]" />
          <span className="tabular font-mono text-xs text-ink-2 whitespace-nowrap">{fmtDuration(t)} / {fmtDuration(dur)}</span>
          <button onClick={() => setMuted(!muted)} aria-label={muted ? "הפעלת שמע" : "השתקה"} className="text-ink-2 hover:text-white">
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <button onClick={() => v.current?.requestFullscreen?.()} aria-label="מסך מלא" className="text-ink-2 hover:text-white">
            <Maximize className="size-5" />
          </button>
        </div>
      </div>

      <div className={cn("mt-4", compact && "mt-3")}>
        <p className="mb-2 text-[15px] font-semibold">ציר פעילות (תנועה)</p>
        <div dir="ltr">
          <button type="button" aria-label="ציר תנועה – לחיצה למעבר לזמן" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * dur);
          }} className="relative block h-7 w-full overflow-hidden rounded-md border border-line bg-[#2a3b55]/70">
            {motion.map((m, i) => (
              <span key={i} className="absolute inset-y-0 bg-gradient-to-b from-[#9d8cff] to-[#6c5ce7] opacity-90"
                style={{ left: `${(m.start / (dur || 1)) * 100}%`, width: `${Math.max(((m.end - m.start) / (dur || 1)) * 100, 0.8)}%` }}
                title={`תנועה ${fmtDuration(m.start)}–${fmtDuration(m.end)}`} />
            ))}
            <span className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#fff]" style={{ left: `${(t / (dur || 1)) * 100}%` }} />
          </button>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-2 tabular">
            {tickLabels.map((d, i) => <span key={i}>{d ? fmtClock(d, dur < 600) : fmtDuration((dur * i) / (ticks - 1))}</span>)}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-6 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-violet" />תנועה</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ink-3" />ללא תנועה</span>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-3">מקטעי התנועה זוהו אלגוריתמית ומהווים מועמדים לבדיקה בלבד</p>
      </div>
    </div>
  );
}
