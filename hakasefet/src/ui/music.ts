import type { Theme } from '../escape/types'
import { getAudioCtx, noiseBuffer } from './audio'

/**
 * Generative background music, synthesised live (Web Audio) — no files and no
 * licences. Each room theme has its own mood: a drone, a slowly changing pad,
 * a sparse melody and its own percussion. `setTension(1)` in the last minutes
 * speeds things up and adds a heartbeat.
 */
interface Mood {
  root: number // Hz
  scale: number[] // semitones
  chords: number[][] // degrees of the scale
  bpm: number
  pad: OscillatorType
  lead: OscillatorType
  perc: 'tick' | 'march' | 'morse' | 'pulse' | 'none'
  cutoff: number
}

const MOODS: Record<Theme, Mood> = {
  // underground factory: tense, low, clock ticking
  bunker: { root: 98, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], bpm: 72, pad: 'sawtooth', lead: 'triangle', perc: 'tick', cutoff: 700 },
  // 1948 HQ: deep, determined, distant march
  hq: { root: 110, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]], bpm: 84, pad: 'sawtooth', lead: 'sine', perc: 'march', cutoff: 900 },
  // Bletchley: mysterious, music-box melody and morse
  hut: { root: 130.8, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [6, 1, 3]], bpm: 90, pad: 'triangle', lead: 'sine', perc: 'morse', cutoff: 1100 },
  lab: { root: 116.5, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 0, 2], [6, 1, 3], [4, 6, 1]], bpm: 100, pad: 'sawtooth', lead: 'square', perc: 'pulse', cutoff: 1200 },
  station: { root: 87.3, scale: [0, 2, 4, 7, 9], chords: [[0, 2, 4], [1, 3, 0], [2, 4, 1], [3, 0, 2]], bpm: 66, pad: 'sine', lead: 'sine', perc: 'none', cutoff: 1500 },
  museum: { root: 103.8, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [4, 6, 1]], bpm: 76, pad: 'triangle', lead: 'triangle', perc: 'tick', cutoff: 900 },
}

const freq = (m: Mood, degree: number, octave = 0) => {
  const n = m.scale.length
  const d = ((degree % n) + n) % n
  const o = Math.floor(degree / n) + octave
  return m.root * Math.pow(2, (m.scale[d] + 12 * o) / 12)
}

export class Music {
  private ac: AudioContext | null = null
  private master?: GainNode
  private padBus?: BiquadFilterNode
  private delay?: DelayNode
  private timer = 0
  private step = 0
  private tension = 0
  private mood: Mood
  private playing = false
  private volume: number

  constructor(theme: Theme, volume = 0.5) {
    this.mood = MOODS[theme] ?? MOODS.lab
    this.volume = volume
  }

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  start(): boolean {
    if (this.playing) return true
    const ac = getAudioCtx()
    if (!ac) return false
    this.ac = ac
    if (ac.state !== 'running') void ac.resume()
    const master = ac.createGain()
    master.gain.value = 0
    master.gain.linearRampToValueAtTime(0.22 * this.volume, ac.currentTime + 3)
    master.connect(ac.destination)
    this.master = master
    // a soft echo for the melody
    const delay = ac.createDelay(1)
    delay.delayTime.value = 60 / this.mood.bpm / 2
    const fb = ac.createGain()
    fb.gain.value = 0.35
    delay.connect(fb).connect(delay)
    delay.connect(master)
    this.delay = delay
    // pad bus with a slowly moving filter
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = this.mood.cutoff
    lp.Q.value = 0.8
    lp.connect(master)
    const lfo = ac.createOscillator()
    const lfoGain = ac.createGain()
    lfo.frequency.value = 0.05
    lfoGain.gain.value = this.mood.cutoff * 0.4
    lfo.connect(lfoGain).connect(lp.frequency)
    lfo.start()
    this.padBus = lp
    // drone
    for (const det of [-4, 4]) {
      const o = ac.createOscillator()
      o.type = 'sine'
      o.frequency.value = this.mood.root / 2
      o.detune.value = det
      const g = ac.createGain()
      g.gain.value = 0.18
      o.connect(g).connect(master)
      o.start()
    }
    this.playing = true
    this.schedule()
    return ac.state === 'running'
  }

  isRunning(): boolean {
    return !!this.ac && this.ac.state === 'running' && this.playing
  }

  setTension(t: number) {
    this.tension = Math.max(0, Math.min(1, t))
  }

  setVolume(v: number) {
    this.volume = v
    if (this.ac && this.master) this.master.gain.setTargetAtTime(0.22 * v, this.ac.currentTime, 0.5)
  }

  stop(fade = 1.5) {
    if (!this.ac || !this.master || !this.playing) return
    this.playing = false
    window.clearTimeout(this.timer)
    const n = this.ac.currentTime
    this.master.gain.cancelScheduledValues(n)
    this.master.gain.setValueAtTime(this.master.gain.value, n)
    this.master.gain.linearRampToValueAtTime(0.0001, n + fade)
    const m = this.master
    window.setTimeout(() => m.disconnect(), fade * 1000 + 200)
  }

  private schedule() {
    if (!this.playing || !this.ac) return
    const beat = 60 / (this.mood.bpm * (1 + 0.35 * this.tension))
    this.tick(this.ac.currentTime + 0.05, beat)
    this.step++
    this.timer = window.setTimeout(() => this.schedule(), beat * 1000)
  }

  private note(type: OscillatorType, f: number, at: number, dur: number, gain: number, dest: AudioNode) {
    const ac = this.ac!
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.4, dur * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g).connect(dest)
    o.start(at)
    o.stop(at + dur + 0.05)
  }

  private hit(at: number, f: number, dur: number, gain: number, bandFreq?: number) {
    const ac = this.ac!
    const src = ac.createBufferSource()
    src.buffer = noiseBuffer(ac)
    const filt = ac.createBiquadFilter()
    filt.type = bandFreq ? 'bandpass' : 'lowpass'
    filt.frequency.value = bandFreq ?? f
    const g = ac.createGain()
    g.gain.setValueAtTime(gain, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    src.connect(filt).connect(g).connect(this.master!)
    src.start(at, Math.random())
    src.stop(at + dur + 0.02)
  }

  private tick(at: number, beat: number) {
    const m = this.mood
    const s = this.step
    // pad: a new chord every 8 beats
    if (s % 8 === 0) {
      const chord = m.chords[(s / 8) % m.chords.length]
      for (const d of chord) {
        this.note(m.pad, freq(m, d), at, beat * 8.5, 0.045, this.padBus!)
        this.note(m.pad, freq(m, d) * 1.003, at, beat * 8.5, 0.03, this.padBus!)
      }
    }
    // sparse melody (denser when tense)
    const chord = m.chords[Math.floor(s / 8) % m.chords.length]
    const density = 0.28 + 0.35 * this.tension
    if (((s * 7919) % 100) / 100 < density) {
      const deg = chord[(s * 31) % chord.length] + (s % 3 === 0 ? 2 : 0)
      this.note(m.lead, freq(m, deg, 1), at, beat * 1.6, 0.05, this.delay!)
    }
    // percussion
    if (m.perc === 'tick') this.hit(at, 4000, 0.03, s % 2 ? 0.05 : 0.09, 3500)
    if (m.perc === 'march' && s % 4 !== 3) this.hit(at, 300, s % 4 === 0 ? 0.25 : 0.1, s % 4 === 0 ? 0.25 : 0.08)
    if (m.perc === 'morse' && s % 16 < 6) this.note('sine', 880, at, beat * (s % 3 === 0 ? 0.6 : 0.2), 0.025, this.master!)
    if (m.perc === 'pulse') this.note('square', m.root, at, beat * 0.3, 0.03, this.padBus!)
    // heartbeat when time is running out
    if (this.tension > 0.5 && s % 2 === 0) {
      this.note('sine', 55, at, 0.18, 0.35 * this.tension, this.master!)
      this.note('sine', 50, at + 0.22, 0.2, 0.25 * this.tension, this.master!)
    }
  }
}
