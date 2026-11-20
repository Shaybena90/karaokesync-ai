import { describe, expect, it } from 'vitest'
import { COLLECTION, ROOMS } from './rooms'
import { validateRoom } from './validate'
import type { RoomDef } from './types'
import { phone } from './rooms/collection/phone'

const clone = (r: RoomDef): RoomDef => structuredClone(r)

describe('content validation', () => {
  it.each(ROOMS.map((r) => [r.id, r] as const))('room %s is valid', (_id, room) => {
    expect(validateRoom(room)).toEqual([])
  })

  it('every collection room has exactly six puzzles with three hints each', () => {
    expect(COLLECTION).toHaveLength(6)
    for (const r of COLLECTION) {
      expect(r.puzzles, r.id).toHaveLength(6)
      for (const p of r.puzzles!) expect(p.hints).toHaveLength(3)
      expect(r.blurb && r.goal && r.difficultyLabel && r.illustration, r.id).toBeTruthy()
    }
    // 6 solo rooms × 6 + the pair room's 6 = 42 puzzles
    expect(COLLECTION.reduce((a, r) => a + r.puzzles!.length, 0)).toBe(36)
  })

  it('catches duplicate ids', () => {
    const r = clone(phone)
    r.hotspots.push({ ...r.hotspots[0] })
    expect(validateRoom(r).join()).toMatch(/duplicate hotspot id/)
  })

  it('catches missing references', () => {
    const r = clone(phone)
    r.hotspots[0].scene = 'nowhere'
    r.combos = [{ a: 'ghost', b: 'ghost2', result: 'x', message: '' }]
    const e = validateRoom(r).join('\n')
    expect(e).toMatch(/scene "nowhere" does not exist/)
    expect(e).toMatch(/item "ghost" does not exist/)
  })

  it('catches unreachable puzzles and dependency cycles', () => {
    const r = clone(phone)
    r.puzzles![2] = { ...r.puzzles![2], doneWhen: 'solved:never' }
    expect(validateRoom(r).join()).toMatch(/never reached/)
    const c = clone(phone)
    c.puzzles![0] = { ...c.puzzles![0], availableWhen: [c.puzzles![5].doneWhen] }
    expect(validateRoom(c).join()).toMatch(/before it is available/)
  })

  it('catches a solution that does not match the lock', () => {
    const r = clone(phone)
    r.puzzles![0] = { ...r.puzzles![0], solution: 'משהו אחר' }
    expect(validateRoom(r).join()).toMatch(/does not match the lock answer/)
    const w = clone(phone)
    const step = w.walkthrough.findIndex((s) => 'solve' in s)
    w.walkthrough[step] = { solve: (w.walkthrough[step] as { solve: string }).solve, input: '0000' }
    expect(validateRoom(w).join()).toMatch(/was wrong/)
  })
})
