import type { Voice } from '../escape/types'
import { getAudioCtx, noiseBuffer } from './audio'

/**
 * Spoken messages: the device's own Hebrew speech voice (Web Speech API),
 * dressed up with a synthesised radio / phone / computer effect underneath.
 * No audio files. If the device has no Hebrew voice, the effect still plays
 * and the caller shows the transcript.
 */
export interface Playback {
  /** Resolves when the message ends (or is stopped). */
  done: Promise<void>
  stop(): void
  /** Whether a Hebrew voice actually speaks (false → show the transcript). */
  spoken: boolean
}

function hebrewVoice(): SpeechSynthesisVoice | undefined {
  try {
    const all = window.speechSynthesis?.getVoices() ?? []
    return all.find((v) => /^he|^iw/i.test(v.lang)) ?? undefined
  } catch {
    return undefined
  }
}

/** Voices load asynchronously on some browsers; wait briefly for them. */
export function voicesReady(): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || window.speechSynthesis.getVoices().length) return resolve()
    const t = window.setTimeout(resolve, 800)
    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(t)
      resolve()
    }
  })
}

export function hasHebrewVoice(): boolean {
  return !!hebrewVoice()
}

function effectBed(effect: Voice['effect']) {
  const ac = getAudioCtx()
  if (!ac) return { stop() {} }
  const t = ac.currentTime
  const out = ac.createGain()
  out.gain.value = 0
  out.connect(ac.destination)
  const nodes: AudioScheduledSourceNode[] = []

  if (effect === 'computer') {
    // soft data chirps
    for (let i = 0; i < 6; i++) {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = 'square'
      o.frequency.value = 1200 + ((i * 337) % 900)
      g.gain.setValueAtTime(0.0001, t + i * 0.07)
      g.gain.exponentialRampToValueAtTime(0.03, t + i * 0.07 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.05)
      o.connect(g).connect(ac.destination)
      o.start(t + i * 0.07)
      o.stop(t + i * 0.07 + 0.06)
    }
    return { stop() {} }
  }

  // radio / phone: band-passed static with crackle
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  src.loop = true
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = effect === 'phone' ? 1400 : 2200
  band.Q.value = effect === 'phone' ? 1.2 : 0.7
  src.connect(band).connect(out)
  src.start()
  nodes.push(src)
  // squelch click in, steady hiss
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(effect === 'phone' ? 0.03 : 0.09, t + 0.05)
  out.gain.linearRampToValueAtTime(effect === 'phone' ? 0.012 : 0.03, t + 0.5)
  // crackle: random short bursts
  const crackle = window.setInterval(() => {
    const n = ac.currentTime
    out.gain.setValueAtTime(effect === 'phone' ? 0.03 : 0.08, n)
    out.gain.linearRampToValueAtTime(effect === 'phone' ? 0.012 : 0.03, n + 0.08)
  }, 900 + Math.random() * 700)
  return {
    stop() {
      window.clearInterval(crackle)
      const n = ac.currentTime
      out.gain.cancelScheduledValues(n)
      out.gain.setValueAtTime(out.gain.value, n)
      out.gain.linearRampToValueAtTime(effect === 'phone' ? 0.0001 : 0.1, n + 0.04)
      out.gain.linearRampToValueAtTime(0.0001, n + 0.18)
      for (const x of nodes) x.stop(n + 0.2)
    },
  }
}

export function playVoice(v: Voice, onLine?: (i: number) => void): Playback {
  const voice = hebrewVoice()
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null
  const bed = effectBed(v.effect)
  let stopped = false
  let resolveDone = () => {}
  const done = new Promise<void>((r) => (resolveDone = r))
  const finish = () => {
    bed.stop()
    resolveDone()
  }

  if (!synth || !voice) {
    // no Hebrew voice: a short burst of the effect, then the transcript does the talking
    window.setTimeout(finish, 1400)
    return { done, spoken: false, stop: () => finish() }
  }

  synth.cancel()
  let i = 0
  const next = () => {
    if (stopped || i >= v.lines.length) return finish()
    onLine?.(i)
    const u = new SpeechSynthesisUtterance(v.lines[i])
    u.voice = voice
    u.lang = voice.lang
    u.rate = v.effect === 'computer' ? 0.9 : 0.95
    u.pitch = v.pitch ?? 1
    u.onend = () => {
      i++
      window.setTimeout(next, 250)
    }
    u.onerror = () => finish()
    synth.speak(u)
  }
  window.setTimeout(next, v.effect === 'computer' ? 450 : 350)
  return {
    done,
    spoken: true,
    stop() {
      stopped = true
      synth.cancel()
      finish()
    },
  }
}
