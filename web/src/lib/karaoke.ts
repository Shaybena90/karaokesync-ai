import { indexAt, type Timed } from './sync'

/** A gap at least this long between lines is treated as an instrumental break. */
export const INSTRUMENTAL_GAP_MS = 4000
/** Countdown shown during the last N ms before singing resumes after a break. */
export const COUNTDOWN_MS = 3000
/** A finished line stays on screen this long before the next one replaces it. */
export const LINE_HOLD_MS = 500

export interface KaraokeView {
  /** Line shown large (the one being sung, or the next one to sing). -1 if none. */
  main: number
  prev: number
  next: number
  /** 3, 2, 1 before singing resumes after the intro or a break; otherwise null. */
  countdown: number | null
  /** true during an intro / instrumental break longer than the countdown. */
  instrumental: boolean
}

/** What to display at time t. Pure function of time, so seeking is always correct. */
export function computeView(lines: readonly Timed[], tMs: number): KaraokeView {
  if (lines.length === 0) return { main: -1, prev: -1, next: -1, countdown: null, instrumental: false }

  const started = indexAt(lines, tMs)
  let main = Math.max(0, started)
  if (started >= 0 && started < lines.length - 1 && tMs >= lines[started].end_ms + LINE_HOLD_MS) {
    main = started + 1 // finished line → show the upcoming one
  }

  let countdown: number | null = null
  let instrumental = false
  const line = lines[main]
  if (tMs < line.start_ms) {
    const gapStart = main === 0 ? 0 : lines[main - 1].end_ms
    if (line.start_ms - gapStart >= INSTRUMENTAL_GAP_MS) {
      const remaining = line.start_ms - tMs
      if (remaining <= COUNTDOWN_MS) countdown = Math.ceil(remaining / 1000)
      else instrumental = true
    }
  }

  return {
    main,
    prev: main - 1,
    next: main + 1 < lines.length ? main + 1 : -1,
    countdown,
    instrumental,
  }
}

export function sameView(a: KaraokeView, b: KaraokeView): boolean {
  return (
    a.main === b.main && a.prev === b.prev && a.next === b.next && a.countdown === b.countdown && a.instrumental === b.instrumental
  )
}

export type WordState = 'upcoming' | 'active' | 'sung'

export function wordState(word: Timed, tMs: number): WordState {
  if (tMs < word.start_ms) return 'upcoming'
  return tMs < word.end_ms ? 'active' : 'sung'
}
