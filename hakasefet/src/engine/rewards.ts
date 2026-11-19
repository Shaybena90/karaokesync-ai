import { lastNDates } from './date'

import type { Level } from '../escape/engine'

/** First escape from a room on each level (harder pays more). */
export const FIRST_ESCAPE: Record<Level, { xp: number; coins: number }> = {
  easy: { xp: 80, coins: 20 },
  medium: { xp: 120, coins: 30 },
  hard: { xp: 180, coins: 45 },
}
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
 * - first escape from each room on each level: easy 80 XP + 20 coins, medium 120 + 30, hard 180 + 45
 * - first escape of each Israel calendar day: 50 XP + 20 coins (once per day)
 */
export function decideEscapeGrants(p: { roomId: string; level: Level; date: string; ledgerKeys: Set<string> }): Grant[] {
  const out: Grant[] = []
  const first = `escape:${p.roomId}:${p.level}`
  const r = FIRST_ESCAPE[p.level]
  if (!p.ledgerKeys.has(first)) out.push({ key: first, kind: 'first-escape', xp: r.xp, coins: r.coins, date: p.date })
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
