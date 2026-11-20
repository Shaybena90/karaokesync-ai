import { useEffect, useRef, useState } from 'react'
import type { Voice } from '../../escape/types'
import { isSoundEnabled } from '../audio'
import { hasHebrewVoice, playVoice, voicesReady, type Playback } from '../voice'

/**
 * Plays a spoken message (radio / phone / computer) when the note opens,
 * with a live waveform, replay and stop. The transcript is always there —
 * for reading along, for players without sound, and on devices without a
 * Hebrew voice.
 */
export function VoicePlayer({ voice, transcript }: { voice: Voice; transcript: string }) {
  const [state, setState] = useState<'idle' | 'playing' | 'done'>('idle')
  const [line, setLine] = useState(-1)
  const [noVoice, setNoVoice] = useState(false)
  const [showText, setShowText] = useState(false)
  const pb = useRef<Playback | null>(null)

  const start = async () => {
    pb.current?.stop()
    await voicesReady()
    setNoVoice(!hasHebrewVoice())
    setState('playing')
    const p = playVoice(voice, setLine)
    pb.current = p
    if (!p.spoken) setShowText(true)
    await p.done
    if (pb.current === p) {
      setState('done')
      setLine(-1)
      setShowText(true)
    }
  }

  useEffect(() => {
    // opening the object is a tap, so autoplay is allowed
    if (isSoundEnabled()) void start()
    else setShowText(true)
    return () => pb.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label = voice.effect === 'radio' ? '📻 שידור נכנס' : voice.effect === 'phone' ? '☎️ שיחה נכנסת' : '🖥️ הודעה קולית'
  return (
    <div className={`rounded-xl border-2 p-4 ${voice.effect === 'computer' ? 'border-teal/50 bg-[#03140f]' : 'border-gold/40 bg-black/40'}`} data-testid="voice">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-bold">{label}</span>
        <div className="flex gap-2">
          {state === 'playing' ? (
            <button className="btn btn-ghost !min-h-9 !px-3 !text-sm" onClick={() => { pb.current?.stop(); setState('done'); setShowText(true) }}>■ עצירה</button>
          ) : (
            <button className="btn btn-gold !min-h-9 !px-3 !text-sm" onClick={() => void start()}>▶ {state === 'idle' ? 'השמעה' : 'שוב'}</button>
          )}
          <button className="btn btn-ghost !min-h-9 !px-3 !text-sm" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>תמליל</button>
        </div>
      </div>
      <div className={`voice-wave ${state === 'playing' ? 'is-playing' : ''} ${voice.effect === 'computer' ? 'is-computer' : ''}`} aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => <span key={i} style={{ animationDelay: `${(i * 53) % 700}ms` }} />)}
      </div>
      {noVoice && <p className="mt-2 text-xs text-dim">במכשיר הזה אין קול דיבור בעברית — הנה התמליל.</p>}
      {showText ? (
        <ol className={`mt-3 space-y-1 text-lg leading-relaxed ${voice.effect === 'computer' ? 'font-mono text-teal-2' : ''}`} aria-live="polite">
          {voice.lines.map((l, i) => (
            <li key={i} className={i === line ? 'text-gold-2' : ''}>{l}</li>
          ))}
        </ol>
      ) : (
        <p className="sr-only">{transcript}</p>
      )}
    </div>
  )
}
