import { describe, expect, it } from 'vitest'
import {
  applyLineTimes,
  applyTapTimes,
  deleteWord,
  flatWords,
  historyReducer,
  insertLineAt,
  insertWord,
  isValidDoc,
  mergeWithNext,
  setLineText,
  setWordText,
  setWordTiming,
  shiftTiming,
  splitLineAt,
  syncWindow,
  toSavePayload,
  type LyricsDoc,
} from './lyricsDoc'

const doc: LyricsDoc = [
  {
    id: 'L1',
    words: [
      { id: 'a', text: 'שלום', start_ms: 1000, end_ms: 1400, confidence: 0.9 },
      { id: 'b', text: 'עולם', start_ms: 1500, end_ms: 2000, confidence: 0.3 },
    ],
  },
  {
    id: 'L2',
    words: [
      { id: 'c', text: 'זה', start_ms: 3000, end_ms: 3200, confidence: 0.8 },
      { id: 'd', text: 'שיר', start_ms: 3200, end_ms: 3800, confidence: 0.8 },
    ],
  },
]
const texts = (d: LyricsDoc) => d.map((l) => l.words.map((w) => w.text).join(' '))
const times = (d: LyricsDoc) => flatWords(d).map((w) => `${w.start_ms}-${w.end_ms}`)

describe('editing words', () => {
  it('changes text and marks the word as confirmed', () => {
    const out = setWordText(doc, 'b', '  עולם!  ')
    expect(texts(out)).toEqual(['שלום עולם!', 'זה שיר'])
    expect(out[0].words[1].confidence).toBe(1)
    expect(doc[0].words[1].text).toBe('עולם') // original untouched (immutable)
  })

  it('splits typed text into several words sharing the time span', () => {
    const out = setWordText(doc, 'b', 'עולם ומלואו')
    expect(texts(out)[0]).toBe('שלום עולם ומלואו')
    const [w1, w2] = out[0].words.slice(1)
    expect(w1.id).toBe('b')
    expect(w1.start_ms).toBe(1500)
    expect(w2.end_ms).toBe(2000)
    expect(w1.end_ms).toBe(w2.start_ms)
    expect(isValidDoc(out)).toBe(true)
  })

  it('ignores empty text', () => {
    expect(setWordText(doc, 'a', '   ')).toBe(doc)
  })

  it('deletes words and drops empty lines', () => {
    const out = deleteWord(deleteWord(doc, 'a'), 'b')
    expect(out.map((l) => l.id)).toEqual(['L2'])
  })
})

describe('timing', () => {
  it('sets timing within the neighbours', () => {
    expect(times(setWordTiming(doc, 'b', 1450, 2100))).toEqual(['1000-1400', '1450-2100', '3000-3200', '3200-3800'])
    // cannot move before the previous word nor after the next word's start
    expect(times(setWordTiming(doc, 'b', 500, 600))[1]).toBe('1000-1000')
    expect(times(setWordTiming(doc, 'b', 5000, 6000))[1]).toBe('3000-6000')
    expect(times(setWordTiming(doc, 'a', -100, 50))[0]).toBe('0-50')
  })

  it('keeps end >= start and respects the audio duration', () => {
    expect(times(setWordTiming(doc, 'd', 3300, 3100))[3]).toBe('3300-3300')
    expect(times(setWordTiming(doc, 'd', 3300, 9999, 3500))[3]).toBe('3300-3500')
  })

  it('moving a word keeps its length when it has to be clamped', () => {
    // dragged far to the right, past the next word: stops at the next word's start, same 400ms length
    expect(times(setWordTiming(doc, 'a', 2600, 3000, undefined, true))[0]).toBe('1500-1900')
    // dragged before 0
    expect(times(setWordTiming(doc, 'a', -300, 100, undefined, true))[0]).toBe('0-400')
    // a resize (keepDuration = false) may change the length
    expect(times(setWordTiming(doc, 'a', 1000, 1300))[0]).toBe('1000-1300')
  })

  it('shifts a whole line, clamped by its neighbours', () => {
    expect(times(shiftTiming(doc, 'L2', -500))).toEqual(['1000-1400', '1500-2000', '2500-2700', '2700-3300'])
    // cannot move before the previous word's start (1500)
    expect(times(shiftTiming(doc, 'L2', -5000))[2]).toBe('1500-1700')
    // whole song
    expect(times(shiftTiming(doc, null, 250))[0]).toBe('1250-1650')
    expect(times(shiftTiming(doc, null, -5000))[0]).toBe('0-400')
  })
})

describe('adding words', () => {
  it('inserts after a word into free time', () => {
    const { doc: out, id } = insertWord(doc, 'b', 'after', 'חדש')
    const w = out[0].words[2]
    expect(w.id).toBe(id)
    expect(w.text).toBe('חדש')
    expect([w.start_ms, w.end_ms]).toEqual([2000, 2600])
    expect(isValidDoc(out)).toBe(true)
  })

  it('shares the time of the anchor when there is no gap', () => {
    const { doc: out } = insertWord(doc, 'c', 'after', 'x')
    expect(times(out)).toEqual(['1000-1400', '1500-2000', '3000-3100', '3100-3200', '3200-3800'])
    expect(isValidDoc(out)).toBe(true)
  })

  it('inserts before a word', () => {
    const { doc: out } = insertWord(doc, 'c', 'before', 'אז')
    expect(texts(out)[1]).toBe('אז זה שיר')
    expect(times(out)[2]).toBe('2400-3000')
    const { doc: tight } = insertWord(doc, 'd', 'before', 'y')
    expect(isValidDoc(tight)).toBe(true)
  })
})

describe('lines', () => {
  it('splits and merges lines', () => {
    const split = splitLineAt(doc, 'b')
    expect(texts(split)).toEqual(['שלום', 'עולם', 'זה שיר'])
    expect(splitLineAt(doc, 'a')).toBe(doc) // first word: nothing to split
    const merged = mergeWithNext(split, split[1].id)
    expect(texts(merged)).toEqual(['שלום', 'עולם זה שיר'])
    expect(mergeWithNext(doc, 'L2')).toBe(doc) // last line
  })
})

describe('validation, payload and history', () => {
  it('validates like the database', () => {
    expect(isValidDoc(doc)).toBe(true)
    expect(isValidDoc([{ id: 'x', words: [] }])).toBe(false)
    expect(isValidDoc([{ id: 'x', words: [{ id: 'w', text: 'a', start_ms: 5, end_ms: 1, confidence: null }] }])).toBe(false)
    const unordered: LyricsDoc = [
      { id: 'x', words: [{ id: 'w', text: 'a', start_ms: 500, end_ms: 600, confidence: null }, { id: 'v', text: 'b', start_ms: 100, end_ms: 200, confidence: null }] },
    ]
    expect(isValidDoc(unordered)).toBe(false)
  })

  it('builds the save payload', () => {
    expect(toSavePayload(doc)[0]).toEqual({ id: 'L1', words: doc[0].words })
  })

  it('undo / redo', () => {
    let h = historyReducer({ past: [], present: doc, future: [] }, { type: 'apply', doc: deleteWord(doc, 'a') })
    h = historyReducer(h, { type: 'apply', doc: deleteWord(h.present, 'b') })
    expect(texts(h.present)).toEqual(['זה שיר'])
    h = historyReducer(h, { type: 'undo' })
    expect(texts(h.present)).toEqual(['עולם', 'זה שיר'])
    h = historyReducer(h, { type: 'undo' })
    expect(h.present).toBe(doc)
    expect(historyReducer(h, { type: 'undo' })).toBe(h)
    h = historyReducer(h, { type: 'redo' })
    expect(texts(h.present)).toEqual(['עולם', 'זה שיר'])
    // a new edit clears the redo stack
    h = historyReducer(h, { type: 'apply', doc: splitLineAt(h.present, 'd') })
    expect(h.future).toEqual([])
  })
})

describe('automatic sync', () => {
  it('uses the gap between the neighbouring lines as the window', () => {
    expect(syncWindow(doc, 'L2', 10_000)).toEqual({ start: 2000, end: 10_000 })
    expect(syncWindow(doc, 'L1', 10_000)).toEqual({ start: 0, end: 3000 })
    expect(syncWindow(doc, 'nope')).toBeNull()
  })

  it('limits a long gap to a minute around the line', () => {
    const far: LyricsDoc = [doc[0], { id: 'L9', words: [{ id: 'z', text: 'x', start_ms: 100_000, end_ms: 101_000, confidence: 1 }] }]
    const w = syncWindow(far, 'L9', 300_000)!
    expect(w.end - w.start).toBe(60_000)
    expect(w.start).toBeLessThan(100_000)
    expect(w.end).toBeGreaterThan(101_000)
  })

  it('applies the worker timings to an unchanged line', () => {
    const out = applyLineTimes(doc, 'L2', ['זה', 'שיר'], [
      { start_ms: 2500, end_ms: 2900, confidence: 0.4 },
      { start_ms: 2950, end_ms: 3600, confidence: 0.9 },
    ])!
    expect(times(out).slice(2)).toEqual(['2500-2900', '2950-3600'])
    expect(out[1].words[0].confidence).toBe(0.4)
    expect(isValidDoc(out)).toBe(true)
  })

  it('never applies a stale result', () => {
    const edited = setWordText(doc, 'c', 'זהו')
    const t = [{ start_ms: 1, end_ms: 2, confidence: 1 }, { start_ms: 3, end_ms: 4, confidence: 1 }]
    expect(applyLineTimes(edited, 'L2', ['זה', 'שיר'], t)).toBeNull()
    expect(applyLineTimes(doc, 'L2', ['זה'], t.slice(0, 1))).toBeNull()
  })

  it('keeps the song order even if the timings disagree with the neighbours', () => {
    const out = applyLineTimes(doc, 'L2', ['זה', 'שיר'], [
      { start_ms: 900, end_ms: 1000, confidence: 1 },
      { start_ms: 800, end_ms: 1200, confidence: 1 },
    ])!
    expect(isValidDoc(out)).toBe(true)
    expect(out[1].words[0].start_ms).toBe(1500) // not before the previous word
  })
})

describe('tap sync', () => {
  it('turns taps into word timings', () => {
    const out = applyTapTimes(doc, 'L2', [2600, 3100], 3900)
    expect(times(out).slice(2)).toEqual(['2600-3100', '3100-3900'])
    expect(isValidDoc(out)).toBe(true)
  })

  it('keeps untapped words after the tapped ones', () => {
    const out = applyTapTimes(doc, 'L2', [3500])
    expect(times(out).slice(2)).toEqual(['3500-4100', '3500-3800'])
    expect(isValidDoc(out)).toBe(true)
  })

  it('ignores an empty session', () => {
    expect(applyTapTimes(doc, 'L2', [])).toBe(doc)
  })
})

describe('whole sentences', () => {
  it('replaces a line with a typed sentence over the same time', () => {
    const out = setLineText(doc, 'L2', '  זה השיר   הכי יפה ')
    expect(texts(out)).toEqual(['שלום עולם', 'זה השיר הכי יפה'])
    const line = out[1].words
    expect(line[0].start_ms).toBe(3000)
    expect(line[line.length - 1].end_ms).toBe(3800)
    expect(line.every((w) => w.confidence === 0)).toBe(true) // unsure until synced
    expect(isValidDoc(out)).toBe(true)
    expect(setLineText(doc, 'L2', 'זה שיר')).toBe(doc) // unchanged
    expect(setLineText(doc, 'L2', '   ')).toBe(doc)
  })

  it('adds a sentence where the song is now', () => {
    const res = insertLineAt(doc, 2500, 'שורה שחסרה כאן', 10_000)!
    expect(texts(res.doc)).toEqual(['שלום עולם', 'שורה שחסרה כאן', 'זה שיר'])
    expect(res.doc[1].id).toBe(res.lineId)
    expect(res.doc[1].words[0].start_ms).toBe(2500)
    expect(lineEndOf(res.doc[1])).toBeLessThanOrEqual(3000) // not past the next line
    expect(isValidDoc(res.doc)).toBe(true)
  })

  it('adds at the start and at the end of the song', () => {
    expect(texts(insertLineAt(doc, 0, 'פתיחה')!.doc)[0]).toBe('פתיחה')
    const end = insertLineAt(doc, 9000, 'סוף', 12_000)!
    expect(texts(end.doc).at(-1)).toBe('סוף')
    expect(insertLineAt(doc, 1000, '  ')).toBeNull()
  })
})

function lineEndOf(line: { words: { end_ms: number }[] }) {
  return Math.max(...line.words.map((w) => w.end_ms))
}
