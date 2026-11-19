import type { Level } from '../content/types'

export const QUESTION_MS = 30_000
export const BASE_POINTS: Record<Level, number> = { normal: 100, hard: 150 }
export const MAX_TIME_BONUS = 20
export const FIFTY_COST = 20
export const WRONG_CODE_COST = 20
export const HINT_COST = 30

/** floor(20 × remainingMs / 30000), clamped to 0…20. */
export function timeBonus(remainingMs: number): number {
  const r = Math.min(Math.max(remainingMs, 0), QUESTION_MS)
  return Math.min(MAX_TIME_BONUS, Math.floor((MAX_TIME_BONUS * r) / QUESTION_MS))
}

/** Points for one answer. Wrong answers and timeouts are worth 0. */
export function questionPoints(level: Level, correct: boolean, remainingMs: number): number {
  return correct ? BASE_POINTS[level] + timeBonus(remainingMs) : 0
}

/** Subtract a penalty; the score never goes below zero. */
export function applyPenalty(score: number, cost: number): number {
  return Math.max(0, score - cost)
}
