/**
 * Karaoke sync helpers.
 *
 * The playback position of the real audio element is ALWAYS the source of
 * truth: callers pass `audio.currentTime * 1000`, never a separate timer, so
 * seeking, buffering and pauses are reflected immediately.
 */

export interface Timed {
  start_ms: number
  end_ms: number
}

/** Index of the last item whose start is <= t (items sorted by start). -1 if none. */
export function indexAt<T extends Timed>(items: readonly T[], tMs: number): number {
  let lo = 0
  let hi = items.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].start_ms <= tMs) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** The word being sung at t, or -1 when between words / before the first one. */
export function activeWordIndex<T extends Timed>(words: readonly T[], tMs: number): number {
  const i = indexAt(words, tMs)
  return i >= 0 && tMs < words[i].end_ms ? i : -1
}

/** Fill amount 0..1 of a word at time t (for the gradual highlight). */
export function wordFill(word: Timed, tMs: number): number {
  if (tMs <= word.start_ms) return 0
  if (tMs >= word.end_ms) return 1
  const len = word.end_ms - word.start_ms
  return len <= 0 ? 1 : (tMs - word.start_ms) / len
}

/**
 * Line to display at t. Before the first line starts we show the first line
 * (so the singer can read ahead); after a line ends it stays visible until the
 * next one begins.
 */
export function displayLineIndex<T extends Timed>(lines: readonly T[], tMs: number): number {
  if (lines.length === 0) return -1
  return Math.max(0, indexAt(lines, tMs))
}
