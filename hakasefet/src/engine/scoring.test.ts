import { describe, expect, it } from 'vitest'
import { applyPenalty, questionPoints, timeBonus } from './scoring'

describe('scoring', () => {
  it('time bonus is floor(20 × remaining / 30000), max 20', () => {
    expect(timeBonus(30_000)).toBe(20)
    expect(timeBonus(29_999)).toBe(19)
    expect(timeBonus(15_000)).toBe(10)
    expect(timeBonus(1_499)).toBe(0)
    expect(timeBonus(-5)).toBe(0)
    expect(timeBonus(99_999)).toBe(20)
  })
  it('correct answers: 100 normal / 150 hard plus bonus', () => {
    expect(questionPoints('normal', true, 30_000)).toBe(120)
    expect(questionPoints('hard', true, 15_000)).toBe(160)
  })
  it('wrong answer or timeout is zero', () => {
    expect(questionPoints('hard', false, 30_000)).toBe(0)
    expect(questionPoints('normal', false, 0)).toBe(0)
  })
  it('penalties never go below zero', () => {
    expect(applyPenalty(50, 20)).toBe(30)
    expect(applyPenalty(10, 20)).toBe(0)
    expect(applyPenalty(0, 30)).toBe(0)
  })
})
