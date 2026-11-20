import type { Color, Cond, Dir, Effect, Hotspot, Interaction, LockDef, RoomDef } from './types'

/**
 * Pure, deterministic escape-room state machine. The same state + action gives
 * the same result on every device, which is what lets the co-op host apply
 * actions and broadcast the result.
 */
export type Level = 'easy' | 'medium' | 'hard'

/** Difficulty: time on the clock, hint cost, hint limit (clue wording also changes per level). */
export const LEVELS: Record<Level, { label: string; minutes: number; hintPenaltyMs: number; maxHints: number; desc: string }> = {
  easy: { label: 'קל', minutes: 60, hintPenaltyMs: 30_000, maxHints: Infinity, desc: '60 דקות · רמזים בלי הגבלה (+30 שניות) · רמזים ברורים יותר בחדר' },
  medium: { label: 'בינוני', minutes: 50, hintPenaltyMs: 60_000, maxHints: Infinity, desc: '50 דקות · רמזים בלי הגבלה (+1 דקה)' },
  hard: { label: 'קשה', minutes: 40, hintPenaltyMs: 120_000, maxHints: 3, desc: '40 דקות · עד 3 רמזים (+2 דקות) · רמזים מעורפלים יותר' },
}
export const LEVEL_IDS: Level[] = ['easy', 'medium', 'hard']
/** @deprecated kept for old callers: medium penalty */
export const HINT_PENALTY_MS = LEVELS.medium.hintPenaltyMs

export function levelOf(s: Pick<GameState, 'level'>): Level {
  return s.level ?? 'medium'
}

export interface Player {
  id: string
  nick: string
  avatar: string
}

export interface LogEntry {
  id: number
  at: number
  who: Pick<Player, 'nick' | 'avatar'>
  text: string
  kind: 'good' | 'info' | 'wrong' | 'hint'
}

export type Phase = 'lobby' | 'playing' | 'escaped'

export interface GameState {
  v: 1
  roomId: string
  roomVersion: number
  /** Difficulty (older saved games have none → medium). */
  level?: Level
  phase: Phase
  flags: string[]
  inventory: string[]
  startedAt?: number
  escapedAt?: number
  penaltyMs: number
  hintsShown: number[]
  wrongAttempts: number
  log: LogEntry[]
  /** Outcome of recent actions, by action id (lets a client know how its action went). */
  results: Record<string, Outcome>
  seq: number
}

export type Outcome = 'ok' | 'wrong' | 'invalid'

interface Base {
  id: string
  by: Pick<Player, 'nick' | 'avatar'>
  now: number
}
export type Action =
  | (Base & { type: 'SET_LEVEL'; level: Level })
  | (Base & { type: 'START' })
  | (Base & { type: 'TAKE'; hotspot: string })
  | (Base & { type: 'SOLVE'; hotspot: string; input: string })
  | (Base & { type: 'USE'; hotspot: string; item: string })
  | (Base & { type: 'HINT' })
  | (Base & { type: 'REVEAL'; hotspot: string })

export function newGame(room: RoomDef): GameState {
  return { v: 1, roomId: room.id, roomVersion: room.version, level: 'medium', phase: 'lobby', flags: [], inventory: [], penaltyMs: 0, hintsShown: [], wrongAttempts: 0, log: [], results: {}, seq: 0 }
}

export function holds(flags: string[] | Set<string>, conds: Cond[] = []): boolean {
  const set = flags instanceof Set ? flags : new Set(flags)
  return conds.every((c) => (c.startsWith('!') ? !set.has(c.slice(1)) : set.has(c)))
}

/** The interaction currently offered by a hotspot (first whose conditions hold). */
export function currentInteraction(h: Hotspot, flags: string[]): Interaction | undefined {
  return h.interactions.find((i) => holds(flags, i.when))
}

export function isActive(h: Hotspot, flags: string[]): boolean {
  return !!h.activeWhen && holds(flags, h.activeWhen)
}

// ── answer checking ─────────────────────────────────────

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }
export function normalizeText(s: string): string {
  return s
    .trim()
    .replace(/[֑-ׇ]/g, '') // niqqud
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function encodeLockInput(lock: LockDef, value: string | Color[] | Dir[] | boolean[]): string {
  if (Array.isArray(value)) return lock.kind === 'switches' ? (value as boolean[]).map((b) => (b ? '1' : '0')).join('') : value.join(',')
  return value
}

export function checkLock(lock: LockDef, input: string): boolean {
  switch (lock.kind) {
    case 'digits':
      return input.trim() === lock.answer
    case 'letters':
      return normalizeText(input).replace(/ /g, '') === normalizeText(lock.answer)
    case 'colors':
      return input === lock.answer.join(',')
    case 'arrows':
      return input === lock.answer.join(',')
    case 'switches':
      return input === lock.answer.map((b) => (b ? '1' : '0')).join('')
    case 'terminal':
      return lock.answers.some((a) => normalizeText(a) === normalizeText(input))
    case 'tuner':
      return Number(input) === lock.answer
  }
}

// ── reducer ──────────────────────────────────────────────

const MAX_LOG = 40
const MAX_RESULTS = 30

function withResult(s: GameState, id: string, outcome: Outcome): GameState {
  const keys = Object.keys(s.results)
  const results = { ...s.results, [id]: outcome }
  if (keys.length >= MAX_RESULTS) delete results[keys[0]]
  return { ...s, results, seq: s.seq + 1 }
}

function log(s: GameState, a: Action, text: string, kind: LogEntry['kind']): GameState {
  const entry: LogEntry = { id: s.seq + 1, at: a.now, who: a.by, text, kind }
  return { ...s, log: [...s.log, entry].slice(-MAX_LOG) }
}

function applyEffect(s: GameState, e: Effect, a: Action): GameState {
  const flags = new Set(s.flags)
  for (const f of e.setFlags ?? []) flags.add(f)
  let inventory = s.inventory.filter((i) => !(e.removeItems ?? []).includes(i))
  for (const it of e.giveItems ?? []) {
    if (!inventory.includes(it)) inventory = [...inventory, it]
    flags.add(`took:${it}`)
  }
  let next: GameState = { ...s, flags: [...flags], inventory }
  if (e.escape) {
    flags.add('escaped')
    next = { ...next, flags: [...flags], phase: 'escaped', escapedAt: a.now }
  }
  return log(next, a, e.message, 'good')
}

export function reduce(room: RoomDef, s: GameState, a: Action): { state: GameState; outcome: Outcome } {
  // An action is applied once, however many times it arrives.
  if (a.id in s.results) return { state: s, outcome: s.results[a.id] }
  const invalid = () => ({ state: withResult(s, a.id, 'invalid'), outcome: 'invalid' as const })

  if (a.type === 'SET_LEVEL') {
    if (s.phase !== 'lobby' || !LEVELS[a.level]) return invalid()
    return { state: withResult({ ...s, level: a.level }, a.id, 'ok'), outcome: 'ok' }
  }
  if (a.type === 'START') {
    if (s.phase !== 'lobby') return invalid()
    const lv = levelOf(s)
    const next = log({ ...s, level: lv, flags: [...s.flags, `level:${lv}`], phase: 'playing', startedAt: a.now }, a, `השעון התחיל לרוץ! רמה: ${LEVELS[lv].label}`, 'info')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }
  if (s.phase !== 'playing') return invalid()

  if (a.type === 'HINT') {
    const idx = nextHintIndex(room, s)
    const L = LEVELS[levelOf(s)]
    if (idx === -1 || s.hintsShown.length >= L.maxHints) return invalid()
    const next = log({ ...s, hintsShown: [...s.hintsShown, idx], penaltyMs: s.penaltyMs + L.hintPenaltyMs }, a, `נפתח רמז (+${L.hintPenaltyMs / 1000} שניות)`, 'hint')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  const h = room.hotspots.find((x) => x.id === a.hotspot)
  if (!h) return invalid()
  const it = currentInteraction(h, s.flags)
  if (!it) return invalid()

  if (a.type === 'TAKE') {
    if (it.type !== 'take') return invalid()
    const item = room.items.find((i) => i.id === it.item)!
    const next = applyEffect(s, { giveItems: [it.item], message: `נאסף לתיק: ${item.name}` }, a)
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'SOLVE') {
    if (it.type !== 'lock') return invalid()
    if (!checkLock(it.lock, a.input)) {
      const next = log({ ...s, wrongAttempts: s.wrongAttempts + 1 }, a, `קוד שגוי ב${h.name}`, 'wrong')
      return { state: withResult(next, a.id, 'wrong'), outcome: 'wrong' }
    }
    const solved = { ...s, flags: [...s.flags, `solved:${h.id}`] }
    return { state: withResult(applyEffect(solved, it.onSolve, a), a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'REVEAL') {
    if (it.type !== 'reveal' || (it.item && !s.inventory.includes(it.item))) return invalid()
    const revealed = { ...s, flags: [...s.flags, `revealed:${h.id}`] }
    return { state: withResult(applyEffect(revealed, it.onReveal, a), a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'USE') {
    if (!s.inventory.includes(a.item)) return invalid()
    if (it.type !== 'needItem' || it.item !== a.item) {
      const item = room.items.find((i) => i.id === a.item)
      const next = log(s, a, `${item?.name ?? 'החפץ'} לא עזר ב${h.name}`, 'wrong')
      return { state: withResult(next, a.id, 'wrong'), outcome: 'wrong' }
    }
    const used = { ...s, flags: [...s.flags, `used:${h.id}`] }
    return { state: withResult(applyEffect(used, it.onUse, a), a.id, 'ok'), outcome: 'ok' }
  }
  return invalid()
}

export function nextHintIndex(room: RoomDef, s: GameState): number {
  return room.hints.findIndex((h, i) => !s.hintsShown.includes(i) && !holds(s.flags, [h.until]) && holds(s.flags, h.after))
}

/** Hints already revealed that are still relevant, plus any already-used ones (for the list). */
export function shownHints(room: RoomDef, s: GameState) {
  return s.hintsShown.map((i) => ({ text: room.hints[i].text, done: holds(s.flags, [room.hints[i].until]) }))
}

// ── timing & results ─────────────────────────────────────

export function elapsedMs(s: GameState, now: number): number {
  if (s.startedAt === undefined) return 0
  return (s.escapedAt ?? now) - s.startedAt + s.penaltyMs
}

export function limitMs(s: Pick<GameState, 'level'>): number {
  return LEVELS[levelOf(s)].minutes * 60_000
}

export function remainingMs(_room: RoomDef, s: GameState, now: number): number {
  return limitMs(s) - elapsedMs(s, now)
}

export function hintsLeft(s: GameState): number {
  return LEVELS[levelOf(s)].maxHints - s.hintsShown.length
}

/** 3★ within 60% of the time, 2★ within 85%, 1★ in time, 0★ overtime. */
export function stars(level: Level, ms: number): number {
  const limit = LEVELS[level].minutes * 60_000
  if (ms <= limit * 0.6) return 3
  if (ms <= limit * 0.85) return 2
  if (ms <= limit) return 1
  return 0
}
