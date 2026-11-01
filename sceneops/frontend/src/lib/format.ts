/** עיצוב תאריכים, גדלים ומזהים טכניים בעברית. */
export const TZ = "Asia/Jerusalem";

const dtFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const dtsFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  second: "2-digit", hour12: false,
});
const timeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const longDate = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
});

/** זמן מערכת (UTC מהשרת) לתצוגה באזור הזמן של ישראל */
export function fmtDateTime(iso?: string | null, seconds = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (seconds ? dtsFmt : dtFmt).format(d).replace(",", "");
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  return timeFmt.format(new Date(iso));
}

export function fmtLongDate(d: Date): string {
  return longDate.format(d);
}

/** זמן מכשיר (ללא אזור זמן) – מוצג כפי שנרשם, ללא המרה */
export function fmtDevice(iso?: string | null, withSeconds = true): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${withSeconds ? ":" + m[6] : ""}`;
}

export function fmtBytes(n?: number | null): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDuration(sec?: number | null): string {
  if (sec == null) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export function relTime(iso?: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "לפני רגע";
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  return fmtDateTime(iso);
}

export function shortHash(h?: string | null, n = 12): string {
  if (!h) return "—";
  return h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h;
}

/** המרת קלט datetime-local (שעון ישראל) ל-ISO */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
