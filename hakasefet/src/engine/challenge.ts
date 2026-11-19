import type { Category, Level } from '../content/types'
import { CATEGORIES } from '../content/types'
import { getPack } from '../content'
import { isValidDate } from './date'

/**
 * A challenge link recreates the same vault: content version, date, level and
 * room order. It never contains answers, the code, or anything personal.
 */
export interface Challenge {
  version: string
  date: string
  level: Level
  order: Category[]
}

const LETTER: Record<Category, string> = { sports: 's', music: 'm', general: 'g' }
const FROM_LETTER: Record<string, Category> = { s: 'sports', m: 'music', g: 'general' }

export function challengeQuery(c: Challenge): string {
  const p = new URLSearchParams({ v: c.version, d: c.date, l: c.level === 'hard' ? 'h' : 'n', o: c.order.map((x) => LETTER[x]).join('') })
  return p.toString()
}

export function challengeUrl(c: Challenge, baseUrl: string): string {
  return `${baseUrl}#/challenge?${challengeQuery(c)}`
}

export type ParseResult =
  | { ok: true; challenge: Challenge }
  | { ok: false; reason: 'malformed' | 'unknown-version' | 'future' }

export function parseChallenge(params: URLSearchParams, today: string): ParseResult {
  const version = params.get('v') ?? ''
  const date = params.get('d') ?? ''
  const l = params.get('l')
  const o = params.get('o') ?? ''
  const order = o.split('').map((ch) => FROM_LETTER[ch])
  const valid =
    version && isValidDate(date) && (l === 'n' || l === 'h') &&
    order.length === 3 && order.every(Boolean) && new Set(order).size === 3
  if (!valid) return { ok: false, reason: 'malformed' }
  if (!getPack(version)) return { ok: false, reason: 'unknown-version' }
  if (date > today) return { ok: false, reason: 'future' }
  return { ok: true, challenge: { version, date, level: l === 'h' ? 'hard' : 'normal', order: order as Category[] } }
}

export function isFullOrder(order: Category[]): boolean {
  return order.length === CATEGORIES.length && new Set(order).size === CATEGORIES.length
}
