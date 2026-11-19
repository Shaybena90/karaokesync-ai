import type { Level } from '../content/types'
import type { Attempt, AttemptSummary } from '../engine/attempt'
import { summarize } from '../engine/attempt'
import { decideGrants, type Grant } from '../engine/rewards'
import { closeDb, DB_NAME, req, withTx } from './db'
import { clearBackup } from './backup'

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
  attemptId: string
  mysteryId: string
}

export interface HistoryEntry {
  attemptId: string
  vaultDate: string
  mysteryId: string
  contentVersion: string
  level: Level
  mode: Attempt['mode']
  score: number
  durationMs: number
  correct: number
  total: number
  codeTries: number
  hintUsed: boolean
  solvedAt: number
}

export interface Best {
  key: string
  score: number
  durationMs: number
  attemptId: string
}

export interface Mistake {
  questionId: string
  timesWrong: number
  lastAttemptId: string
  lastWrongAt: number
  practiceTries: number
  fixedAt?: number
}

export const bestKey = (mysteryId: string, vaultDate: string, level: Level) => `${vaultDate}|${mysteryId}|${level}`

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

// ── attempts ─────────────────────────────────────────────

export async function getActiveAttempt(): Promise<Attempt | undefined> {
  return withTx(['kv', 'attempts'], 'readonly', async (tx) => {
    const id: string | undefined = await req(tx.objectStore('kv').get('activeAttemptId'))
    if (!id) return undefined
    const a: Attempt | undefined = await req(tx.objectStore('attempts').get(id))
    return a && a.phase !== 'solved' ? a : undefined
  })
}

export async function getAttempt(id: string): Promise<Attempt | undefined> {
  return withTx(['attempts'], 'readonly', (tx) => req(tx.objectStore('attempts').get(id)))
}

/** Save progress and record new mistakes (counted once per attempt). */
export async function saveAttempt(a: Attempt, now = Date.now()): Promise<void> {
  await withTx(['kv', 'attempts', 'mistakes'], 'readwrite', async (tx) => {
    const attempts = tx.objectStore('attempts')
    const stored: Attempt | undefined = await req(attempts.get(a.id))
    // Never let an older copy (e.g. another tab) overwrite newer progress.
    if (stored && stored.updatedAt > a.updatedAt) return
    await req(attempts.put(a))
    if (a.phase !== 'solved') await req(tx.objectStore('kv').put(a.id, 'activeAttemptId'))
    const mistakes = tx.objectStore('mistakes')
    for (const qid of summarize(a).wrongQuestionIds) {
      const m: Mistake | undefined = await req(mistakes.get(qid))
      if (m?.lastAttemptId === a.id) continue
      await req(
        mistakes.put({
          questionId: qid,
          timesWrong: (m?.timesWrong ?? 0) + 1,
          lastAttemptId: a.id,
          lastWrongAt: now,
          practiceTries: m?.practiceTries ?? 0,
          fixedAt: undefined,
        } satisfies Mistake),
      )
    }
  })
}

export async function abandonActive(): Promise<void> {
  await withTx(['kv'], 'readwrite', (tx) => req(tx.objectStore('kv').delete('activeAttemptId')))
  clearBackup()
}

export interface CompletionResult {
  grants: Grant[]
  prevXp: number
  profile: Profile
  isBest: boolean
  prevBest?: number
  summary: AttemptSummary
  alreadyRecorded: boolean
}

/**
 * Finish a solved attempt in ONE transaction: history, personal best and
 * rewards. Ledger keys are unique, and the transaction is serialised with any
 * other tab, so a refresh, a double click or two tabs can't grant twice.
 */
export async function completeAttempt(a: Attempt, now = Date.now()): Promise<CompletionResult> {
  if (a.phase !== 'solved' || !a.level) throw new Error('not-solved')
  const summary = summarize(a)
  clearBackup(a.id)
  return withTx(['kv', 'attempts', 'ledger', 'bests', 'history'], 'readwrite', async (tx) => {
    const kv = tx.objectStore('kv')
    const ledger = tx.objectStore('ledger')
    const history = tx.objectStore('history')
    const bests = tx.objectStore('bests')
    const profile: Profile | undefined = await req(kv.get('profile'))
    if (!profile) throw new Error('no-profile')

    const bKey = bestKey(a.mysteryId, a.vaultDate, a.level!)
    const prevBestEntry: Best | undefined = await req(bests.get(bKey))
    const existing: HistoryEntry | undefined = await req(history.get(a.id))
    if (existing) {
      const grants = ((await req(ledger.getAll())) as LedgerEntry[]).filter((g) => g.attemptId === a.id)
      return { grants, prevXp: profile.xp - grants.reduce((s, g) => s + g.xp, 0), profile, isBest: prevBestEntry?.attemptId === a.id, prevBest: undefined, summary, alreadyRecorded: true }
    }

    const all = (await req(ledger.getAll())) as LedgerEntry[]
    const grants = decideGrants({
      mode: a.mode,
      vaultDate: a.vaultDate,
      ledgerKeys: new Set(all.map((g) => g.key)),
      activityDates: all.filter((g) => g.kind === 'daily').map((g) => g.date),
    })
    for (const g of grants) {
      // add() (not put) fails on a duplicate key — a second safety net.
      await req(ledger.add({ ...g, grantedAt: now, attemptId: a.id, mysteryId: a.mysteryId } satisfies LedgerEntry))
    }
    const prevXp = profile.xp
    const next: Profile = {
      ...profile,
      xp: profile.xp + grants.reduce((s, g) => s + g.xp, 0),
      coins: profile.coins + grants.reduce((s, g) => s + g.coins, 0),
    }
    await req(kv.put(next, 'profile'))

    const isBest = !prevBestEntry || summary.score > prevBestEntry.score
    if (isBest) await req(bests.put({ key: bKey, score: summary.score, durationMs: summary.durationMs, attemptId: a.id } satisfies Best))

    await req(
      history.put({
        attemptId: a.id,
        vaultDate: a.vaultDate,
        mysteryId: a.mysteryId,
        contentVersion: a.contentVersion,
        level: a.level!,
        mode: a.mode,
        score: summary.score,
        durationMs: summary.durationMs,
        correct: summary.correct,
        total: summary.total,
        codeTries: summary.codeTries,
        hintUsed: summary.hintUsed,
        solvedAt: a.solvedAt ?? now,
      } satisfies HistoryEntry),
    )
    await req(tx.objectStore('attempts').put(a))
    const activeId = await req(kv.get('activeAttemptId'))
    if (activeId === a.id) await req(kv.delete('activeAttemptId'))
    return { grants, prevXp, profile: next, isBest, prevBest: prevBestEntry?.score, summary, alreadyRecorded: false }
  })
}

// ── reads ───────────────────────────────────────────────

export const listHistory = () => withTx(['history'], 'readonly', (tx) => req(tx.objectStore('history').getAll())) as Promise<HistoryEntry[]>
export const listLedger = () => withTx(['ledger'], 'readonly', (tx) => req(tx.objectStore('ledger').getAll())) as Promise<LedgerEntry[]>
export const listMistakes = () => withTx(['mistakes'], 'readonly', (tx) => req(tx.objectStore('mistakes').getAll())) as Promise<Mistake[]>
export const listBests = () => withTx(['bests'], 'readonly', (tx) => req(tx.objectStore('bests').getAll())) as Promise<Best[]>

// ── practice ("ההזדמנות לתקן") ───────────────────────────

export async function recordPractice(questionId: string, correct: boolean, now = Date.now()): Promise<Mistake | undefined> {
  return withTx(['mistakes'], 'readwrite', async (tx) => {
    const store = tx.objectStore('mistakes')
    const m: Mistake | undefined = await req(store.get(questionId))
    if (!m) return undefined
    const next: Mistake = { ...m, practiceTries: m.practiceTries + 1, fixedAt: correct ? (m.fixedAt ?? now) : m.fixedAt }
    await req(store.put(next))
    return next
  })
}

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
    const next: Profile = {
      ...p,
      coins: owned ? p.coins : p.coins - price,
      owned: owned ? p.owned : [...p.owned, itemId],
      equipped: { ...p.equipped, [slot]: itemId },
    }
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
    r.onblocked = () => resolve() // other tabs will close on versionchange
  })
  clearBackup()
  try {
    localStorage.removeItem('hakasefet:prefs')
  } catch {
    /* ignore */
  }
}
