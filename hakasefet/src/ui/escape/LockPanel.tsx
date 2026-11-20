import { useEffect, useRef, useState } from 'react'
import type { Color, Dir, LockDef } from '../../escape/types'
import type { SessionOutcome } from '../../net/session'
import { getAudioCtx, isSoundEnabled, noiseBuffer, play } from '../audio'

const HEB = 'אבגדהוזחטיכלמנסעפצקרשת'.split('')
const COLOR_STYLE: Record<Color, { label: string; bg: string }> = {
  red: { label: 'אדום', bg: '#e0533f' },
  green: { label: 'ירוק', bg: '#3fb36b' },
  blue: { label: 'כחול', bg: '#3f7be0' },
  yellow: { label: 'צהוב', bg: '#f2c14e' },
  purple: { label: 'סגול', bg: '#9b5de5' },
  white: { label: 'לבן', bg: '#f4f6ff' },
}
const DIRS: { d: Dir; arrow: string; label: string }[] = [
  { d: 'up', arrow: '↑', label: 'למעלה' },
  { d: 'left', arrow: '←', label: 'שמאלה' },
  { d: 'right', arrow: '→', label: 'ימינה' },
  { d: 'down', arrow: '↓', label: 'למטה' },
]
const DIR_LABEL: Record<Dir, string> = { up: 'למעלה', down: 'למטה', left: 'שמאלה', right: 'ימינה' }

/** The input UI for every lock type. Calls onSubmit with the encoded answer. */
export function LockPanel({ lock, onSubmit }: { lock: LockDef; onSubmit: (input: string) => Promise<SessionOutcome> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  async function submit(input: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await onSubmit(input)
    setBusy(false)
    if (r === 'wrong') {
      play('wrong')
      setShake(true)
      setError('לא נכון. נסו שוב.')
      setResetKey((k) => k + 1)
    } else if (r === 'timeout') setError('אין חיבור לשאר השחקנים כרגע. נסו שוב בעוד רגע.')
    else if (r === 'invalid') setError('המנעול כבר לא זמין — אולי מישהו אחר כבר פתח אותו.')
  }

  return (
    <div className={shake ? 'anim-shake' : ''} onAnimationEnd={() => setShake(false)}>
      {lock.kind === 'digits' && <CodeEntry key={resetKey} length={lock.length} alphabet={'0123456789'.split('')} ltr busy={busy} onDone={submit} />}
      {lock.kind === 'letters' && <CodeEntry key={resetKey} length={lock.length} alphabet={HEB} busy={busy} onDone={submit} />}
      {lock.kind === 'colors' && <Sequence key={resetKey} length={lock.answer.length} busy={busy} onDone={(v) => submit(v.join(','))} options={lock.options.map((c) => ({ value: c, node: <span className="h-6 w-6 rounded-full border-2 border-white/60" style={{ background: COLOR_STYLE[c].bg }} />, label: COLOR_STYLE[c].label }))} />}
      {lock.kind === 'arrows' && <Sequence key={resetKey} length={lock.answer.length} busy={busy} onDone={(v) => submit(v.join(','))} options={DIRS.map((d) => ({ value: d.d, node: <span className="text-2xl leading-none">{d.arrow}</span>, label: DIR_LABEL[d.d] }))} />}
      {lock.kind === 'switches' && <Switches key={resetKey} count={lock.count} busy={busy} onDone={(v) => submit(v.map((b) => (b ? '1' : '0')).join(''))} />}
      {lock.kind === 'terminal' && <Terminal key={resetKey} numeric={lock.numeric} busy={busy} onDone={submit} />}
      {lock.kind === 'tuner' && <Tuner key={resetKey} min={lock.min} max={lock.max} answer={lock.answer} busy={busy} onDone={(v) => submit(String(v))} />}
      <p role="alert" aria-live="assertive" className="mt-2 min-h-6 text-center font-bold text-coral">{error ? `✗ ${error}` : busy ? <span className="text-mist">בודק…</span> : ''}</p>
    </div>
  )
}

function Slots({ values, length, ltr }: { values: string[]; length: number; ltr?: boolean }) {
  return (
    <div className="mb-3 flex justify-center gap-2" dir={ltr ? 'ltr' : 'rtl'} aria-live="polite" aria-label={`הוזנו ${values.length} מתוך ${length}`}>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={`grid h-12 w-10 place-items-center rounded-lg border-2 text-2xl font-extrabold sm:h-14 sm:w-12 ${values[i] ? 'border-gold bg-gold/10 text-gold-2' : 'border-white/15 bg-black/30 text-dim'}`}>
          {values[i] ?? '·'}
        </span>
      ))}
    </div>
  )
}

function CodeEntry({ length, alphabet, ltr, busy, onDone }: { length: number; alphabet: string[]; ltr?: boolean; busy: boolean; onDone: (v: string) => void }) {
  const [v, setV] = useState<string[]>([])
  const full = v.length === length
  const add = (c: string) => {
    if (v.length < length) {
      play('tap')
      setV([...v, c])
    }
  }
  const back = () => setV(v.slice(0, -1))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Backspace') back()
      else if (e.key === 'Enter' && full) onDone(v.join(''))
      else if (alphabet.includes(e.key)) add(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const isDigits = alphabet.length === 10
  return (
    <div>
      <Slots values={v} length={length} ltr={ltr} />
      <div className={`mx-auto grid max-w-xs gap-1.5 ${isDigits ? 'grid-cols-3' : 'grid-cols-6 max-w-sm'}`} dir={isDigits ? 'ltr' : 'rtl'}>
        {(isDigits ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : alphabet).map((c) => (
          <button key={c} type="button" className="tile rounded-xl border border-gold/20 py-2.5 text-xl font-extrabold" onClick={() => add(c)} disabled={busy || full} aria-label={c}>
            {c}
          </button>
        ))}
        {isDigits && (
          <>
            <button type="button" className="tile rounded-xl border border-white/10 py-2.5 text-lg" onClick={back} aria-label="מחיקה">⌫</button>
            <button type="button" className="tile rounded-xl border border-gold/20 py-2.5 text-xl font-extrabold" onClick={() => add('0')} disabled={busy || full} aria-label="0">0</button>
            <button type="button" className="tile rounded-xl border border-teal/50 bg-teal/15 py-2.5 text-lg font-extrabold text-teal-2" onClick={() => onDone(v.join(''))} disabled={busy || !full} aria-label="אישור">✓</button>
          </>
        )}
      </div>
      {!isDigits && (
        <div className="mx-auto mt-2 flex max-w-sm gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={back} disabled={busy || !v.length}>⌫ מחיקה</button>
          <button type="button" className="btn btn-gold flex-1" onClick={() => onDone(v.join(''))} disabled={busy || !full}>פתיחה</button>
        </div>
      )}
    </div>
  )
}

function Sequence<T extends string>({ length, options, busy, onDone }: { length: number; options: { value: T; node: React.ReactNode; label: string }[]; busy: boolean; onDone: (v: T[]) => void }) {
  const [v, setV] = useState<T[]>([])
  const full = v.length === length
  const label = (x: T) => options.find((o) => o.value === x)!.label
  return (
    <div>
      <ol className="mb-3 flex flex-wrap justify-center gap-1.5" aria-live="polite" aria-label={`נבחרו ${v.length} מתוך ${length}`}>
        {Array.from({ length }, (_, i) => (
          <li key={i} className={`flex min-w-16 items-center gap-1 rounded-lg border-2 px-2 py-1.5 text-sm font-bold ${v[i] ? 'border-gold bg-gold/10' : 'border-white/15 bg-black/30 text-dim'}`}>
            <span className="text-xs text-dim">{i + 1}.</span>
            {v[i] ? (
              <>
                {options.find((o) => o.value === v[i])!.node}
                <span>{label(v[i])}</span>
              </>
            ) : (
              '—'
            )}
          </li>
        ))}
      </ol>
      <div className="mx-auto grid max-w-sm grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="tile flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gold/20 text-lg font-bold"
            disabled={busy || full}
            onClick={() => {
              play('tap')
              setV([...v, o.value])
            }}
          >
            {o.node}
            {o.label}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-2 flex max-w-sm gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={() => setV([])} disabled={busy || !v.length}>התחלה מחדש</button>
        <button type="button" className="btn btn-gold flex-1" onClick={() => onDone(v)} disabled={busy || !full}>פתיחה</button>
      </div>
    </div>
  )
}

function Switches({ count, busy, onDone }: { count: number; busy: boolean; onDone: (v: boolean[]) => void }) {
  const [v, setV] = useState<boolean[]>(() => Array(count).fill(false))
  return (
    <div>
      <div className="mx-auto mb-3 grid max-w-sm gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} dir="ltr">
        {v.map((on, i) => (
          <button
            key={i}
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={`מתג ${i + 1}`}
            disabled={busy}
            onClick={() => {
              play('tap')
              setV(v.map((x, j) => (j === i ? !x : x)))
            }}
            className="flex flex-col items-center gap-1"
          >
            <span className={`relative h-20 w-10 rounded-xl border-2 ${on ? 'border-teal bg-teal/20' : 'border-white/20 bg-black/40'}`}>
              <span className={`absolute left-1 right-1 h-8 rounded-lg transition-all ${on ? 'top-1 bg-teal shadow-[0_0_14px_#2ec4b6]' : 'bottom-1 bg-dim'}`} />
            </span>
            <span className="text-sm font-bold">{i + 1}</span>
            <span className={`text-xs ${on ? 'text-teal-2' : 'text-dim'}`}>{on ? 'דולק' : 'כבוי'}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-gold mx-auto flex w-full max-w-sm" onClick={() => onDone(v)} disabled={busy}>הפעלה</button>
    </div>
  )
}

function Terminal({ numeric, busy, onDone }: { numeric?: boolean; busy: boolean; onDone: (v: string) => void }) {
  const [v, setV] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <form
      className="rounded-xl border-2 border-teal/50 bg-[#03140f] p-3 font-mono shadow-[inset_0_0_30px_rgba(46,196,182,.15)]"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.trim()) onDone(v)
      }}
    >
      <label htmlFor="term" className="mb-1 block text-sm text-teal-2">{'>'} הקלידו תשובה ולחצו Enter</label>
      <div className="flex gap-2">
        <input
          id="term"
          ref={ref}
          className="min-h-12 flex-1 rounded-lg border border-teal/40 bg-black/50 px-3 text-lg text-teal-2 outline-none focus:border-teal"
          value={v}
          inputMode={numeric ? 'numeric' : 'text'}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setV(e.target.value)}
          disabled={busy}
        />
        <button className="btn btn-gold shrink-0" disabled={busy || !v.trim()}>Enter</button>
      </div>
    </form>
  )
}

/**
 * A radio dial. Static is loud far from the station and fades as you get close;
 * a faint carrier tone appears near it. The answer is never shown — you tune by ear
 * (and by the signal meter, for players without sound).
 */
function Tuner({ min, max, answer, busy, onDone }: { min: number; max: number; answer: number; busy: boolean; onDone: (v: number) => void }) {
  const [v, setV] = useState(Math.round(min + (max - min) * 0.15))
  const audio = useRef<{ noise: GainNode; tone: GainNode; stop(): void } | null>(null)
  const dist = Math.abs(v - answer)
  const signal = Math.max(0, 1 - dist / 25) // 0..1, for the meter

  useEffect(() => {
    if (!isSoundEnabled()) return
    const ac = getAudioCtx()
    if (!ac) return
    const src = ac.createBufferSource()
    src.buffer = noiseBuffer(ac)
    src.loop = true
    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 2000
    band.Q.value = 0.6
    const noise = ac.createGain()
    noise.gain.value = 0
    src.connect(band).connect(noise).connect(ac.destination)
    src.start()
    const osc = ac.createOscillator()
    osc.frequency.value = 660
    const tone = ac.createGain()
    tone.gain.value = 0
    osc.connect(tone).connect(ac.destination)
    osc.start()
    audio.current = {
      noise,
      tone,
      stop() {
        const n = ac.currentTime
        noise.gain.setTargetAtTime(0, n, 0.05)
        tone.gain.setTargetAtTime(0, n, 0.05)
        src.stop(n + 0.3)
        osc.stop(n + 0.3)
      },
    }
    return () => audio.current?.stop()
  }, [])

  useEffect(() => {
    const a = audio.current
    const ac = getAudioCtx()
    if (!a || !ac) return
    a.noise.gain.setTargetAtTime(0.012 + 0.11 * (1 - signal), ac.currentTime, 0.05)
    a.tone.gain.setTargetAtTime(dist === 0 ? 0.05 : dist < 6 ? 0.015 * (1 - dist / 6) : 0, ac.currentTime, 0.05)
  }, [signal, dist])

  const angle = ((v - min) / (max - min)) * 270 - 135
  const set = (n: number) => setV(Math.min(max, Math.max(min, n)))
  return (
    <div className="mx-auto max-w-sm text-center">
      <div className="tuner-face mb-3">
        <div className="tuner-scale" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} style={{ right: `${i * 10}%` }}>{Math.round(min + ((max - min) * (10 - i)) / 10)}</span>
          ))}
          <i className="tuner-needle" style={{ right: `${100 - ((v - min) / (max - min)) * 100}%` }} />
        </div>
        <p className="font-mono text-4xl font-extrabold text-gold-2" dir="ltr" aria-live="polite">{v}</p>
        <div className="mx-auto mt-2 flex h-3 w-40 items-end gap-0.5" aria-label={`עוצמת קליטה ${Math.round(signal * 100)}%`} role="meter" aria-valuenow={Math.round(signal * 100)} aria-valuemin={0} aria-valuemax={100}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="flex-1 rounded-sm" style={{ height: `${30 + i * 7}%`, background: signal * 10 > i ? (i > 7 ? '#2ec4b6' : '#f2c14e') : 'rgb(255 255 255 / .12)' }} />
          ))}
        </div>
      </div>
      <div className="tuner-knob mx-auto mb-3" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
        <span />
      </div>
      <label htmlFor="tuner" className="sr-only">חוגת התדר</label>
      <input id="tuner" type="range" min={min} max={max} step={1} value={v} disabled={busy} onChange={(e) => set(Number(e.target.value))} className="tuner-range w-full" dir="ltr" />
      <div className="mt-2 grid grid-cols-4 gap-2" dir="ltr">
        <button type="button" className="btn btn-ghost !min-h-10 !px-2" onClick={() => set(v - 10)} disabled={busy} aria-label="מינוס 10">−10</button>
        <button type="button" className="btn btn-ghost !min-h-10 !px-2" onClick={() => set(v - 1)} disabled={busy} aria-label="מינוס 1">−1</button>
        <button type="button" className="btn btn-ghost !min-h-10 !px-2" onClick={() => set(v + 1)} disabled={busy} aria-label="פלוס 1">+1</button>
        <button type="button" className="btn btn-ghost !min-h-10 !px-2" onClick={() => set(v + 10)} disabled={busy} aria-label="פלוס 10">+10</button>
      </div>
      <button type="button" className="btn btn-gold mt-3 w-full" onClick={() => onDone(v)} disabled={busy}>📻 קליטה</button>
    </div>
  )
}
