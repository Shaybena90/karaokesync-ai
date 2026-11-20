import type { GameState } from '../escape/engine'
import { elapsedMs, hintTiersUsed, levelOf, points, stars, type Level } from '../escape/engine'
import { getRoom } from '../escape/rooms'
import { israelDate } from '../engine/date'
import { decideEscapeGrants, type Grant } from '../engine/rewards'
import { closeDb, DB_NAME, req, withTx } from './db'

export interface Profile {
  nickname: string
  avatar: string
  xp: number
  coins: number
  owned: string[]
  equipped: Record<string, string>
  createdAt: number
}

export interface LedgerEntry extends Grant {
  grantedAt: number
  runId: string
}

export interface Run {
  runId: string
  roomId: string
  /** Older runs have none → medium. */
  level?: Level
  mode: 'solo' | 'coop'
  players: number
  timeMs: number
  stars: number
  hints: number
  wrongAttempts: number
  date: string
  finishedAt: number
  /** Escape collection: score (1000 − 25×wrong − 50×hint tiers), timed challenge vs practice, loops. */
  points?: number
  runMode?: 'timed' | 'practice'
  loops?: number
  hintTiers?: number
}

// ── profile ──────────────────────────────────────────────

export async function getProfile(): Promise<Profile | undefined> {
  return withTx(['kv'], 'readonly', (tx) => req(tx.objectStore('kv').get('profile')))
}

export async function createProfile(nickname: string, avatar: string, now = Date.now()): Promise<Profile> {
  return withTx(['kv'], 'readwrite', async (tx) => {
    const store = tx.objectStore('kv')
    const existing: Profile | undefined = await req(store.get('profile'))
    const p: Profile = existing
      ? { ...existing, nickname, avatar }
      : { nickname, avatar, xp: 0, coins: 0, owned: ['wall-night', 'floor-wood'], equipped: { wall: 'wall-night', floor: 'floor-wood' }, createdAt: now }
    await req(store.put(p, 'profile'))
    return p
  })
}

export async function updateProfile(patch: Partial<Pick<Profile, 'nickname' | 'avatar'>>): Promise<Profile> {
  return withTx(['kv'], 'readwrite', async (tx) => {
    const store = tx.objectStore('kv')
    const p: Profile | undefined = await req(store.get('profile'))
    if (!p) throw new Error('no-profile')
    const next = { ...p, ...patch }
    await req(store.put(next, 'profile'))
    return next
  })
}

// ── finished runs & rewards ─────────────────────────────

export interface RunResult {
  run: Run
  grants: Grant[]
  prevXp: number
  profile: Profile
  isBest: boolean
  prevBestMs?: number
  alreadyRecorded: boolean
}

/** A stable id for one play-through (same for every refresh of it). */
export function runIdOf(code: string, s: GameState): string {
  return `${code}:${s.roomId}:${s.startedAt ?? 0}`
}

/**
 * Record an escape and grant rewards in ONE transaction. Ledger keys are
 * unique and the transaction is serialised with other tabs, so a refresh or
 * two tabs can never grant twice.
 */
export async function completeRun(p: { runId: string; state: GameState; mode: Run['mode']; players: number; now?: number }): Promise<RunResult> {
  const room = getRoom(p.state.roomId)
  if (!room || p.state.phase !== 'escaped') throw new Error('not-escaped')
  const now = p.now ?? Date.now()
  const timeMs = elapsedMs(p.state, now)
  const date = israelDate(p.state.escapedAt ?? now)
  const level = levelOf(p.state)
  const collection = !!room.puzzles
  const pts = points(p.state)
  const run: Run = collection
    ? { runId: p.runId, roomId: room.id, level, mode: p.mode, players: p.players, timeMs, stars: pts >= 900 ? 3 : pts >= 700 ? 2 : 1, hints: hintTiersUsed(p.state), hintTiers: hintTiersUsed(p.state), wrongAttempts: p.state.wrongAttempts, date, finishedAt: p.state.escapedAt ?? now, points: pts, runMode: room.timer || room.loop ? (p.state.mode ?? 'timed') : undefined, loops: room.loop ? (p.state.loop ?? 0) + 1 : undefined }
    : { runId: p.runId, roomId: room.id, level, mode: p.mode, players: p.players, timeMs, stars: stars(level, timeMs), hints: p.state.hintsShown.length, wrongAttempts: p.state.wrongAttempts, date, finishedAt: p.state.escapedAt ?? now }

  return withTx(['kv', 'ledger', 'runs'], 'readwrite', async (tx) => {
    const kv = tx.objectStore('kv')
    const ledger = tx.objectStore('ledger')
    const runs = tx.objectStore('runs')
    const profile: Profile | undefined = await req(kv.get('profile'))
    if (!profile) throw new Error('no-profile')
    const allRuns = (await req(runs.getAll())) as Run[]
    // practice results never compete with the timed challenge
    const sameRoom = allRuns.filter((r) => r.roomId === room.id && (collection ? r.runMode === run.runMode : (r.level ?? 'medium') === level) && r.runId !== p.runId)
    const prevBestMs = sameRoom.length ? Math.min(...sameRoom.map((r) => r.timeMs)) : undefined
    const existing = allRuns.find((r) => r.runId === p.runId)
    const all = (await req(ledger.getAll())) as LedgerEntry[]
    if (existing) {
      const grants = all.filter((g) => g.runId === p.runId)
      return { run: existing, grants, prevXp: profile.xp - grants.reduce((a, g) => a + g.xp, 0), profile, isBest: prevBestMs === undefined || existing.timeMs < prevBestMs, prevBestMs, alreadyRecorded: true }
    }
    const grants = decideEscapeGrants({ roomId: room.id, level, date, ledgerKeys: new Set(all.map((g) => g.key)), collection })
    for (const g of grants) await req(ledger.add({ ...g, grantedAt: now, runId: p.runId } satisfies LedgerEntry))
    const next: Profile = { ...profile, xp: profile.xp + grants.reduce((a, g) => a + g.xp, 0), coins: profile.coins + grants.reduce((a, g) => a + g.coins, 0) }
    await req(kv.put(next, 'profile'))
    await req(runs.put(run))
    return { run, grants, prevXp: profile.xp, profile: next, isBest: prevBestMs === undefined || timeMs < prevBestMs, prevBestMs, alreadyRecorded: false }
  })
}

export const listRuns = () => withTx(['runs'], 'readonly', (tx) => req(tx.objectStore('runs').getAll())) as Promise<Run[]>
export const listLedger = () => withTx(['ledger'], 'readonly', (tx) => req(tx.objectStore('ledger').getAll())) as Promise<LedgerEntry[]>

// ── room shop ───────────────────────────────────────────

export type BuyResult = { ok: true; profile: Profile; charged: number } | { ok: false; reason: 'coins' | 'no-profile' }

/** Buy (once) and equip. Owning an item already never charges again. */
export async function buyOrEquip(itemId: string, slot: string, price: number): Promise<BuyResult> {
  return withTx(['kv'], 'readwrite', async (tx) => {
    const kv = tx.objectStore('kv')
    const p: Profile | undefined = await req(kv.get('profile'))
    if (!p) return { ok: false, reason: 'no-profile' } as const
    const owned = p.owned.includes(itemId)
    if (!owned && p.coins < price) return { ok: false, reason: 'coins' } as const
    const next: Profile = { ...p, coins: owned ? p.coins : p.coins - price, owned: owned ? p.owned : [...p.owned, itemId], equipped: { ...p.equipped, [slot]: itemId } }
    await req(kv.put(next, 'profile'))
    return { ok: true, profile: next, charged: owned ? 0 : price } as const
  })
}

export async function unequip(slot: string): Promise<Profile> {
  return withTx(['kv'], 'readwrite', async (tx) => {
    const kv = tx.objectStore('kv')
    const p: Profile = await req(kv.get('profile'))
    const equipped = { ...p.equipped }
    delete equipped[slot]
    const next = { ...p, equipped }
    await req(kv.put(next, 'profile'))
    return next
  })
}

// ── reset ───────────────────────────────────────────────

export async function resetAll(): Promise<void> {
  closeDb()
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
    r.onblocked = () => resolve()
  })
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('hakasefet:')) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
