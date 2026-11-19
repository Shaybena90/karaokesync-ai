import { describe, expect, it } from 'vitest'
import { daysPlayedLast7, decideEscapeGrants, rankInfo } from './rewards'

describe('rewards', () => {
  it('ranks every 300 XP', () => {
    expect(rankInfo(0)).toMatchObject({ rank: 1, into: 0 })
    expect(rankInfo(299)).toMatchObject({ rank: 1, into: 299 })
    expect(rankInfo(300)).toMatchObject({ rank: 2, into: 0 })
  })
  it('first escape per room and first escape per day, each once', () => {
    const first = decideEscapeGrants({ roomId: 'lab', date: '2026-11-19', ledgerKeys: new Set() })
    expect(first.map((g) => [g.key, g.xp, g.coins])).toEqual([['escape:lab', 100, 30], ['daily:2026-11-19', 50, 20]])
    const sameDayOtherRoom = decideEscapeGrants({ roomId: 'station', date: '2026-11-19', ledgerKeys: new Set(['escape:lab', 'daily:2026-11-19']) })
    expect(sameDayOtherRoom.map((g) => g.key)).toEqual(['escape:station'])
    const replay = decideEscapeGrants({ roomId: 'lab', date: '2026-11-19', ledgerKeys: new Set(['escape:lab', 'daily:2026-11-19']) })
    expect(replay).toEqual([])
    const nextDay = decideEscapeGrants({ roomId: 'lab', date: '2026-11-20', ledgerKeys: new Set(['escape:lab', 'daily:2026-11-19']) })
    expect(nextDay.map((g) => g.key)).toEqual(['daily:2026-11-20'])
  })
  it('counts days played in the last 7 days', () => {
    expect(daysPlayedLast7(['2026-11-12', '2026-11-13', '2026-11-19', '2026-11-19'], '2026-11-19')).toBe(2)
  })
})
