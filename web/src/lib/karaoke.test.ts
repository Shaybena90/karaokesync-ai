import { describe, expect, it } from 'vitest'
import { AudioClock } from './audioClock'
import { computeView, wordState } from './karaoke'

// intro 0-10s, line0 10-12s, line1 12.2-14s, break, line2 30-32s
const lines = [
  { start_ms: 10_000, end_ms: 12_000 },
  { start_ms: 12_200, end_ms: 14_000 },
  { start_ms: 30_000, end_ms: 32_000 },
]

describe('computeView', () => {
  it('shows the first line during the intro, with an instrumental flag then a countdown', () => {
    expect(computeView(lines, 0)).toMatchObject({ main: 0, prev: -1, next: 1, instrumental: true, countdown: null })
    expect(computeView(lines, 7_000)).toMatchObject({ main: 0, countdown: 3, instrumental: false })
    expect(computeView(lines, 9_500)).toMatchObject({ main: 0, countdown: 1 })
    expect(computeView(lines, 10_000)).toMatchObject({ main: 0, countdown: null, instrumental: false })
  })

  it('moves to the next line on time and without countdown for short gaps', () => {
    expect(computeView(lines, 11_000).main).toBe(0)
    expect(computeView(lines, 12_100)).toMatchObject({ main: 0, countdown: null }) // hold
    expect(computeView(lines, 12_200)).toMatchObject({ main: 1, prev: 0, next: 2 })
  })

  it('handles a long instrumental break', () => {
    expect(computeView(lines, 14_200).main).toBe(1) // hold after the line
    expect(computeView(lines, 20_000)).toMatchObject({ main: 2, prev: 1, next: -1, instrumental: true })
    expect(computeView(lines, 28_500)).toMatchObject({ main: 2, countdown: 2 })
    expect(computeView(lines, 40_000)).toMatchObject({ main: 2, countdown: null, instrumental: false })
  })

  it('is a pure function of time (seeking in any order gives the same answers)', () => {
    const times = [31_000, 0, 12_500, 9_000, 31_000]
    expect(times.map((t) => computeView(lines, t).main)).toEqual([2, 0, 1, 0, 2])
  })

  it('handles empty lyrics', () => {
    expect(computeView([], 5)).toEqual({ main: -1, prev: -1, next: -1, countdown: null, instrumental: false })
  })

  it('classifies words', () => {
    const w = { start_ms: 100, end_ms: 200 }
    expect([50, 100, 199, 200].map((t) => wordState(w, t))).toEqual(['upcoming', 'active', 'active', 'sung'])
  })
})

describe('AudioClock', () => {
  const setup = () => {
    const media = { currentTime: 0, paused: true, playbackRate: 1, seeking: false, readyState: 4 }
    let perf = 0
    const clock = new AudioClock(media, () => perf)
    return { media, clock, tick: (ms: number) => (perf += ms) }
  }

  it('returns the exact media time when paused', () => {
    const { media, clock, tick } = setup()
    media.currentTime = 5
    tick(1000)
    expect(clock.nowMs()).toBe(5000)
  })

  it('smooths coarse updates while playing, anchored to the media clock and capped', () => {
    const { media, clock, tick } = setup()
    media.paused = false
    media.currentTime = 1
    expect(clock.nowMs()).toBe(1000)
    tick(100)
    expect(clock.nowMs()).toBe(1100) // media did not update yet → extrapolate
    tick(1000)
    expect(clock.nowMs()).toBe(1250) // capped: never runs away from the audio
    media.currentTime = 1.3
    expect(clock.nowMs()).toBe(1300) // re-anchored to the real value
  })

  it('follows seeks immediately, in both directions', () => {
    const { media, clock, tick } = setup()
    media.paused = false
    media.currentTime = 10
    clock.nowMs()
    tick(100)
    media.currentTime = 2
    expect(clock.nowMs()).toBe(2000)
    media.currentTime = 50
    expect(clock.nowMs()).toBe(50_000)
  })

  it('does not extrapolate while buffering or seeking', () => {
    const { media, clock, tick } = setup()
    media.paused = false
    media.currentTime = 3
    clock.nowMs()
    media.readyState = 2
    tick(200)
    expect(clock.nowMs()).toBe(3000)
    media.readyState = 4
    media.seeking = true
    tick(200)
    expect(clock.nowMs()).toBe(3000)
  })

  it('respects playback rate', () => {
    const { media, clock, tick } = setup()
    media.paused = false
    media.playbackRate = 0.5
    media.currentTime = 1
    clock.nowMs()
    tick(100)
    expect(clock.nowMs()).toBe(1050)
  })
})
