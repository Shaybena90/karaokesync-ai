import { describe, expect, it } from 'vitest'
import {
  deleteWord,
  flatWords,
  historyReducer,
  insertWord,
  isValidDoc,
  mergeWithNext,
  setWordText,
  setWordTiming,
  shiftTiming,
  splitLineAt,
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
