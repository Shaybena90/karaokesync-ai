import { addDays, lastNDates, weekStart } from './date'

export const DAILY_XP = 100
export const DAILY_COINS = 20
export const WEEKLY_COINS = 30
export const WEEKLY_REQUIRED_DAYS = 5
export const XP_PER_RANK = 300

export interface Grant {
  /** Unique ledger key — writing it twice is impossible, so rewards can't duplicate. */
  key: string
  kind: 'daily' | 'weekly'
  xp: number
  coins: number
  /** Activity date this grant belongs to. */
  date: string
}

export function rankInfo(xp: number) {
  const rank = Math.floor(xp / XP_PER_RANK) + 1
  const into = xp % XP_PER_RANK
  return { rank, into, needed: XP_PER_RANK, progress: into / XP_PER_RANK }
}

/** One daily reward per vault date (the daily vault of that date). */
export function dailyKey(vaultDate: string): string {
  return `daily:${vaultDate}`
}

export function weeklyKey(anyDateInWeek: string): string {
  return `weekly:${weekStart(anyDateInWeek)}`
}

/**
 * A completion counts toward the daily reward only when it is that date's
 * daily vault (mode 'daily'). Archive / old challenge plays are practice.
 */
export function isDailyCompletion(mode: string): boolean {
  return mode === 'daily'
}

/** Distinct activity dates in the Sunday–Saturday week of `date`. */
export function activeDaysInWeek(activityDates: Iterable<string>, date: string): number {
  const start = weekStart(date)
  const end = addDays(start, 6)
  const set = new Set<string>()
  for (const d of activityDates) if (d >= start && d <= end) set.add(d)
  return set.size
}

export function daysPlayedLast7(activityDates: Iterable<string>, today: string): number {
  const window = new Set(lastNDates(today, 7))
  const set = new Set<string>()
  for (const d of activityDates) if (window.has(d)) set.add(d)
  return set.size
}

/**
 * Pure reward decision for a solved attempt.
 * `ledgerKeys` = keys already granted; `activityDates` = dates of past daily grants.
 * The storage layer runs this inside one IndexedDB transaction.
 */
export function decideGrants(p: { mode: string; vaultDate: string; ledgerKeys: Set<string>; activityDates: string[] }): Grant[] {
  if (!isDailyCompletion(p.mode)) return []
  const dKey = dailyKey(p.vaultDate)
  if (p.ledgerKeys.has(dKey)) return []
  const grants: Grant[] = [{ key: dKey, kind: 'daily', xp: DAILY_XP, coins: DAILY_COINS, date: p.vaultDate }]
  const dates = [...p.activityDates, p.vaultDate]
  const wKey = weeklyKey(p.vaultDate)
  if (!p.ledgerKeys.has(wKey) && activeDaysInWeek(dates, p.vaultDate) >= WEEKLY_REQUIRED_DAYS) {
    grants.push({ key: wKey, kind: 'weekly', xp: 0, coins: WEEKLY_COINS, date: p.vaultDate })
  }
  return grants
}
