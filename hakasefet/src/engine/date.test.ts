import { describe, expect, it } from 'vitest'
import { addDays, formatDuration, israelDate, lastNDates, weekStart, weekday } from './date'

const at = (iso: string) => Date.parse(iso)

describe('israelDate', () => {
  it('rolls over at Israel midnight in winter (UTC+2)', () => {
    expect(israelDate(at('2026-11-19T21:59:59Z'))).toBe('2026-11-19')
    expect(israelDate(at('2026-11-19T22:00:00Z'))).toBe('2026-11-20')
  })
  it('rolls over at Israel midnight in summer (UTC+3)', () => {
    expect(israelDate(at('2026-07-01T20:59:59Z'))).toBe('2026-07-01')
    expect(israelDate(at('2026-07-01T21:00:00Z'))).toBe('2026-07-02')
  })
  it('handles the spring DST change (Fri 27 Mar 2026)', () => {
    // Before the change: UTC+2
    expect(israelDate(at('2026-03-26T21:59:59Z'))).toBe('2026-03-26')
    expect(israelDate(at('2026-03-26T22:00:00Z'))).toBe('2026-03-27')
    // After the change: UTC+3
    expect(israelDate(at('2026-03-27T20:59:59Z'))).toBe('2026-03-27')
    expect(israelDate(at('2026-03-27T21:00:00Z'))).toBe('2026-03-28')
  })
  it('handles the autumn DST change (Sun 25 Oct 2026)', () => {
    expect(israelDate(at('2026-10-24T20:59:59Z'))).toBe('2026-10-24')
    expect(israelDate(at('2026-10-24T21:00:00Z'))).toBe('2026-10-25')
    // 25 Oct is a 25-hour day; midnight is now at 22:00Z
    expect(israelDate(at('2026-10-25T21:59:59Z'))).toBe('2026-10-25')
    expect(israelDate(at('2026-10-25T22:00:00Z'))).toBe('2026-10-26')
  })
})

describe('calendar helpers', () => {
  it('weeks run Sunday to Saturday', () => {
    expect(weekday('2026-11-15')).toBe(0) // Sunday
    expect(weekStart('2026-11-15')).toBe('2026-11-15')
    expect(weekStart('2026-11-21')).toBe('2026-11-15') // Saturday
    expect(weekStart('2026-11-22')).toBe('2026-11-22')
  })
  it('adds days across months and DST', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(lastNDates('2026-11-19', 3)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19'])
  })
  it('formats durations', () => {
    expect(formatDuration(134_000)).toBe('2:14')
    expect(formatDuration(5_400)).toBe('0:05')
  })
})
