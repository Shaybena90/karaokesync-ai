/**
 * Tiny synthesised sound effects (Web Audio) — no audio files, no licences.
 * The AudioContext is created on the first sound, which is always triggered by
 * a user action, so browsers' autoplay rules are respected.
 */
type Sfx = 'tap' | 'correct' | 'wrong' | 'clue' | 'unlock' | 'rank' | 'coin'

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(v: boolean) {
  enabled = v
}

export function isSoundEnabled(): boolean {
  return enabled
}

/** The one shared AudioContext (sound effects, voices, radio static, music). */
export function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

let noise: AudioBuffer | null = null
/** Two seconds of white noise, reused for static, crackle and percussion. */
export function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(ac.destination)
  o.start(start)
  o.stop(start + dur + 0.02)
}

const SEQ: Record<Sfx, [number, number, number, OscillatorType?][]> = {
  tap: [[660, 0, 0.06, 'triangle']],
  correct: [[660, 0, 0.12], [990, 0.1, 0.22]],
  wrong: [[220, 0, 0.18, 'square'], [180, 0.12, 0.25, 'square']],
  clue: [[523, 0, 0.12, 'triangle'], [659, 0.1, 0.12, 'triangle'], [784, 0.2, 0.25, 'triangle']],
  unlock: [[392, 0, 0.12], [523, 0.12, 0.12], [659, 0.24, 0.12], [784, 0.36, 0.4], [1046, 0.5, 0.5]],
  rank: [[587, 0, 0.14, 'triangle'], [880, 0.12, 0.14, 'triangle'], [1175, 0.24, 0.4, 'triangle']],
  coin: [[988, 0, 0.08, 'square'], [1319, 0.07, 0.2, 'square']],
}

export function play(s: Sfx) {
  if (!enabled || typeof window === 'undefined') return
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    for (const [f, at, d, type] of SEQ[s]) tone(ctx, f, t + at, d, type ?? 'sine', s === 'wrong' ? 0.06 : 0.12)
  } catch {
    /* sound is optional */
  }
}
