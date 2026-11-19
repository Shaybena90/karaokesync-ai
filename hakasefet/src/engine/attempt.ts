import type { Category, ContentPack, Level, Mystery, OptionId, Question } from '../content/types'
import { CATEGORIES } from '../content/types'
import { applyPenalty, FIFTY_COST, HINT_COST, QUESTION_MS, questionPoints, WRONG_CODE_COST } from './scoring'
import { planQuestions, type PlannedQuestion } from './selection'
import { seededShuffle } from './rng'

/**
 * One play-through of a vault, as a plain serialisable object.
 * Everything needed to resume after a refresh is stored here.
 *
 *   level → map ⇄ (question → … → clue) → board → solved
 */
export type Phase = 'level' | 'map' | 'question' | 'clue' | 'board' | 'solved'
export type AttemptMode = 'daily' | 'archive' | 'challenge'

export interface AnswerRecord {
  optionId: OptionId | null // null = time ran out
  correct: boolean
  timedOut: boolean
  points: number
  answeredAt: number
}

export interface QuestionState extends PlannedQuestion {
  shownAt?: number
  deadline?: number
  removed?: OptionId[]
  answer?: AnswerRecord
}

export interface Attempt {
  schema: 1
  id: string
  mode: AttemptMode
  contentVersion: string
  /** Israel date of the vault. Fixed when the attempt is created, even if it ends after midnight. */
  vaultDate: string
  mysteryId: string
  level?: Level
  /** A challenge link fixes the room order; otherwise the player chooses. */
  fixedRoomOrder?: Category[]
  roomOrder: Category[]
  questions?: Record<Category, QuestionState[]>
  phase: Phase
  current?: { category: Category; index: number }
  revealedClues: Category[]
  score: number
  fiftyUsed: boolean
  fiftyQuestionId?: string
  codeTries: number
  hintUsed: boolean
  createdAt: number
  startedAt?: number
  solvedAt?: number
  updatedAt: number
}

export type Action =
  | { type: 'SELECT_LEVEL'; level: Level; now: number }
  | { type: 'ENTER_ROOM'; category: Category; now: number }
  | { type: 'ANSWER'; optionId: OptionId; now: number }
  | { type: 'EXPIRE'; now: number }
  | { type: 'FIFTY'; now: number }
  | { type: 'CONTINUE'; now: number }
  | { type: 'CLOSE_CLUE'; now: number }
  | { type: 'SUBMIT_CODE'; code: string; now: number }
  | { type: 'USE_HINT'; now: number }

export interface Ctx {
  pack: ContentPack
  mystery: Mystery
  question: (id: string) => Question
}

export function makeCtx(pack: ContentPack, mysteryId: string): Ctx {
  const mystery = pack.mysteries.find((m) => m.id === mysteryId)
  if (!mystery) throw new Error(`Unknown mystery ${mysteryId}`)
  const byId = new Map(pack.questions.map((q) => [q.id, q]))
  return {
    pack,
    mystery,
    question: (id) => {
      const q = byId.get(id)
      if (!q) throw new Error(`Unknown question ${id}`)
      return q
    },
  }
}

export function createAttempt(p: {
  id: string
  mode: AttemptMode
  contentVersion: string
  vaultDate: string
  mysteryId: string
  fixedRoomOrder?: Category[]
  level?: Level
  now: number
}): Attempt {
  return {
    schema: 1,
    id: p.id,
    mode: p.mode,
    contentVersion: p.contentVersion,
    vaultDate: p.vaultDate,
    mysteryId: p.mysteryId,
    fixedRoomOrder: p.fixedRoomOrder,
    roomOrder: [],
    phase: 'level',
    revealedClues: [],
    score: 0,
    fiftyUsed: false,
    codeTries: 0,
    hintUsed: false,
    createdAt: p.now,
    updatedAt: p.now,
  }
}

export function currentQuestion(a: Attempt): QuestionState | undefined {
  if (!a.current || !a.questions) return undefined
  return a.questions[a.current.category][a.current.index]
}

/** Rooms still allowed to open next. */
export function openableRooms(a: Attempt): Category[] {
  const left = CATEGORIES.filter((c) => !a.roomOrder.includes(c))
  if (a.fixedRoomOrder) {
    const next = a.fixedRoomOrder[a.roomOrder.length]
    return next ? [next] : []
  }
  return left
}

function showQuestion(a: Attempt, category: Category, index: number, now: number): Attempt {
  const questions = { ...a.questions! }
  const list = questions[category].slice()
  list[index] = { ...list[index], shownAt: now, deadline: now + QUESTION_MS }
  questions[category] = list
  return { ...a, questions, current: { category, index }, phase: 'question' }
}

function patchCurrent(a: Attempt, patch: Partial<QuestionState>): Attempt {
  const { category, index } = a.current!
  const questions = { ...a.questions! }
  const list = questions[category].slice()
  list[index] = { ...list[index], ...patch }
  questions[category] = list
  return { ...a, questions }
}

/**
 * Pure state machine. Invalid or repeated actions return the same object,
 * so a double click can never score twice or change a submitted answer.
 */
export function reduce(a: Attempt, action: Action, ctx: Ctx): Attempt {
  const next = step(a, action, ctx)
  return next === a ? a : { ...next, updatedAt: action.now }
}

function step(a: Attempt, action: Action, ctx: Ctx): Attempt {
  switch (action.type) {
    case 'SELECT_LEVEL': {
      if (a.phase !== 'level') return a
      const plan = planQuestions(ctx.pack, a.vaultDate, a.mysteryId, action.level)
      return { ...a, level: action.level, questions: plan, phase: 'map', startedAt: action.now }
    }
    case 'ENTER_ROOM': {
      if (a.phase !== 'map' || !openableRooms(a).includes(action.category)) return a
      const withRoom = { ...a, roomOrder: [...a.roomOrder, action.category] }
      return showQuestion(withRoom, action.category, 0, action.now)
    }
    case 'ANSWER': {
      const q = currentQuestion(a)
      if (a.phase !== 'question' || !q || q.answer) return a
      if (q.removed?.includes(action.optionId)) return a
      if (q.deadline !== undefined && action.now >= q.deadline) return expire(a, q.deadline)
      const correct = ctx.question(q.questionId).answerId === action.optionId
      const remaining = (q.deadline ?? action.now) - action.now
      const points = questionPoints(a.level!, correct, remaining)
      const withAnswer = patchCurrent(a, {
        answer: { optionId: action.optionId, correct, timedOut: false, points, answeredAt: action.now },
      })
      return { ...withAnswer, score: a.score + points }
    }
    case 'EXPIRE': {
      const q = currentQuestion(a)
      if (a.phase !== 'question' || !q || q.answer || q.deadline === undefined || action.now < q.deadline) return a
      return expire(a, q.deadline)
    }
    case 'FIFTY': {
      const q = currentQuestion(a)
      if (a.phase !== 'question' || !q || q.answer || a.fiftyUsed) return a
      if (q.deadline !== undefined && action.now >= q.deadline) return a
      const answerId = ctx.question(q.questionId).answerId
      const wrong = q.optionOrder.filter((o) => o !== answerId)
      const removed = seededShuffle(wrong, `${a.id}|fifty|${q.questionId}`).slice(0, 2)
      const patched = patchCurrent(a, { removed })
      return { ...patched, fiftyUsed: true, fiftyQuestionId: q.questionId, score: applyPenalty(a.score, FIFTY_COST) }
    }
    case 'CONTINUE': {
      const q = currentQuestion(a)
      if (a.phase !== 'question' || !q?.answer) return a
      const { category, index } = a.current!
      if (index + 1 < a.questions![category].length) return showQuestion(a, category, index + 1, action.now)
      return { ...a, phase: 'clue', revealedClues: [...a.revealedClues, category] }
    }
    case 'CLOSE_CLUE': {
      if (a.phase !== 'clue') return a
      return { ...a, phase: a.roomOrder.length === CATEGORIES.length ? 'board' : 'map', current: undefined }
    }
    case 'SUBMIT_CODE': {
      if (a.phase !== 'board') return a
      const code = action.code.trim()
      if (!/^\d{4}$/.test(code)) return a
      const tries = a.codeTries + 1
      if (code === ctx.mystery.code) return { ...a, codeTries: tries, phase: 'solved', solvedAt: action.now }
      return { ...a, codeTries: tries, score: applyPenalty(a.score, WRONG_CODE_COST) }
    }
    case 'USE_HINT': {
      if (a.phase !== 'board' || a.hintUsed) return a
      return { ...a, hintUsed: true, score: applyPenalty(a.score, HINT_COST) }
    }
  }
}

function expire(a: Attempt, at: number): Attempt {
  return patchCurrent(a, { answer: { optionId: null, correct: false, timedOut: true, points: 0, answeredAt: at } })
}

/** Should a timer check expire the current question now? */
export function isExpired(a: Attempt, now: number): boolean {
  const q = currentQuestion(a)
  return a.phase === 'question' && !!q && !q.answer && q.deadline !== undefined && now >= q.deadline
}

export function allQuestions(a: Attempt): QuestionState[] {
  if (!a.questions) return []
  return a.roomOrder.flatMap((c) => a.questions![c])
}

export interface AttemptSummary {
  score: number
  correct: number
  total: number
  accuracy: number
  durationMs: number
  codeTries: number
  hintUsed: boolean
  fiftyUsed: boolean
  wrongQuestionIds: string[]
}

export function summarize(a: Attempt): AttemptSummary {
  const qs = a.questions ? CATEGORIES.flatMap((c) => a.questions![c]) : []
  const answered = qs.filter((q) => q.answer)
  const correct = answered.filter((q) => q.answer!.correct).length
  const total = qs.length
  return {
    score: a.score,
    correct,
    total,
    accuracy: total ? correct / total : 0,
    durationMs: (a.solvedAt ?? a.updatedAt) - (a.startedAt ?? a.createdAt),
    codeTries: a.codeTries,
    hintUsed: a.hintUsed,
    fiftyUsed: a.fiftyUsed,
    wrongQuestionIds: answered.filter((q) => !q.answer!.correct).map((q) => q.questionId),
  }
}
