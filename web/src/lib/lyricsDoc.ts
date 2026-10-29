/**
 * The lyrics document edited in the karaoke editor, and every edit operation
 * as a pure function (doc in → new doc out). Pure operations make undo/redo
 * trivial and are unit tested in lyricsDoc.test.ts.
 *
 * Invariants kept by every operation:
 *   - word start times never decrease across the whole song (same rule the
 *     database enforces in save_lyrics),
 *   - end_ms >= start_ms >= 0,
 *   - no empty lines, no empty words.
 */
import type { LyricLine } from './types'

export interface DocWord {
  id: string
  text: string
  start_ms: number
  end_ms: number
  /** 0..1 from the AI; 1 once the user edited the word; null if unknown. */
  confidence: number | null
}

export interface DocLine {
  id: string
  words: DocWord[]
}

export type LyricsDoc = DocLine[]

export const MAX_WORD_LENGTH = 100
const MIN_NEW_WORD_MS = 200

export const newId = (): string => crypto.randomUUID()

export function fromLyricLines(lines: LyricLine[]): LyricsDoc {
  return lines
    .filter((l) => l.words.length > 0)
    .map((l) => ({
      id: l.id,
      words: l.words.map((w) => ({ id: w.id, text: w.text, start_ms: w.start_ms, end_ms: w.end_ms, confidence: w.confidence })),
    }))
}

export function lineStart(line: DocLine): number {
  return line.words[0]?.start_ms ?? 0
}

export function lineEnd(line: DocLine): number {
  return line.words.reduce((max, w) => Math.max(max, w.end_ms), 0)
}

export interface WordPos {
  line: number
  word: number
}

export function findWord(doc: LyricsDoc, id: string): WordPos | null {
  for (let l = 0; l < doc.length; l++) {
    const w = doc[l].words.findIndex((x) => x.id === id)
    if (w >= 0) return { line: l, word: w }
  }
  return null
}

/** All words in song order. */
export function flatWords(doc: LyricsDoc): DocWord[] {
  return doc.flatMap((l) => l.words)
}

function neighbours(doc: LyricsDoc, id: string): { prev: DocWord | null; next: DocWord | null } {
  const all = flatWords(doc)
  const i = all.findIndex((w) => w.id === id)
  return { prev: i > 0 ? all[i - 1] : null, next: i >= 0 && i < all.length - 1 ? all[i + 1] : null }
}

function mapWord(doc: LyricsDoc, id: string, fn: (w: DocWord) => DocWord[]): LyricsDoc {
  return doc
    .map((line) => (line.words.some((w) => w.id === id) ? { ...line, words: line.words.flatMap((w) => (w.id === id ? fn(w) : [w])) } : line))
    .filter((line) => line.words.length > 0)
}

// ------------------------------------------------------------------ text
/**
 * Change a word's text. Typing several words ("hello world") splits it into
 * several words, sharing the original time span in proportion to their length.
 */
export function setWordText(doc: LyricsDoc, id: string, text: string): LyricsDoc {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.slice(0, MAX_WORD_LENGTH))
  if (parts.length === 0) return doc
  return mapWord(doc, id, (w) => {
    if (parts.length === 1) return [{ ...w, text: parts[0], confidence: 1 }]
    const total = parts.reduce((n, p) => n + p.length, 0)
    const span = w.end_ms - w.start_ms
    let cursor = w.start_ms
    return parts.map((p, i) => {
      const start = cursor
      const end = i === parts.length - 1 ? w.end_ms : Math.round(start + (span * p.length) / total)
      cursor = end
      return { id: i === 0 ? w.id : newId(), text: p, start_ms: start, end_ms: end, confidence: 1 }
    })
  })
}

// ---------------------------------------------------------------- timing
/**
 * Set a word's start/end. The start is kept between the previous and the next
 * word's start (so the song order never breaks); end >= start; both within
 * the audio duration when it is known.
 */
export function setWordTiming(doc: LyricsDoc, id: string, startMs: number, endMs: number, durationMs?: number): LyricsDoc {
  const { prev, next } = neighbours(doc, id)
  const max = durationMs && durationMs > 0 ? Math.round(durationMs) : Number.POSITIVE_INFINITY
  let start = Math.round(Math.max(0, startMs, prev?.start_ms ?? 0))
  if (next) start = Math.min(start, next.start_ms)
  start = Math.min(start, max)
  const end = Math.round(Math.min(Math.max(endMs, start), max))
  return mapWord(doc, id, (w) => (w.start_ms === start && w.end_ms === end ? [w] : [{ ...w, start_ms: start, end_ms: end, confidence: 1 }]))
}

/** Move a whole line (or the whole song when lineId is null) by delta ms. */
export function shiftTiming(doc: LyricsDoc, lineId: string | null, deltaMs: number, durationMs?: number): LyricsDoc {
  const idx = lineId === null ? -1 : doc.findIndex((l) => l.id === lineId)
  if (lineId !== null && idx < 0) return doc
  const target = lineId === null ? flatWords(doc) : doc[idx].words
  if (target.length === 0) return doc
  const all = flatWords(doc)
  const firstIdx = all.indexOf(target[0])
  const lastIdx = all.indexOf(target[target.length - 1])
  const lower = firstIdx > 0 ? all[firstIdx - 1].start_ms : 0
  const upper = lastIdx < all.length - 1 ? all[lastIdx + 1].start_ms : Number.POSITIVE_INFINITY
  const max = durationMs && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  // Clamp the delta so the moved words stay between their neighbours.
  let delta = Math.round(deltaMs)
  delta = Math.max(delta, lower - target[0].start_ms)
  delta = Math.min(delta, upper - target[target.length - 1].start_ms, max - target[target.length - 1].end_ms)
  if (delta === 0) return doc
  const ids = new Set(target.map((w) => w.id))
  return doc.map((line) =>
    line.words.some((w) => ids.has(w.id))
      ? {
          ...line,
          words: line.words.map((w) =>
            ids.has(w.id) ? { ...w, start_ms: Math.max(0, w.start_ms + delta), end_ms: Math.max(0, w.end_ms + delta) } : w,
          ),
        }
      : line,
  )
}

// ------------------------------------------------------- add / remove words
/** Insert a new word before/after an existing one. Returns the doc and the new id. */
export function insertWord(doc: LyricsDoc, id: string, where: 'before' | 'after', text: string): { doc: LyricsDoc; id: string } {
  const clean = text.trim().split(/\s+/)[0]?.slice(0, MAX_WORD_LENGTH)
  const pos = findWord(doc, id)
  if (!clean || !pos) return { doc, id }
  const { prev, next } = neighbours(doc, id)
  const anchor = doc[pos.line].words[pos.word]
  const newWordId = newId()

  let replacedAnchor = anchor
  let start: number
  let end: number
  if (where === 'after') {
    const gapEnd = next ? next.start_ms : anchor.end_ms + 1000
    if (gapEnd - anchor.end_ms >= MIN_NEW_WORD_MS) {
      start = anchor.end_ms
      end = Math.min(gapEnd, anchor.end_ms + 600)
    } else {
      // No free time: share the anchor's time span.
      let mid = Math.round((anchor.start_ms + anchor.end_ms) / 2)
      if (next) mid = Math.min(mid, next.start_ms)
      replacedAnchor = { ...anchor, end_ms: mid }
      start = mid
      end = Math.max(mid, anchor.end_ms)
    }
  } else {
    const gapStart = prev ? prev.end_ms : Math.max(0, anchor.start_ms - 1000)
    if (anchor.start_ms - gapStart >= MIN_NEW_WORD_MS) {
      start = Math.max(gapStart, anchor.start_ms - 600)
      end = anchor.start_ms
    } else {
      const mid = Math.round((anchor.start_ms + anchor.end_ms) / 2)
      replacedAnchor = { ...anchor, start_ms: mid }
      start = anchor.start_ms
      end = mid
    }
  }
  const created: DocWord = { id: newWordId, text: clean, start_ms: start, end_ms: end, confidence: 1 }
  const words = [...doc[pos.line].words]
  words.splice(pos.word, 1, ...(where === 'after' ? [replacedAnchor, created] : [created, replacedAnchor]))
  return { doc: doc.map((l, i) => (i === pos.line ? { ...l, words } : l)), id: newWordId }
}

export function deleteWord(doc: LyricsDoc, id: string): LyricsDoc {
  return mapWord(doc, id, () => [])
}

// ----------------------------------------------------------- line splitting
/** Start a new line at this word (the word and those after it move down). */
export function splitLineAt(doc: LyricsDoc, wordId: string): LyricsDoc {
  const pos = findWord(doc, wordId)
  if (!pos || pos.word === 0) return doc
  const line = doc[pos.line]
  const first: DocLine = { ...line, words: line.words.slice(0, pos.word) }
  const second: DocLine = { id: newId(), words: line.words.slice(pos.word) }
  return [...doc.slice(0, pos.line), first, second, ...doc.slice(pos.line + 1)]
}

/** Join a line with the following one. */
export function mergeWithNext(doc: LyricsDoc, lineId: string): LyricsDoc {
  const i = doc.findIndex((l) => l.id === lineId)
  if (i < 0 || i >= doc.length - 1) return doc
  const merged: DocLine = { ...doc[i], words: [...doc[i].words, ...doc[i + 1].words] }
  return [...doc.slice(0, i), merged, ...doc.slice(i + 2)]
}

// ------------------------------------------------------------- persistence
/** Shape expected by the `save_lyrics` database function. */
export function toSavePayload(doc: LyricsDoc) {
  return doc.map((l) => ({
    id: l.id,
    words: l.words.map((w) => ({ id: w.id, text: w.text, start_ms: w.start_ms, end_ms: w.end_ms, confidence: w.confidence })),
  }))
}

/** Same checks as the database, so problems surface before saving. */
export function isValidDoc(doc: LyricsDoc): boolean {
  let prevStart = 0
  for (const line of doc) {
    if (line.words.length === 0) return false
    for (const w of line.words) {
      const len = w.text.trim().length
      if (len === 0 || len > MAX_WORD_LENGTH) return false
      if (w.start_ms < 0 || w.end_ms < w.start_ms || w.start_ms < prevStart) return false
      prevStart = w.start_ms
    }
  }
  return true
}

// ----------------------------------------------------------------- history
export interface History {
  past: LyricsDoc[]
  present: LyricsDoc
  future: LyricsDoc[]
}

const HISTORY_LIMIT = 200

export type HistoryAction =
  | { type: 'reset'; doc: LyricsDoc }
  | { type: 'apply'; doc: LyricsDoc }
  | { type: 'undo' }
  | { type: 'redo' }

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'reset':
      return { past: [], present: action.doc, future: [] }
    case 'apply':
      if (action.doc === state.present) return state
      return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.doc, future: [] }
    case 'undo':
      if (state.past.length === 0) return state
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] }
    case 'redo':
      if (state.future.length === 0) return state
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
  }
}
