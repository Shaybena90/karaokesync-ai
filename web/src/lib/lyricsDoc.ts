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
 *
 * `keepDuration` is for moving a word (dragging it on the waveform): when the
 * new position has to be clamped, the word keeps its length instead of being
 * squeezed or stretched.
 */
export function setWordTiming(
  doc: LyricsDoc,
  id: string,
  startMs: number,
  endMs: number,
  durationMs?: number,
  keepDuration = false,
): LyricsDoc {
  const { prev, next } = neighbours(doc, id)
  const max = durationMs && durationMs > 0 ? Math.round(durationMs) : Number.POSITIVE_INFINITY
  const length = Math.max(0, Math.round(endMs - startMs))
  let start = Math.round(Math.max(0, startMs, prev?.start_ms ?? 0))
  if (next) start = Math.min(start, next.start_ms)
  start = Math.min(start, max)
  let end: number
  if (keepDuration) {
    end = Math.min(start + length, max)
    start = Math.max(start, Math.min(end - length, start)) // never before the clamped start
  } else {
    end = Math.round(Math.min(Math.max(endMs, start), max))
  }
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

/**
 * Stretch or squeeze a whole line to new start / end times (the timeline's
 * edge handles): every word keeps its place within the line, in proportion.
 * The line stays between its neighbours and inside the song.
 */
export function scaleLine(doc: LyricsDoc, lineId: string, startMs: number, endMs: number, durationMs?: number): LyricsDoc {
  const idx = doc.findIndex((l) => l.id === lineId)
  if (idx < 0) return doc
  const line = doc[idx]
  const all = flatWords(doc)
  const first = all.indexOf(line.words[0])
  const last = all.indexOf(line.words[line.words.length - 1])
  const lower = first > 0 ? all[first - 1].start_ms : 0
  const upper = last < all.length - 1 ? all[last + 1].start_ms : Number.POSITIVE_INFINITY
  const max = durationMs && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  const oldStart = lineStart(line)
  const oldEnd = Math.max(lineEnd(line), oldStart + 1)
  const minLength = 80 * line.words.length
  let start = Math.max(Math.round(startMs), lower, 0)
  let end = Math.min(Math.round(endMs), max)
  if (end - start < minLength) end = Math.min(start + minLength, max)
  if (end - start < minLength) start = Math.max(lower, end - minLength)
  const map = (ms: number, s0: number, e0: number) => Math.round(s0 + ((ms - oldStart) / (oldEnd - oldStart)) * (e0 - s0))
  // The last word must still start before the next line's first word.
  const lastWordStart = line.words[line.words.length - 1].start_ms
  if (map(lastWordStart, start, end) > upper) {
    const f = (lastWordStart - oldStart) / (oldEnd - oldStart)
    if (f > 0) end = Math.floor(start + (upper - start) / f)
  }
  if (start === oldStart && end === lineEnd(line)) return doc
  const words = line.words.map((w) => {
    const s0 = map(w.start_ms, start, end)
    return { ...w, start_ms: s0, end_ms: Math.max(s0, map(w.end_ms, start, end)), confidence: 1 }
  })
  return doc.map((l, i) => (i === idx ? { ...l, words } : l))
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

// ------------------------------------------------------------ automatic sync
export const MAX_SYNC_WINDOW_MS = 60_000

/**
 * The stretch of the song where a line can be sung: from the end of the
 * previous line to the start of the next one. Longer than a minute (a long
 * instrumental gap) → a minute around where the line is now.
 */
export function syncWindow(doc: LyricsDoc, lineId: string, durationMs?: number): { start: number; end: number } | null {
  const i = doc.findIndex((l) => l.id === lineId)
  if (i < 0) return null
  const songEnd = durationMs && durationMs > 0 ? Math.round(durationMs) : lineEnd(doc[i]) + 30_000
  let start = i > 0 ? lineEnd(doc[i - 1]) : 0
  let end = i < doc.length - 1 ? lineStart(doc[i + 1]) : songEnd
  if (end - start > MAX_SYNC_WINDOW_MS) {
    const middle = (lineStart(doc[i]) + lineEnd(doc[i])) / 2
    start = Math.max(start, Math.round(middle - MAX_SYNC_WINDOW_MS / 2))
    end = Math.min(end, start + MAX_SYNC_WINDOW_MS)
  }
  return end - start >= 200 ? { start, end } : null
}

export interface WordTime {
  start_ms: number
  end_ms: number
  confidence: number | null
}

/** Keep every start between the previous and the next word's start (the save rule). */
function settleLine(doc: LyricsDoc, lineIndex: number, words: DocWord[]): LyricsDoc {
  const before = flatWords(doc.slice(0, lineIndex))
  const after = flatWords(doc.slice(lineIndex + 1))
  let floor = before.length ? before[before.length - 1].start_ms : 0
  const ceiling = after.length ? after[0].start_ms : Number.POSITIVE_INFINITY
  const settled = words.map((w) => {
    const start = Math.min(Math.max(w.start_ms, floor), ceiling)
    floor = start
    return { ...w, start_ms: start, end_ms: Math.max(w.end_ms, start) }
  })
  return doc.map((l, i) => (i === lineIndex ? { ...l, words: settled } : l))
}

/**
 * Apply the worker's timings to a line. Returns null if the line was edited
 * meanwhile (other words now), so a stale result is never applied.
 */
export function applyLineTimes(doc: LyricsDoc, lineId: string, texts: string[], times: WordTime[]): LyricsDoc | null {
  const i = doc.findIndex((l) => l.id === lineId)
  if (i < 0 || times.length !== texts.length) return null
  const line = doc[i]
  if (line.words.length !== texts.length || line.words.some((w, k) => w.text !== texts[k])) return null
  const words = line.words.map((w, k) => ({
    ...w,
    start_ms: Math.max(0, Math.round(times[k].start_ms)),
    end_ms: Math.max(0, Math.round(times[k].end_ms)),
    confidence: times[k].confidence,
  }))
  return settleLine(doc, i, words)
}

/**
 * Tap-to-sync: taps[k] is when word k starts. Each word lasts until the next
 * tap; the last one until `lastEndMs` (or a short default). Words that were
 * not tapped keep their timing, moved later if they would now come too early.
 */
export function applyTapTimes(doc: LyricsDoc, lineId: string, taps: number[], lastEndMs?: number): LyricsDoc {
  const i = doc.findIndex((l) => l.id === lineId)
  if (i < 0 || taps.length === 0) return doc
  const line = doc[i]
  const n = Math.min(taps.length, line.words.length)
  const words = line.words.map((w, k) => {
    if (k >= n) return w
    const start = Math.max(0, Math.round(taps[k]))
    const next = k + 1 < n ? taps[k + 1] : k + 1 === line.words.length && lastEndMs !== undefined ? lastEndMs : start + 600
    return { ...w, start_ms: start, end_ms: Math.max(start, Math.round(next)), confidence: 1 }
  })
  return settleLine(doc, i, words)
}

// --------------------------------------------------------- whole sentences
const ESTIMATE_WORD_MS = 450

function splitSentence(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.slice(0, MAX_WORD_LENGTH))
}

/** Words spread over [start, end) by length — a first guess until the line is synced. */
function spreadWords(parts: string[], start: number, end: number): DocWord[] {
  const total = parts.reduce((n, p) => n + p.length, 0) || 1
  let cursor = start
  return parts.map((text, i) => {
    const wordStart = cursor
    const wordEnd = i === parts.length - 1 ? end : Math.round(wordStart + ((end - start) * text.length) / total)
    cursor = wordEnd
    // Confidence 0: shown as "unsure" until the automatic sync times it.
    return { id: newId(), text, start_ms: wordStart, end_ms: Math.max(wordStart, wordEnd), confidence: 0 }
  })
}

/** Replace a whole line with a typed sentence (its words take the line's time span). */
export function setLineText(doc: LyricsDoc, lineId: string, text: string): LyricsDoc {
  const i = doc.findIndex((l) => l.id === lineId)
  const parts = splitSentence(text)
  if (i < 0 || parts.length === 0) return doc
  const line = doc[i]
  if (line.words.map((w) => w.text).join(' ') === parts.join(' ')) return doc
  const start = lineStart(line)
  const end = Math.max(lineEnd(line), start + parts.length * 200)
  return settleLine(doc, i, spreadWords(parts, start, end))
}

/**
 * Add a typed sentence as a new line where the song is now (`atMs`): it goes
 * between the lines around that moment, starting there.
 */
export function insertLineAt(doc: LyricsDoc, atMs: number, text: string, durationMs?: number): { doc: LyricsDoc; lineId: string } | null {
  const parts = splitSentence(text)
  if (parts.length === 0) return null
  let index = doc.findIndex((l) => lineStart(l) > atMs)
  if (index < 0) index = doc.length
  const before = flatWords(doc.slice(0, index))
  const floor = before.length ? before[before.length - 1].start_ms : 0
  const start = Math.max(0, Math.round(atMs), floor)
  const nextStart = index < doc.length ? lineStart(doc[index]) : Number.POSITIVE_INFINITY
  const songEnd = durationMs && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  let end = Math.min(start + parts.length * ESTIMATE_WORD_MS, nextStart, songEnd)
  if (end <= start) end = start + parts.length * 100
  const line: DocLine = { id: newId(), words: spreadWords(parts, start, end) }
  const next = [...doc.slice(0, index), line, ...doc.slice(index)]
  return { doc: settleLine(next, index, line.words), lineId: line.id }
}

/**
 * A copy of a line right after it (for a repeated line, e.g. a chorus): the
 * same words with new ids and the same rhythm, starting where the original
 * ends and squeezed to fit before the next line. Its times are a guess, so its
 * words show as unsure until the line is synced (✨ or 👆).
 */
export function duplicateLine(doc: LyricsDoc, lineId: string, durationMs?: number): { doc: LyricsDoc; lineId: string } | null {
  const i = doc.findIndex((l) => l.id === lineId)
  if (i < 0) return null
  const line = doc[i]
  const s = lineStart(line)
  const e = lineEnd(line)
  const length = Math.max(e - s, line.words.length * 100)
  const nextStart = i + 1 < doc.length ? lineStart(doc[i + 1]) : Number.POSITIVE_INFINITY
  const songEnd = durationMs && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  const start = Math.min(e, songEnd)
  const room = Math.min(nextStart, songEnd) - start
  const span = Math.max(Math.min(length, room), line.words.length * 50)
  const scale = span / length
  const words = line.words.map((w) => ({
    id: newId(),
    text: w.text,
    start_ms: Math.round(start + (w.start_ms - s) * scale),
    end_ms: Math.round(start + (w.end_ms - s) * scale),
    confidence: 0,
  }))
  const copy: DocLine = { id: newId(), words }
  const next = [...doc.slice(0, i + 1), copy, ...doc.slice(i + 1)]
  return { doc: settleLine(next, i + 1, words), lineId: copy.id }
}

/** The words of a line moved into another time span, keeping their rhythm. */
function retime(words: DocWord[], start: number, end: number): DocWord[] {
  const s = words[0].start_ms
  const e = Math.max(words[words.length - 1].end_ms, s + 1)
  const span = Math.max(end - start, words.length * 50)
  const k = span / (e - s)
  return words.map((w) => ({
    ...w,
    start_ms: Math.round(start + (w.start_ms - s) * k),
    end_ms: Math.round(start + (w.end_ms - s) * k),
    confidence: 0, // a guess in the new place: unsure until synced
  }))
}

/**
 * Move a whole line one place up (-1) or down (+1): it swaps places with its
 * neighbour, and each of the two takes the other's time in the song, so the
 * song's order stays right. Their times are a guess until the lines are synced.
 */
export function moveLine(doc: LyricsDoc, lineId: string, direction: -1 | 1): LyricsDoc | null {
  const i = doc.findIndex((l) => l.id === lineId)
  const j = i + direction
  if (i < 0 || j < 0 || j >= doc.length) return null
  const [first, second] = i < j ? [i, j] : [j, i]
  const a = doc[first]
  const b = doc[second]
  const movedB = { ...b, words: retime(b.words, lineStart(a), lineEnd(a)) }   // b goes up, into a's time
  const movedA = { ...a, words: retime(a.words, lineStart(b), lineEnd(b)) }   // a goes down, into b's time
  let next = doc.map((l, k) => (k === first ? movedB : k === second ? movedA : l))
  next = settleLine(next, first, movedB.words)
  return settleLine(next, second, next[second].words)
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
