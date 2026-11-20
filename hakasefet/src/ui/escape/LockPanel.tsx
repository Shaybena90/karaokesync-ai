import { useEffect, useRef, useState } from 'react'
import type { Color, Dir, LockDef, Opt } from '../../escape/types'
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
      setError(wrongFeedback(lock, input))
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
      {lock.kind === 'choice' && <Choice key={resetKey} options={lock.options} busy={busy} onDone={submit} />}
      {lock.kind === 'sequence' && <Sequence key={resetKey} unique={!lock.repeat} length={lock.answer.length} busy={busy} onDone={(v) => submit(v.join(','))} options={lock.options.map((o) => ({ value: o.id, node: o.icon ? <span aria-hidden="true">{o.icon}</span> : null, label: o.label }))} />}
      {lock.kind === 'multi' && <Multi key={resetKey} options={lock.options} busy={busy} onDone={(v) => submit(v.join(','))} />}
      {lock.kind === 'accuse' && <Accuse key={resetKey} suspects={lock.suspects} evidence={lock.evidence} busy={busy} onDone={(who, ev) => submit(`${who}|${ev.join(',')}`)} />}
      {lock.kind === 'tuner' && <Tuner key={resetKey} min={lock.min} max={lock.max} answer={lock.answer} busy={busy} onDone={(v) => submit(String(v))} />}
      <p role="alert" aria-live="assertive" className="mt-2 min-h-6 text-center font-bold text-coral">{error ? `✗ ${error}` : busy ? <span className="text-mist">בודק…</span> : ''}</p>
    </div>
  )
}

/** Short, spoiler-free feedback for a wrong submission. */
export function wrongFeedback(lock: LockDef, input: string): string {
  if (lock.kind === 'choice' && lock.feedback?.[input]) return lock.feedback[input]
  if (lock.kind === 'multi') {
    const got = input.split(',').filter(Boolean)
    if (got.length < lock.answer.length) return 'חסר משהו ברשימה.'
    if (got.length > lock.answer.length) return 'סימנתם יותר מדי.'
    return 'הבחירה לא מדויקת.'
  }
  if (lock.kind === 'accuse') {
    const [who, ev = ''] = input.split('|')
    const got = ev.split(',').filter(Boolean)
    if (who !== lock.answer) return 'הראיות לא תומכות בטענה הזאת.'
    if (!lock.required.every((x) => got.includes(x))) return 'הכיוון נכון — אבל חסרה ראיה שמוכיחה את זה.'
    return 'אחת הראיות שצירפתם לא קשורה או סותרת.'
  }
  if (lock.kind === 'sequence') return 'הסדר לא נכון.'
  return 'לא נכון. נסו שוב.'
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

function Sequence<T extends string>({ length, options, busy, onDone, unique }: { length: number; options: { value: T; node: React.ReactNode; label: string }[]; busy: boolean; onDone: (v: T[]) => void; unique?: boolean }) {
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
            disabled={busy || full || (unique && v.includes(o.value))}
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

function Choice({ options, busy, onDone }: { options: Opt[]; busy: boolean; onDone: (v: string) => void }) {
  return (
    <div className="mx-auto grid max-w-md gap-2" role="group" aria-label="אפשרויות">
      {options.map((o) => (
        <button key={o.id} type="button" className="tile flex min-h-14 items-center gap-3 rounded-xl border border-gold/25 px-4 text-right text-lg font-bold" disabled={busy} onClick={() => { play('tap'); onDone(o.id) }}>
          {o.icon && <span className="text-2xl" aria-hidden="true">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Multi({ options, busy, onDone }: { options: Opt[]; busy: boolean; onDone: (v: string[]) => void }) {
  const [v, setV] = useState<string[]>([])
  return (
    <div className="mx-auto max-w-md">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="סמנו את כל מה שמתאים">
        {options.map((o) => {
          const on = v.includes(o.id)
          return (
            <button key={o.id} type="button" role="checkbox" aria-checked={on} disabled={busy} onClick={() => { play('tap'); setV(on ? v.filter((x) => x !== o.id) : [...v, o.id]) }} className={`tile flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 font-bold ${on ? 'border-teal bg-teal/15 text-teal-2' : 'border-white/15'}`}>
              <span aria-hidden="true">{on ? '☑' : '☐'}</span>
              {o.icon && <span aria-hidden="true">{o.icon}</span>}
              {o.label}
            </button>
          )
        })}
      </div>
      <button type="button" className="btn btn-gold mt-3 w-full" disabled={busy || !v.length} onClick={() => onDone(v)}>אישור ({v.length})</button>
    </div>
  )
}

/**
 * Name a claim / suspect and attach evidence. Evidence can be dragged onto the
 * case file, or simply tapped (the accessible way, and the only one on touch).
 */
function Accuse({ suspects, evidence, busy, onDone }: { suspects: Opt[]; evidence: Opt[]; busy: boolean; onDone: (who: string, ev: string[]) => void }) {
  const [who, setWho] = useState<string | null>(null)
  const [ev, setEv] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const toggle = (id: string) => setEv((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]))
  return (
    <div className="mx-auto max-w-md space-y-3">
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-mist">1. בחרו:</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {suspects.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={who === o.id} disabled={busy} onClick={() => { play('tap'); setWho(o.id) }} className={`tile flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 text-right font-bold ${who === o.id ? 'border-gold bg-gold/15 text-gold-2' : 'border-white/15'}`}>
              {o.icon && <span aria-hidden="true">{o.icon}</span>}
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-mist">2. צרפו ראיות (גררו לתיק או הקישו):</legend>
        <div className="flex flex-wrap gap-2">
          {evidence.filter((o) => !ev.includes(o.id)).map((o) => (
            <button key={o.id} type="button" draggable disabled={busy} onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)} onClick={() => { play('tap'); toggle(o.id) }} className="tile flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-3 text-sm font-bold" aria-label={`לצרף: ${o.label}`}>
              {o.icon && <span aria-hidden="true">{o.icon}</span>}
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div
        className={`min-h-20 rounded-xl border-2 border-dashed p-3 ${over ? 'border-teal bg-teal/10' : 'border-gold/40 bg-black/20'}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id && !ev.includes(id) && evidence.some((x) => x.id === id)) setEv([...ev, id]) }}
        aria-label="תיק ההוכחות"
      >
        <p className="mb-2 text-xs text-dim">📂 תיק ההוכחות {ev.length > 0 && `(${ev.length})`}</p>
        <div className="flex flex-wrap gap-2">
          {ev.map((id) => {
            const o = evidence.find((x) => x.id === id)!
            return (
              <button key={id} type="button" disabled={busy} onClick={() => toggle(id)} className="flex min-h-10 items-center gap-1.5 rounded-full border border-teal/60 bg-teal/15 px-3 text-sm font-bold text-teal-2" aria-label={`להסיר: ${o.label}`}>
                {o.icon && <span aria-hidden="true">{o.icon}</span>}
                {o.label} ✕
              </button>
            )
          })}
        </div>
      </div>
      <button type="button" className="btn btn-gold w-full" disabled={busy || !who || !ev.length} onClick={() => who && onDone(who, ev)}>⚖️ הגשה</button>
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
