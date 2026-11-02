import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DocLine } from '../../lib/lyricsDoc'

interface Props {
  line: DocLine
  lineNumber: number
  lyricDir: 'rtl' | 'ltr' | 'auto'
  /** Song position in ms — read from the audio element, never from a timer. */
  currentTimeMs: () => number
  /** Start playing a little before the line. */
  onStart: () => void
  onFinish: (taps: number[], lastEndMs?: number) => void
  onCancel: () => void
}

/**
 * Tap-to-sync: the song plays and the user taps (or presses Space / Enter)
 * whenever a word starts, and once more when the last word ends.
 */
export function TapSyncPanel({ line, lineNumber, lyricDir, currentTimeMs, onStart, onFinish, onCancel }: Props) {
  const { t } = useI18n()
  const [taps, setTaps] = useState<number[]>([])
  const tapsRef = useRef<number[]>([])
  const count = line.words.length

  const restart = useCallback(() => {
    tapsRef.current = []
    setTaps([])
    onStart()
  }, [onStart])

  // Start playing once, when the panel opens; restart() handles later restarts.
  const startOnOpen = useRef(onStart)
  useEffect(() => startOnOpen.current(), [])

  const tap = useCallback(() => {
    const now = Math.round(currentTimeMs())
    const prev = tapsRef.current
    if (prev.length === count) {
      // The extra tap marks the end of the last word.
      onFinish(prev, Math.max(now, prev[prev.length - 1]))
      return
    }
    const next = [...prev, Math.max(now, prev[prev.length - 1] ?? 0)]
    tapsRef.current = next
    setTaps(next)
  }, [count, currentTimeMs, onFinish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        tap()
      } else if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tap, onCancel])

  const allTapped = taps.length === count
  const nextWord = line.words[taps.length]

  return (
    <div className="space-y-3" data-testid="tap-sync">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">
          {t('editor.tap.title')} · #{lineNumber}
        </h2>
        <button type="button" onClick={onCancel} className="rounded-xl px-2 py-1 text-sm text-white/60 hover:text-white" aria-label={t('editor.tap.cancel')}>
          ✕
        </button>
      </div>
      <p className="text-xs text-white/60">{t('editor.tap.help')}</p>

      <div className="flex flex-wrap gap-1.5" dir={lyricDir}>
        {line.words.map((w, i) => (
          <span
            key={w.id}
            className={`rounded-xl px-2.5 py-1 text-base font-semibold ${
              i < taps.length ? 'bg-fuchsia-500/35 text-white' : i === taps.length ? 'bg-white/15 ring-2 ring-fuchsia-300' : 'bg-white/5 text-white/60'
            }`}
          >
            {w.text}
          </span>
        ))}
      </div>

      <p className="text-sm text-white/70" aria-live="polite">
        {allTapped ? t('editor.tap.end') : `${t('editor.tap.next')}: ${nextWord?.text ?? ''}`}
      </p>

      <button
        type="button"
        // pointerdown, not click: click fires on release, which adds a delay.
        onPointerDown={(e) => {
          e.preventDefault()
          tap()
        }}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && e.preventDefault()}
        className="block min-h-24 w-full touch-manipulation select-none rounded-3xl bg-gradient-to-br from-fuchsia-600 to-violet-600 text-2xl font-bold shadow-lg shadow-fuchsia-900/40 active:scale-[0.98]"
      >
        {t('editor.tap.button')}
      </button>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={restart} className="min-h-10 rounded-xl bg-white/10 px-2 text-sm font-medium hover:bg-white/15">
          ↺ {t('editor.tap.restart')}
        </button>
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl bg-white/10 px-2 text-sm font-medium hover:bg-white/15">
          {t('editor.tap.cancel')}
        </button>
        <button
          type="button"
          disabled={taps.length === 0}
          onClick={() => onFinish(taps)}
          className="min-h-10 rounded-xl bg-emerald-500/25 px-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/35 disabled:opacity-40"
        >
          ✓ {t('editor.tap.done')}
        </button>
      </div>
    </div>
  )
}
