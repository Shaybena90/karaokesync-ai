import type { Attempt } from '../engine/attempt'

/**
 * Write-ahead copy of the active attempt in localStorage. It is written
 * synchronously on every action, so a refresh a few milliseconds after an
 * answer (before the IndexedDB transaction commits) still restores it.
 * IndexedDB stays the source of truth; the newer copy (by updatedAt) wins.
 */
const KEY = 'hakasefet:active-backup'

export function writeBackup(a: Attempt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* storage full / private mode */
  }
}

export function readBackup(): Attempt | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    const a = raw ? (JSON.parse(raw) as Attempt) : undefined
    return a && a.schema === 1 && typeof a.id === 'string' ? a : undefined
  } catch {
    return undefined
  }
}

export function clearBackup(id?: string): void {
  try {
    if (!id || readBackup()?.id === id) localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Pick the newest copy of the same attempt. */
export function newest(fromDb: Attempt | undefined, backup: Attempt | undefined): Attempt | undefined {
  if (!backup || backup.phase === 'solved') return fromDb
  if (!fromDb) return undefined // no active attempt in the DB → the backup is stale (abandoned / finished)
  return backup.id === fromDb.id && backup.updatedAt > fromDb.updatedAt ? backup : fromDb
}
