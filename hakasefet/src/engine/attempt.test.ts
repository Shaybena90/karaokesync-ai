import { describe, expect, it } from 'vitest'
import { packV1 } from '../content/v1'
import { CATEGORIES, type Category, type OptionId } from '../content/types'
import { createAttempt, currentQuestion, isExpired, makeCtx, reduce, summarize, type Action, type Attempt } from './attempt'
import { mysteryForDate, planQuestions } from './selection'

const DATE = '2026-11-19'
const mystery = mysteryForDate(packV1, DATE)
const ctx = makeCtx(packV1, mystery.id)
const T0 = Date.parse('2026-11-19T21:58:00Z') // 23:58 in Israel

function fresh(mode: Attempt['mode'] = 'daily', fixedRoomOrder?: Category[]) {
  return createAttempt({ id: 'att-1', mode, contentVersion: packV1.version, vaultDate: DATE, mysteryId: mystery.id, fixedRoomOrder, now: T0 })
}
const run = (a: Attempt, ...actions: Action[]) => actions.reduce((s, x) => reduce(s, x, ctx), a)
const correctOf = (a: Attempt) => ctx.question(currentQuestion(a)!.questionId).answerId
const wrongOf = (a: Attempt) => currentQuestion(a)!.optionOrder.find((o) => o !== correctOf(a)) as OptionId

describe('attempt state machine', () => {
  it('plays a full game: 6 questions, 3 clues, board, solve', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 })
    let t = T0
    for (const cat of ['music', 'general', 'sports'] as Category[]) {
      a = run(a, { type: 'ENTER_ROOM', category: cat, now: (t += 1000) })
      for (let i = 0; i < 2; i++) {
        a = run(a, { type: 'ANSWER', optionId: correctOf(a), now: (t += 15_000) }, { type: 'CONTINUE', now: (t += 500) })
      }
      expect(a.phase).toBe('clue')
      a = run(a, { type: 'CLOSE_CLUE', now: (t += 500) })
    }
    expect(a.phase).toBe('board')
    expect(a.roomOrder).toEqual(['music', 'general', 'sports'])
    expect(a.score).toBe(6 * 110)
    a = run(a, { type: 'SUBMIT_CODE', code: mystery.code, now: (t += 1000) })
    expect(a.phase).toBe('solved')
    const s = summarize(a)
    expect(s).toMatchObject({ correct: 6, total: 6, codeTries: 1, hintUsed: false })
    expect(s.durationMs).toBe(t - T0)
  })

  it('a double click cannot score twice or change the answer', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'hard', now: T0 }, { type: 'ENTER_ROOM', category: 'sports', now: T0 })
    const right = correctOf(a)
    a = run(a, { type: 'ANSWER', optionId: right, now: T0 + 1000 })
    const after = a
    a = run(a, { type: 'ANSWER', optionId: right, now: T0 + 1100 }, { type: 'ANSWER', optionId: wrongOf(a), now: T0 + 1200 })
    expect(a).toBe(after)
    expect(a.score).toBe(150 + 19)
  })

  it('a timeout counts as a mistake and waits for "continue"', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'music', now: T0 })
    expect(isExpired(a, T0 + 29_999)).toBe(false)
    expect(isExpired(a, T0 + 30_000)).toBe(true)
    a = run(a, { type: 'EXPIRE', now: T0 + 45_000 })
    expect(currentQuestion(a)!.answer).toMatchObject({ timedOut: true, correct: false, points: 0, answeredAt: T0 + 30_000 })
    expect(a.phase).toBe('question')
    // A late click after the deadline is a timeout, not a score.
    let b = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'music', now: T0 })
    b = run(b, { type: 'ANSWER', optionId: correctOf(b), now: T0 + 31_000 })
    expect(currentQuestion(b)!.answer!.timedOut).toBe(true)
    expect(b.score).toBe(0)
  })

  it('50/50 once per game, removes two wrong options, costs 20 with a floor of 0', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'general', now: T0 })
    a = run(a, { type: 'FIFTY', now: T0 + 1000 })
    const q = currentQuestion(a)!
    expect(q.removed).toHaveLength(2)
    expect(q.removed).not.toContain(correctOf(a))
    expect(a.score).toBe(0) // floor
    const before = a
    a = run(a, { type: 'ANSWER', optionId: q.removed![0], now: T0 + 2000 }) // removed option is not clickable
    expect(a).toBe(before)
    a = run(a, { type: 'ANSWER', optionId: correctOf(a), now: T0 + 2000 }, { type: 'CONTINUE', now: T0 + 3000 })
    const second = run(a, { type: 'FIFTY', now: T0 + 4000 })
    expect(second).toBe(a) // already used
  })

  it('50/50 is not allowed after answering', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'general', now: T0 })
    a = run(a, { type: 'ANSWER', optionId: correctOf(a), now: T0 + 1000 })
    expect(run(a, { type: 'FIFTY', now: T0 + 2000 })).toBe(a)
  })

  it('each room opens once; a challenge forces the sender\'s order', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'music', now: T0 })
    for (let i = 0; i < 2; i++) a = run(a, { type: 'ANSWER', optionId: correctOf(a), now: T0 + 1 }, { type: 'CONTINUE', now: T0 + 2 })
    a = run(a, { type: 'CLOSE_CLUE', now: T0 + 3 })
    expect(run(a, { type: 'ENTER_ROOM', category: 'music', now: T0 + 4 })).toBe(a)

    let c = run(fresh('challenge', ['general', 'sports', 'music']), { type: 'SELECT_LEVEL', level: 'hard', now: T0 })
    expect(run(c, { type: 'ENTER_ROOM', category: 'music', now: T0 })).toBe(c)
    c = run(c, { type: 'ENTER_ROOM', category: 'general', now: T0 })
    expect(c.phase).toBe('question')
  })

  it('wrong code −20 (floor 0), hint −30 once', () => {
    let a = fresh()
    a = { ...a, phase: 'board', level: 'normal', score: 25 }
    a = run(a, { type: 'SUBMIT_CODE', code: '12a4', now: T0 }) // invalid input ignored
    expect(a.codeTries).toBe(0)
    const wrong = mystery.code === '0000' ? '1111' : '0000'
    a = run(a, { type: 'SUBMIT_CODE', code: wrong, now: T0 })
    expect(a).toMatchObject({ score: 5, codeTries: 1, phase: 'board' })
    a = run(a, { type: 'USE_HINT', now: T0 }, { type: 'USE_HINT', now: T0 })
    expect(a).toMatchObject({ score: 0, hintUsed: true })
    a = run(a, { type: 'SUBMIT_CODE', code: mystery.code, now: T0 })
    expect(a).toMatchObject({ phase: 'solved', codeTries: 2 })
  })

  it('restores from storage (JSON round-trip) and keeps its vault date after midnight', () => {
    let a = run(fresh(), { type: 'SELECT_LEVEL', level: 'normal', now: T0 }, { type: 'ENTER_ROOM', category: 'sports', now: T0 })
    const restored: Attempt = JSON.parse(JSON.stringify(a))
    expect(restored).toEqual(a)
    // Two minutes later it is already the next day in Israel; the deadline still applies.
    const afterMidnight = T0 + 3 * 60_000
    const b = run(restored, { type: 'EXPIRE', now: afterMidnight })
    expect(currentQuestion(b)!.answer!.timedOut).toBe(true)
    expect(b.vaultDate).toBe(DATE)
    expect(b.questions!.sports.map((q) => q.questionId)).toEqual(planQuestions(packV1, DATE, mystery.id, 'normal').sports.map((q) => q.questionId))
  })
})

describe('deterministic selection', () => {
  it('same version + date + mystery + level → same questions and option order', () => {
    const p1 = planQuestions(packV1, DATE, mystery.id, 'hard')
    const p2 = planQuestions(packV1, DATE, mystery.id, 'hard')
    expect(p1).toEqual(p2)
  })
  it('never repeats a question inside an attempt, and respects category + level', () => {
    for (let d = 0; d < 60; d++) {
      const date = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10)
      for (const level of ['normal', 'hard'] as const) {
        const m = mysteryForDate(packV1, date)
        const plan = planQuestions(packV1, date, m.id, level)
        const ids = CATEGORIES.flatMap((c) => plan[c].map((q) => q.questionId))
        expect(new Set(ids).size).toBe(6)
        for (const c of CATEGORIES) for (const pq of plan[c]) {
          const q = ctx.question(pq.questionId)
          expect(q.category).toBe(c)
          expect(q.level).toBe(level)
          expect([...pq.optionOrder].sort()).toEqual(['a', 'b', 'c', 'd'])
        }
      }
    }
  })
  it('different levels give different question sets', () => {
    const n = planQuestions(packV1, DATE, mystery.id, 'normal')
    const h = planQuestions(packV1, DATE, mystery.id, 'hard')
    expect(n.sports[0].questionId).not.toBe(h.sports[0].questionId)
  })
  it('mysteries rotate daily through the whole pack', () => {
    const ids = new Set(Array.from({ length: packV1.mysteries.length }, (_, i) => mysteryForDate(packV1, new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10)).id))
    expect(ids.size).toBe(packV1.mysteries.length)
  })
})
