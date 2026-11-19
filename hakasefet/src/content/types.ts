export type Category = 'sports' | 'music' | 'general'
export type Level = 'normal' | 'hard'
export type OptionId = 'a' | 'b' | 'c' | 'd'

export const CATEGORIES: Category[] = ['sports', 'music', 'general']
export const LEVELS: Level[] = ['normal', 'hard']

export interface Question {
  /** Stable id — never reuse or renumber, mistakes and history point at it. */
  id: string
  category: Category
  level: Level
  text: string
  options: { id: OptionId; text: string }[]
  answerId: OptionId
  explanation: string
  /** Reference where the fact can be checked. */
  source: string
  /**
   * 'online' = checked against the source over the network.
   * 'offline' = stable, well-known fact reviewed by hand; not yet checked online.
   */
  verification: 'online' | 'offline'
  /** Only 'active' questions are served. 'review' = in doubt, kept out of play. */
  status: 'active' | 'review'
}

export interface Clue {
  /** Short heading shown on the investigation board. */
  title: string
  /** The clue itself. Must say how many digits it gives. */
  text: string
}

export interface Mystery {
  id: string
  title: string
  emoji: string
  /** Up to three sentences. */
  teaser: string
  clues: Record<Category, Clue>
  /** The order the board lists the clues in (numbered 1–3). */
  readingOrder: Category[]
  /** How to combine the clues, in plain words. */
  orderRule: string
  /** Always a string: codes may start with 0. */
  code: string
  /** Final hint (costs points). */
  hint: string
  /** Full explanation shown after the vault opens. */
  explanation: string
  prize: { title: string; emoji: string }
  /** Story teaser for the next mystery — shown only when that mystery really is next. */
  next?: { mysteryId: string; teaser: string }
}

export interface ContentPack {
  version: string
  /** Day 0 of the rotation (Israel calendar date). */
  epoch: string
  questions: Question[]
  mysteries: Mystery[]
}
