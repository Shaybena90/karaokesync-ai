import { describe, expect, it } from 'vitest'
import { flagsAt, loopClock, newGame, points, reduce, remainingMs, syncLoop, type Action, type GameState } from './engine'
import { getRoom } from './rooms'
import type { RoomDef } from './types'

let n = 0
const act = (a: Record<string, unknown>, now: number): Action => ({ id: `c${++n}`, by: { nick: 'נ', avatar: '🦊' }, now, ...a }) as Action
const start = (room: RoomDef, mode?: 'timed' | 'practice') => {
  let s = newGame(room)
  if (mode) s = reduce(room, s, act({ type: 'SET_MODE', mode }, 0)).state
  return reduce(room, s, act({ type: 'START' }, 0)).state
}
const run = (room: RoomDef, s: GameState, a: Record<string, unknown>, now: number) => reduce(room, s, act(a, now))

describe('escape collection engine', () => {
  const loop = getRoom('loop')!
  const bank = getRoom('bank')!
  const orbit = getRoom('orbit')!
  const phone = getRoom('phone')!

  it('scores 1000 − 25 per wrong submission − 50 per hint tier, never below 0', () => {
    let s = start(phone)
    s = run(phone, s, { type: 'SOLVE', hotspot: 'lockpad', input: '0000' }, 1).state
    s = run(phone, s, { type: 'PHINT', puzzle: 'phone-1' }, 2).state
    s = run(phone, s, { type: 'PHINT', puzzle: 'phone-1' }, 3).state
    expect(points(s)).toBe(1000 - 25 - 100)
    expect(points({ ...s, wrongAttempts: 99 })).toBe(0)
  })

  it('hints: three tiers per available puzzle only; reading and exploring never cost points', () => {
    let s = start(phone)
    for (let i = 0; i < 3; i++) {
      const r = run(phone, s, { type: 'PHINT', puzzle: 'phone-1' }, i)
      expect(r.outcome).toBe('ok')
      s = r.state
    }
    expect(run(phone, s, { type: 'PHINT', puzzle: 'phone-1' }, 9).outcome).toBe('invalid')
    expect(run(phone, s, { type: 'PHINT', puzzle: 'phone-6' }, 9).outcome).toBe('invalid') // not available yet
    const before = points(s)
    s = run(phone, s, { type: 'READ', hotspot: 'medical' }, 10).state
    expect(points(s)).toBe(before)
    expect(s.notebook!.length).toBeGreaterThan(0)
    // reading twice adds nothing
    expect(run(phone, s, { type: 'READ', hotspot: 'medical' }, 11).state.notebook).toEqual(s.notebook)
  })

  it('a wrong combination does not count as a wrong submission; the right one makes the item', () => {
    let s = start(orbit)
    for (const w of [{ type: 'SOLVE', hotspot: 'power', input: '100110' }, { type: 'TAKE', hotspot: 'bunk' }, { type: 'TAKE', hotspot: 'toolbox' }]) s = run(orbit, s, w, 1).state
    s = run(orbit, s, { type: 'COMBINE', a: 'half1', b: 'half1' }, 2).state
    expect(s.wrongAttempts).toBe(0)
    s = run(orbit, s, { type: 'COMBINE', a: 'half2', b: 'half1' }, 3).state
    expect(s.inventory).toEqual(['badge'])
    expect(s.flags).toContain('took:badge')
  })

  it('timed vault: the clock keeps running across reloads, stops actions at zero, and practice continues', () => {
    const s = start(bank)
    expect(s.mode).toBe('timed')
    expect(remainingMs(bank, s, 60_000)).toBe(19 * 60_000)
    // a reload is just the same saved state later
    const saved = JSON.parse(JSON.stringify(s)) as GameState
    const late = 20 * 60_000 + 1
    expect(remainingMs(bank, saved, late)).toBeLessThan(0)
    expect(run(bank, saved, { type: 'TAKE', hotspot: 'locker' }, late).outcome).toBe('invalid')
    const p = run(bank, saved, { type: 'SET_MODE', mode: 'practice' }, late).state
    expect(p.mode).toBe('practice')
    expect(p.timedOut).toBe(true)
    expect(remainingMs(bank, p, late)).toBe(Infinity)
    expect(run(bank, p, { type: 'TAKE', hotspot: 'locker' }, late + 1).outcome).toBe('ok')
    // practice never goes back to timed during play
    expect(run(bank, p, { type: 'SET_MODE', mode: 'timed' }, late + 2).outcome).toBe('invalid')
  })

  it('loop: objects reset every 7 minutes, the notebook and persisted solutions stay, and a reload restores the loop from timestamps', () => {
    let s = start(loop)
    s = run(loop, s, { type: 'READ', hotspot: 'clock' }, 1000).state
    const L = 7 * 60_000
    s = run(loop, s, { type: 'READ', hotspot: 'intercom' }, L + 2000).state // real time reaches the next loop
    expect(s.loop).toBe(1)
    expect(s.flags).toContain('k:looped')
    s = run(loop, s, { type: 'SOLVE', hotspot: 'schedule', input: 'drawer,lineB,blackout,reset' }, L + 3000).state
    s = run(loop, s, { type: 'WAIT', until: 2 }, L + 4000).state
    s = run(loop, s, { type: 'ACT', hotspot: 'drawer' }, L + 5000).state
    expect(s.inventory).toEqual(['fuse'])
    // a reload three loops later: same saved state, later timestamp
    const saved = JSON.parse(JSON.stringify(s)) as GameState
    const later = L + 5000 + 3 * L
    const synced = syncLoop(loop, saved, later)
    expect(synced.loop).toBe(loopClock(loop, saved, later).loop)
    expect(synced.inventory).toEqual([])
    expect(synced.flags).not.toContain('acted:drawer')
    expect(synced.flags).toContain('solved:schedule') // persisted
    expect(synced.notebook).toEqual(s.notebook)
    // syncing again is a no-op (no duplicate reset entries)
    expect(syncLoop(loop, synced, later)).toBe(synced)
  })

  it('loop: time-gated actions only work in their minute; practice moves only by waiting', () => {
    let s = start(loop, 'practice')
    expect(flagsAt(loop, s, 10 * 60_000)).toContain('min:0') // real time does not move the practice clock
    expect(run(loop, s, { type: 'ACT', hotspot: 'drawer' }, 2).outcome).toBe('invalid')
    s = run(loop, s, { type: 'WAIT', until: 2 }, 3).state
    expect(run(loop, s, { type: 'ACT', hotspot: 'drawer' }, 4).outcome).toBe('ok')
  })

  it('hidden objects cannot be used before they appear', () => {
    const s = start(phone)
    expect(run(phone, s, { type: 'READ', hotspot: 'calllog' }, 1).outcome).toBe('invalid')
  })
})
