import { describe, expect, it } from 'vitest'
import { activeWordIndex, displayLineIndex, indexAt, wordFill } from './sync'

const words = [
  { start_ms: 1000, end_ms: 1400 },
  { start_ms: 1500, end_ms: 2000 },
  { start_ms: 2000, end_ms: 2600 },
  { start_ms: 4000, end_ms: 4500 },
]

describe('karaoke sync', () => {
  it('finds the word being sung', () => {
    expect(activeWordIndex(words, 0)).toBe(-1)
    expect(activeWordIndex(words, 1000)).toBe(0)
    expect(activeWordIndex(words, 1399)).toBe(0)
    expect(activeWordIndex(words, 1450)).toBe(-1) // gap between words
    expect(activeWordIndex(words, 2000)).toBe(2) // boundary belongs to the next word
    expect(activeWordIndex(words, 4499)).toBe(3)
    expect(activeWordIndex(words, 9999)).toBe(-1)
  })

  it('reacts instantly to seeking backwards and forwards (pure function of time)', () => {
    const seq = [4200, 1100, 2100, 1100].map((t) => activeWordIndex(words, t))
    expect(seq).toEqual([3, 0, 2, 0])
  })

  it('computes gradual fill', () => {
    const w = { start_ms: 1000, end_ms: 2000 }
    expect(wordFill(w, 500)).toBe(0)
    expect(wordFill(w, 1250)).toBeCloseTo(0.25)
    expect(wordFill(w, 2000)).toBe(1)
    expect(wordFill({ start_ms: 5, end_ms: 5 }, 5)).toBe(0)
    expect(wordFill({ start_ms: 5, end_ms: 5 }, 6)).toBe(1)
  })

  it('keeps a line on screen until the next one starts', () => {
    const lines = [
      { start_ms: 1000, end_ms: 2600 },
      { start_ms: 4000, end_ms: 4500 },
    ]
    expect(displayLineIndex(lines, 0)).toBe(0)
    expect(displayLineIndex(lines, 3000)).toBe(0)
    expect(displayLineIndex(lines, 4000)).toBe(1)
    expect(displayLineIndex([], 10)).toBe(-1)
  })

  it('binary search matches a linear scan on random data', () => {
    const sorted = Array.from({ length: 500 }, (_, i) => ({ start_ms: i * 37, end_ms: i * 37 + 20 }))
    for (let t = -50; t < 20000; t += 13) {
      let expected = -1
      sorted.forEach((w, i) => {
        if (w.start_ms <= t) expected = i
      })
      expect(indexAt(sorted, t)).toBe(expected)
    }
  })
})
