import { describe, expect, it } from 'vitest'
import { DOOR_CODES, newPairState, pairPoints, pairReduce, viewFor, type PairAction, type PairState, type Role } from './logic'

type Body = { role: Role; type: 'answer' | 'hint' | 'exit'; stage: number; value?: string; id?: string }

let n = 0
const started = (): PairState => ({ ...newPairState(), startedAt: 0 })
const go = (s: PairState, a: Body) => pairReduce(s, { id: a.id ?? `p${++n}`, ...a } as PairAction, 1)

const SOLUTION: Body[] = [
  { role: 'B', type: 'answer', stage: 0, value: 'ג3' },
  { role: 'A', type: 'answer', stage: 1, value: '9742' },
  { role: 'B', type: 'answer', stage: 2, value: '10010' },
  { role: 'A', type: 'answer', stage: 3, value: 'שלום' },
  { role: 'B', type: 'answer', stage: 4, value: 'חירות' },
  { role: 'A', type: 'answer', stage: 5, value: DOOR_CODES.A },
  { role: 'B', type: 'answer', stage: 5, value: DOOR_CODES.B },
  { role: 'A', type: 'exit', stage: 6 },
  { role: 'B', type: 'exit', stage: 6 },
]

describe('two-player room logic', () => {
  it('the full solution finishes the room with 1000 points', () => {
    let s = started()
    for (const a of SOLUTION) {
      const r = go(s, a)
      expect(r.outcome, JSON.stringify(a)).toBe('ok')
      s = r.state
    }
    expect(s.finishedAt).toBe(1)
    expect(pairPoints(s)).toBe(1000)
  })

  it('nothing happens before both are ready (no start time)', () => {
    expect(go(newPairState(), SOLUTION[0]).outcome).toBe('invalid')
  })

  it('only the role holding the input may answer, and only for the current stage', () => {
    const s = started()
    expect(go(s, { role: 'A', type: 'answer', stage: 0, value: 'ג3' }).outcome).toBe('invalid')
    expect(go(s, { role: 'B', type: 'answer', stage: 1, value: '9742' }).outcome).toBe('invalid')
  })

  it('a wrong answer costs 25, a hint tier 50 (shared), max three tiers', () => {
    let s = go(started(), { role: 'B', type: 'answer', stage: 0, value: 'א1' }).state
    for (let i = 0; i < 3; i++) s = go(s, { role: i % 2 ? 'A' : 'B', type: 'hint', stage: 0 }).state
    expect(go(s, { role: 'A', type: 'hint', stage: 0 }).outcome).toBe('invalid')
    expect(pairPoints(s)).toBe(1000 - 25 - 150)
  })

  it('actions are idempotent: the same id is applied once', () => {
    const s = started()
    const a = go(s, { id: 'same', role: 'B', type: 'answer', stage: 0, value: 'א1' }).state
    const b = go(a, { id: 'same', role: 'B', type: 'answer', stage: 0, value: 'א1' }).state
    expect(b.wrong).toBe(1)
  })

  it('each role sees only its own documents', () => {
    const s = started()
    const A = JSON.stringify(viewFor(s, 'A'))
    const B = JSON.stringify(viewFor(s, 'B'))
    expect(A).toContain('מגדלור')
    expect(B).not.toContain('מגדלור')
    expect(B).toContain('מאיר בלילה')
    expect(A).not.toContain('מאיר בלילה')
    expect(viewFor(s, 'A').input).toBeUndefined()
    expect(viewFor(s, 'B').input?.kind).toBe('choice')
  })

  it('stage 6 gives each side the other side\'s code; both codes and both exits are needed', () => {
    let s = started()
    for (const a of SOLUTION.slice(0, 5)) s = go(s, a).state
    expect(JSON.stringify(viewFor(s, 'A'))).toContain(DOOR_CODES.B)
    expect(JSON.stringify(viewFor(s, 'A'))).not.toContain(DOOR_CODES.A)
    expect(go(s, { role: 'A', type: 'answer', stage: 5, value: DOOR_CODES.B }).outcome).toBe('wrong')
    s = go(s, SOLUTION[5]).state
    expect(s.stage).toBe(5)
    expect(viewFor(s, 'A').input).toBeUndefined()
    s = go(s, SOLUTION[6]).state
    s = go(s, SOLUTION[7]).state
    expect(s.finishedAt).toBeUndefined()
    s = go(s, SOLUTION[8]).state
    expect(s.finishedAt).toBeDefined()
  })
})
