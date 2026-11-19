import type { Category, Level } from '../content/types'
import { getPack } from '../content'
import { createAttempt, makeCtx, reduce, type Attempt, type AttemptMode } from '../engine/attempt'
import { mysteryForDate } from '../engine/selection'
import { saveAttempt } from '../storage/repo'

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** Create and persist a new attempt. A challenge also fixes the level and room order. */
export async function startAttempt(p: { version: string; date: string; mode: AttemptMode; level?: Level; fixedRoomOrder?: Category[]; now?: number }): Promise<Attempt> {
  const pack = getPack(p.version)
  if (!pack) throw new Error('unknown-version')
  const now = p.now ?? Date.now()
  const mystery = mysteryForDate(pack, p.date)
  let a = createAttempt({ id: newId(), mode: p.mode, contentVersion: pack.version, vaultDate: p.date, mysteryId: mystery.id, fixedRoomOrder: p.fixedRoomOrder, now })
  if (p.level) a = reduce(a, { type: 'SELECT_LEVEL', level: p.level, now }, makeCtx(pack, mystery.id))
  await saveAttempt(a, now)
  return a
}
