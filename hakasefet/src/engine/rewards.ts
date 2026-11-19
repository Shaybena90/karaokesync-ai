import { lastNDates } from './date'

export const FIRST_ESCAPE_XP = 100
export const FIRST_ESCAPE_COINS = 30
export const DAILY_XP = 50
export const DAILY_COINS = 20
export const XP_PER_RANK = 300

export interface Grant {
  /** Unique ledger key — the same key can never be granted twice. */
  key: string
  kind: 'first-escape' | 'daily'
  xp: number
  coins: number
  date: string
}

export function rankInfo(xp: number) {
  const rank = Math.floor(xp / XP_PER_RANK) + 1
  const into = xp % XP_PER_RANK
  return { rank, into, needed: XP_PER_RANK, progress: into / XP_PER_RANK }
}

/**
 * Rewards for escaping a room:
 * - first escape from each room: 100 XP + 30 coins (once per room)
 * - first escape of each Israel calendar day: 50 XP + 20 coins (once per day)
 */
export function decideEscapeGrants(p: { roomId: string; date: string; ledgerKeys: Set<string> }): Grant[] {
  const out: Grant[] = []
  const first = `escape:${p.roomId}`
  if (!p.ledgerKeys.has(first)) out.push({ key: first, kind: 'first-escape', xp: FIRST_ESCAPE_XP, coins: FIRST_ESCAPE_COINS, date: p.date })
  const daily = `daily:${p.date}`
  if (!p.ledgerKeys.has(daily)) out.push({ key: daily, kind: 'daily', xp: DAILY_XP, coins: DAILY_COINS, date: p.date })
  return out
}

export function daysPlayedLast7(activityDates: Iterable<string>, today: string): number {
  const window = new Set(lastNDates(today, 7))
  const set = new Set<string>()
  for (const d of activityDates) if (window.has(d)) set.add(d)
  return set.size
}
