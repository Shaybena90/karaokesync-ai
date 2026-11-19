import { describe, expect, it } from 'vitest'
import { daysPlayedLast7, decideEscapeGrants, rankInfo } from './rewards'

describe('rewards', () => {
  it('ranks every 300 XP', () => {
    expect(rankInfo(0)).toMatchObject({ rank: 1, into: 0 })
    expect(rankInfo(299)).toMatchObject({ rank: 1, into: 299 })
    expect(rankInfo(300)).toMatchObject({ rank: 2, into: 0 })
  })
  it('first escape per room and level, and first escape per day, each once', () => {
    const first = decideEscapeGrants({ roomId: 'lab', level: 'medium', date: '2026-11-19', ledgerKeys: new Set() })
    expect(first.map((g) => [g.key, g.xp, g.coins])).toEqual([['escape:lab:medium', 120, 30], ['daily:2026-11-19', 50, 20]])
    const keys = new Set(['escape:lab:medium', 'daily:2026-11-19'])
    expect(decideEscapeGrants({ roomId: 'station', level: 'medium', date: '2026-11-19', ledgerKeys: keys }).map((g) => g.key)).toEqual(['escape:station:medium'])
    expect(decideEscapeGrants({ roomId: 'lab', level: 'medium', date: '2026-11-19', ledgerKeys: keys })).toEqual([])
    const hard = decideEscapeGrants({ roomId: 'lab', level: 'hard', date: '2026-11-19', ledgerKeys: keys })
    expect(hard.map((g) => [g.key, g.xp, g.coins])).toEqual([['escape:lab:hard', 180, 45]])
    expect(decideEscapeGrants({ roomId: 'lab', level: 'medium', date: '2026-11-20', ledgerKeys: keys }).map((g) => g.key)).toEqual(['daily:2026-11-20'])
  })
  it('counts days played in the last 7 days', () => {
    expect(daysPlayedLast7(['2026-11-12', '2026-11-13', '2026-11-19', '2026-11-19'], '2026-11-19')).toBe(2)
  })
})
