/** Calendar helpers. A "game date" is an Israel calendar date: 'YYYY-MM-DD'. */
export const GAME_TZ = 'Asia/Jerusalem'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: GAME_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** The Israel calendar date at a moment (handles daylight-saving changes via the tz database). */
export function israelDate(now: number | Date = Date.now()): string {
  const parts = fmt.formatToParts(typeof now === 'number' ? new Date(now) : now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Whole days since 1970-01-01 for a calendar date (time zone free). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function addDays(date: string, n: number): string {
  const t = new Date((dayNumber(date) + n) * 86_400_000)
  return t.toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(dayNumber(date) * 86_400_000).getUTCDay()
}

/** The Sunday that opens the (Sunday–Saturday) week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekday(date))
}

export function weekDates(date: string): string[] {
  const start = weekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** `n` dates ending with `today` (oldest first). */
export function lastNDates(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}

const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export function hebrewWeekdayShort(date: string): string {
  return HEB_DAYS[weekday(date)]
}

export function formatHebDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d}.${m}`
}

/** 134000 → "2:14" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
