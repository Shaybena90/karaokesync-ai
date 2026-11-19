import { describe, expect, it } from 'vitest'
import { activeDaysInWeek, daysPlayedLast7, decideGrants, rankInfo } from './rewards'

describe('rewards', () => {
  it('ranks every 300 XP', () => {
    expect(rankInfo(0)).toMatchObject({ rank: 1, into: 0 })
    expect(rankInfo(299)).toMatchObject({ rank: 1, into: 299 })
    expect(rankInfo(300)).toMatchObject({ rank: 2, into: 0 })
  })
  it('daily reward once per vault date', () => {
    const first = decideGrants({ mode: 'daily', vaultDate: '2026-11-19', ledgerKeys: new Set(), activityDates: [] })
    expect(first).toEqual([{ key: 'daily:2026-11-19', kind: 'daily', xp: 100, coins: 20, date: '2026-11-19' }])
    const again = decideGrants({ mode: 'daily', vaultDate: '2026-11-19', ledgerKeys: new Set(['daily:2026-11-19']), activityDates: ['2026-11-19'] })
    expect(again).toEqual([])
  })
  it('archive and old challenges give no reward', () => {
    expect(decideGrants({ mode: 'archive', vaultDate: '2026-11-18', ledgerKeys: new Set(), activityDates: [] })).toEqual([])
    expect(decideGrants({ mode: 'challenge', vaultDate: '2026-11-18', ledgerKeys: new Set(), activityDates: [] })).toEqual([])
  })
  it('weekly bonus on the 5th distinct day of a Sun–Sat week, once', () => {
    const four = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']
    const keys = new Set(four.map((d) => `daily:${d}`))
    const g = decideGrants({ mode: 'daily', vaultDate: '2026-11-19', ledgerKeys: keys, activityDates: four })
    expect(g.map((x) => x.key)).toEqual(['daily:2026-11-19', 'weekly:2026-11-15'])
    expect(g[1].coins).toBe(30)
    keys.add('daily:2026-11-19').add('weekly:2026-11-15')
    const sixth = decideGrants({ mode: 'daily', vaultDate: '2026-11-20', ledgerKeys: keys, activityDates: [...four, '2026-11-19'] })
    expect(sixth.map((x) => x.key)).toEqual(['daily:2026-11-20'])
  })
  it('days from the previous week do not count', () => {
    const dates = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'] // Thu, Fri, Sat | Sun
    expect(activeDaysInWeek(dates, '2026-11-16')).toBe(1)
    const g = decideGrants({ mode: 'daily', vaultDate: '2026-11-16', ledgerKeys: new Set(), activityDates: dates })
    expect(g.map((x) => x.kind)).toEqual(['daily'])
  })
  it('counts days played in the last 7 days', () => {
    expect(daysPlayedLast7(['2026-11-12', '2026-11-13', '2026-11-19', '2026-11-19'], '2026-11-19')).toBe(2)
  })
})
