import type { Category, Level, Question } from './types'

/**
 * Compact authoring helper. The correct answer is written first;
 * the game shuffles the display order deterministically per attempt.
 */
export function q(
  id: string,
  category: Category,
  level: Level,
  text: string,
  options: [string, string, string, string],
  explanation: string,
  source: string,
  extra: Partial<Pick<Question, 'verification' | 'status'>> = {},
): Question {
  const ids = ['a', 'b', 'c', 'd'] as const
  return {
    id,
    category,
    level,
    text,
    options: options.map((t, i) => ({ id: ids[i], text: t })),
    answerId: 'a',
    explanation,
    source,
    verification: extra.verification ?? 'offline',
    status: extra.status ?? 'active',
  }
}
