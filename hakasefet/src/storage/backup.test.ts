import { describe, expect, it } from 'vitest'
import { createAttempt } from '../engine/attempt'
import { newest, readBackup, writeBackup, clearBackup } from './backup'

const base = createAttempt({ id: 'a1', mode: 'daily', contentVersion: '2026.1', vaultDate: '2026-11-19', mysteryId: 'm01-diamond', now: 1 })

describe('write-ahead backup', () => {
  it('prefers the newer copy of the same attempt', () => {
    const newer = { ...base, score: 120, updatedAt: 5 }
    expect(newest(base, newer)).toBe(newer)
    expect(newest(newer, base)).toBe(newer)
  })
  it('ignores a backup of another, abandoned or finished attempt', () => {
    expect(newest(base, { ...base, id: 'other', updatedAt: 9 })).toBe(base)
    expect(newest(undefined, { ...base, updatedAt: 9 })).toBeUndefined()
    expect(newest(base, { ...base, phase: 'solved', updatedAt: 9 })).toBe(base)
  })
  it('round-trips through localStorage', () => {
    writeBackup(base)
    expect(readBackup()).toEqual(base)
    clearBackup('someone-else')
    expect(readBackup()).toEqual(base)
    clearBackup('a1')
    expect(readBackup()).toBeUndefined()
  })
})
