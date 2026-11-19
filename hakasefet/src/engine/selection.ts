import type { Category, ContentPack, Level, Mystery, OptionId, Question } from '../content/types'
import { CATEGORIES } from '../content/types'
import { dayNumber } from './date'
import { seededShuffle } from './rng'

export const QUESTIONS_PER_ROOM = 2

/** The daily mystery: the pack's mysteries rotate, one per Israel calendar day. */
export function mysteryForDate(pack: ContentPack, date: string): Mystery {
  const n = pack.mysteries.length
  const idx = (((dayNumber(date) - dayNumber(pack.epoch)) % n) + n) % n
  return pack.mysteries[idx]
}

export function activePool(pack: ContentPack, category: Category, level: Level): Question[] {
  return pack.questions
    .filter((q) => q.status === 'active' && q.category === category && q.level === level)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

export interface PlannedQuestion {
  questionId: string
  category: Category
  /** Display order of the option ids. */
  optionOrder: OptionId[]
}

/**
 * Same content version + date + mystery + level → the same questions and the
 * same option order on every device. The room order is chosen by the player.
 */
export function planQuestions(pack: ContentPack, date: string, mysteryId: string, level: Level): Record<Category, PlannedQuestion[]> {
  const base = `${pack.version}|${date}|${mysteryId}|${level}`
  const out = {} as Record<Category, PlannedQuestion[]>
  for (const cat of CATEGORIES) {
    const pool = activePool(pack, cat, level)
    if (pool.length < QUESTIONS_PER_ROOM) throw new Error(`Not enough active ${level} questions in ${cat}`)
    out[cat] = seededShuffle(pool, `${base}|${cat}`)
      .slice(0, QUESTIONS_PER_ROOM)
      .map((q) => ({
        questionId: q.id,
        category: cat,
        optionOrder: seededShuffle(q.options.map((o) => o.id), `${base}|${q.id}`),
      }))
  }
  return out
}

export function questionIndex(pack: ContentPack): Map<string, Question> {
  return new Map(pack.questions.map((q) => [q.id, q]))
}
