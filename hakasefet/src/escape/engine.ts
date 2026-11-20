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
  /** Evidence notebook (entry ids) — permanent, even across time loops. */
  notebook?: string[]
  /** Escape-collection hints: tiers revealed per puzzle (0–3). */
  hintTiers?: Record<string, number>
  /** Timed rooms: the challenge, or untimed practice. */
  mode?: 'timed' | 'practice'
  /** The timed challenge ran out (play continued as practice). */
  timedOut?: boolean
  /** Loop rooms: time skipped by waiting, and the loop the state belongs to. */
  offsetMs?: number
  loop?: number
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
  | (Base & { type: 'READ'; hotspot: string })
  | (Base & { type: 'ACT'; hotspot: string })
  | (Base & { type: 'COMBINE'; a: string; b: string })
  | (Base & { type: 'PHINT'; puzzle: string })
  | (Base & { type: 'SET_MODE'; mode: 'timed' | 'practice' })
  | (Base & { type: 'WAIT'; until: number })

export function newGame(room: RoomDef): GameState {
  return {
    v: 1, roomId: room.id, roomVersion: room.version, level: 'medium', phase: 'lobby', flags: [], inventory: [], penaltyMs: 0, hintsShown: [], wrongAttempts: 0, log: [], results: {}, seq: 0,
    notebook: [], hintTiers: {}, offsetMs: 0, loop: 0, mode: room.timer ? 'timed' : undefined,
  }
}

// ── time loops ───────────────────────────────────────────

/** Where we are in the loop. Practice mode only moves when the player waits. */
export function loopClock(room: RoomDef, s: GameState, now: number) {
  const len = (room.loop?.minutes ?? 7) * 60_000
  const base = s.mode === 'practice' ? 0 : s.startedAt !== undefined ? Math.max(0, now - s.startedAt) : 0
  const t = base + (s.offsetMs ?? 0)
  const loop = Math.floor(t / len)
  const inLoop = t - loop * len
  return { loop, inLoop, minute: Math.floor(inLoop / 60_000), msLeft: len - inLoop, len }
}

const TEMP_FLAG = /^(solved|used|took|revealed|acted):(.+)$/

/** Start the loop(s) that have begun since the state was saved: objects reset, knowledge stays. */
export function syncLoop(room: RoomDef, s: GameState, now: number): GameState {
  if (!room.loop || s.phase !== 'playing') return s
  const { loop } = loopClock(room, s, now)
  if (loop <= (s.loop ?? 0)) return s
  const keep = new Set(room.loop.persist)
  const flags = s.flags.filter((f) => {
    const m = TEMP_FLAG.exec(f)
    return !m || keep.has(m[2])
  })
  if (!flags.includes('k:looped')) flags.push('k:looped')
  const entry: LogEntry = { id: s.seq + 1, at: now, who: { nick: 'הזמן', avatar: '⏳' }, text: `הלולאה התאפסה (לולאה ${loop + 1}). המחברת נשמרה.`, kind: 'info' }
  return { ...s, flags, inventory: [], loop, log: [...s.log, entry].slice(-40), seq: s.seq + 1 }
}

/** Flags plus the time-based ones (min:N in loop rooms). */
export function flagsAt(room: RoomDef, s: GameState, now: number): string[] {
  if (!room.loop || s.phase !== 'playing') return s.flags
  return [...s.flags, `min:${loopClock(room, s, now).minute}`]
}

export function isVisible(h: Hotspot, flags: string[]): boolean {
  return !h.visibleWhen || holds(flags, h.visibleWhen)
}

// ── puzzles, hints, points ───────────────────────────────

export function puzzleStatus(room: RoomDef, s: GameState) {
  return (room.puzzles ?? []).map((p) => ({ p, done: holds(s.flags, [p.doneWhen]), available: holds(s.flags, p.availableWhen), tiers: s.hintTiers?.[p.id] ?? 0 }))
}

/** The puzzle the player is most likely on: the first one available and not done. */
export function activePuzzle(room: RoomDef, s: GameState) {
  return puzzleStatus(room, s).find((x) => x.available && !x.done)
}

export function hintTiersUsed(s: GameState): number {
  return Object.values(s.hintTiers ?? {}).reduce((a, b) => a + b, 0)
}

/** Escape-collection score: max(0, 1000 − 25 × wrong submissions − 50 × hint tiers revealed). */
export function points(s: GameState): number {
  return Math.max(0, 1000 - 25 * s.wrongAttempts - 50 * hintTiersUsed(s))
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
    case 'choice':
      return input === lock.answer
    case 'sequence':
      return input === lock.answer.join(',')
    case 'multi': {
      const got = new Set(input.split(',').filter(Boolean))
      return got.size === lock.answer.length && lock.answer.every((x) => got.has(x))
    }
    case 'accuse': {
      // "suspect|ev1,ev2,…": the right suspect, all required evidence, nothing contradicting
      const [who, ev = ''] = input.split('|')
      const got = new Set(ev.split(',').filter(Boolean))
      return who === lock.answer && lock.required.every((x) => got.has(x)) && !(lock.forbidden ?? []).some((x) => got.has(x))
    }
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
  for (const f of e.clearFlags ?? []) flags.delete(f)
  for (const f of e.setFlags ?? []) flags.add(f)
  const notebook = [...(s.notebook ?? [])]
  for (const n of e.notebook ?? []) if (!notebook.includes(n)) notebook.push(n)
  s = { ...s, notebook }
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
  if (a.type === 'SET_MODE') {
    if (!room.timer && !room.loop) return invalid()
    if (s.phase === 'lobby') return { state: withResult({ ...s, mode: a.mode }, a.id, 'ok'), outcome: 'ok' }
    // during play: only from the timed challenge to practice (e.g. when the time ran out)
    if (s.phase !== 'playing' || a.mode !== 'practice' || s.mode === 'practice') return invalid()
    const out = remainingMs(room, s, a.now) <= 0
    const next = log({ ...s, mode: 'practice', timedOut: s.timedOut || out }, a, 'ממשיכים במצב אימון — בלי שעון', 'info')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }
  if (a.type === 'START') {
    if (s.phase !== 'lobby') return invalid()
    const lv = levelOf(s)
    const next = log({ ...s, level: lv, flags: [...s.flags, `level:${lv}`], phase: 'playing', startedAt: a.now }, a, `השעון התחיל לרוץ! רמה: ${LEVELS[lv].label}`, 'info')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }
  if (s.phase !== 'playing') return invalid()
  // a timed challenge that ran out only continues in practice mode
  if (room.timer && s.mode !== 'practice' && remainingMs(room, s, a.now) <= 0) return invalid()
  s = syncLoop(room, s, a.now)
  const flagsNow = flagsAt(room, s, a.now)

  if (a.type === 'WAIT') {
    if (!room.loop) return invalid()
    const c = loopClock(room, s, a.now)
    // already in that minute: nothing to wait for; otherwise forward (into the next loop if it has passed)
    let delta = c.minute === a.until ? 0 : a.until * 60_000 - c.inLoop
    if (delta < 0) delta += c.len
    const waited = syncLoop(room, { ...s, offsetMs: (s.offsetMs ?? 0) + delta }, a.now)
    const next = log(waited, a, `חיכו עד דקה ${a.until} בלולאה`, 'info')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'PHINT') {
    const st = puzzleStatus(room, s).find((x) => x.p.id === a.puzzle)
    if (!st || st.done || !st.available || st.tiers >= 3) return invalid()
    const next = log({ ...s, hintTiers: { ...(s.hintTiers ?? {}), [a.puzzle]: st.tiers + 1 } }, a, `נפתח רמז ${st.tiers + 1} מתוך 3 (−50 נקודות)`, 'hint')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'COMBINE') {
    if (!s.inventory.includes(a.a) || !s.inventory.includes(a.b) || a.a === a.b) return invalid()
    const c = (room.combos ?? []).find((x) => (x.a === a.a && x.b === a.b) || (x.a === a.b && x.b === a.a))
    if (!c) {
      const next = log(s, a, 'החפצים לא מתחברים', 'wrong')
      return { state: withResult(next, a.id, 'wrong'), outcome: 'wrong' }
    }
    const next = applyEffect({ ...s, flags: [...s.flags, `combined:${c.result}`] }, { removeItems: [c.a, c.b], giveItems: [c.result], message: c.message }, a)
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'HINT') {
    const idx = nextHintIndex(room, s)
    const L = LEVELS[levelOf(s)]
    if (idx === -1 || s.hintsShown.length >= L.maxHints) return invalid()
    const next = log({ ...s, hintsShown: [...s.hintsShown, idx], penaltyMs: s.penaltyMs + L.hintPenaltyMs }, a, `נפתח רמז (+${L.hintPenaltyMs / 1000} שניות)`, 'hint')
    return { state: withResult(next, a.id, 'ok'), outcome: 'ok' }
  }

  const h = room.hotspots.find((x) => x.id === a.hotspot)
  if (!h || !isVisible(h, flagsNow) || !room.scenes.find((sc) => sc.id === h.scene && (!sc.visibleWhen || holds(flagsNow, sc.visibleWhen)))) return invalid()
  const it = currentInteraction(h, flagsNow)
  if (!it) return invalid()

  if (a.type === 'READ') {
    // exploring never costs anything; notes may add a notebook entry
    const entry = 'note' in it ? it.note.notebook : undefined
    if (s.flags.includes(`seen:${h.id}`) && (!entry || (s.notebook ?? []).includes(entry))) return { state: withResult(s, a.id, 'ok'), outcome: 'ok' }
    const notebook = entry && !(s.notebook ?? []).includes(entry) ? [...(s.notebook ?? []), entry] : (s.notebook ?? [])
    const flags = s.flags.includes(`seen:${h.id}`) ? s.flags : [...s.flags, `seen:${h.id}`]
    return { state: withResult({ ...s, flags, notebook }, a.id, 'ok'), outcome: 'ok' }
  }

  if (a.type === 'ACT') {
    if (it.type !== 'action' || (!it.repeatable && s.flags.includes(`acted:${h.id}`))) return invalid()
    const acted = s.flags.includes(`acted:${h.id}`) ? s : { ...s, flags: [...s.flags, `acted:${h.id}`] }
    return { state: withResult(applyEffect(acted, it.onAct, a), a.id, 'ok'), outcome: 'ok' }
  }

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

export function remainingMs(room: RoomDef, s: GameState, now: number): number {
  if (room.puzzles) {
    // escape collection: only the timed challenge has a clock
    if (!room.timer || s.mode === 'practice') return Infinity
    return room.timer.minutes * 60_000 - elapsedMs(s, now)
  }
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
