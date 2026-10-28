import { useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useI18n } from '../i18n/I18nProvider'
import { directionOf, formatDuration } from '../lib/format'
import { supabase } from '../lib/supabase'
import { displayLineIndex, wordFill } from '../lib/sync'
import type { LyricLine, LyricWord } from '../lib/types'
import { Spinner } from './ui'

interface Props {
  projectId: string
  storagePath: string | null
  language: string | null
}

/**
 * Synced lyric preview. Timing is read from the audio element on every
 * animation frame (never from an independent timer), so seeking or pausing
 * updates the highlight immediately. The full player arrives in stage 6.
 */
export function LyricsPreview({ projectId, storagePath, language }: Props) {
  const { t } = useI18n()
  const [lines, setLines] = useState<LyricLine[] | null>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [timeMs, setTimeMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [audioReady, setAudioReady] = useState(false)
  const waveRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const wordEls = useRef(new Map<string, HTMLSpanElement>())
  const dir = directionOf(language)

  // Load lyrics (RLS: only the owner can read them).
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const [{ data: l }, { data: w }] = await Promise.all([
        supabase.from('lyric_lines').select('id, line_index, start_ms, end_ms').eq('project_id', projectId).order('line_index'),
        supabase
          .from('lyric_words')
          .select('id, line_id, text, start_ms, end_ms, word_index, confidence')
          .eq('project_id', projectId)
          .order('word_index'),
      ])
      const byLine = new Map<string, LyricWord[]>()
      for (const word of (w ?? []) as LyricWord[]) {
        byLine.set(word.line_id, [...(byLine.get(word.line_id) ?? []), word])
      }
      setLines(((l ?? []) as Omit<LyricLine, 'words'>[]).map((line) => ({ ...line, words: byLine.get(line.id) ?? [] })))
    })()
  }, [projectId])

  // Audio + waveform, from a short-lived signed URL.
  useEffect(() => {
    if (!supabase || !storagePath || !waveRef.current) return
    let ws: WaveSurfer | null = null
    let cancelled = false
    void (async () => {
      const { data } = await supabase.storage.from('audio').createSignedUrl(storagePath, 60 * 30)
      if (cancelled || !data?.signedUrl || !waveRef.current) return
      ws = WaveSurfer.create({
        container: waveRef.current,
        url: data.signedUrl,
        height: 56,
        waveColor: 'rgba(255,255,255,0.25)',
        progressColor: '#a855f7',
        cursorColor: '#e879f9',
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        normalize: true,
      })
      wsRef.current = ws
      ws.on('ready', (d) => {
        setDurationMs(d * 1000)
        setAudioReady(true)
      })
      ws.on('play', () => setPlaying(true))
      ws.on('pause', () => setPlaying(false))
      ws.on('timeupdate', (s) => setTimeMs(s * 1000))
    })()
    return () => {
      cancelled = true
      ws?.destroy()
      wsRef.current = null
    }
  }, [storagePath])

  const allWords = useMemo(() => lines?.flatMap((l) => l.words) ?? [], [lines])

  // Per-frame highlight driven by the audio clock.
  useEffect(() => {
    if (!lines) return
    let raf = 0
    const tick = () => {
      const ws = wsRef.current
      const now = ws ? ws.getCurrentTime() * 1000 : 0
      setLineIndex((prev) => {
        const next = displayLineIndex(lines, now)
        return next === prev ? prev : next
      })
      for (const word of allWords) {
        const el = wordEls.current.get(word.id)
        if (el) el.style.setProperty('--p', String(wordFill(word, now)))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines, allWords])

  if (lines === null) {
    return (
      <div className="grid min-h-40 place-items-center text-white/60">
        <Spinner className="size-7" />
      </div>
    )
  }
  if (lines.length === 0) return <p className="text-white/60">{t('project.noWords')}</p>

  const visible = lines.slice(lineIndex, lineIndex + 2)

  return (
    <div>
      <div
        className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-3xl bg-black/30 px-4 py-8 text-center ring-1 ring-white/5"
        dir={dir}
        lang={language ?? undefined}
      >
        {visible.map((line, i) => (
          <p
            key={line.id}
            className={`font-display leading-snug font-bold transition-all ${i === 0 ? 'text-2xl sm:text-4xl' : 'text-lg text-white/40 sm:text-2xl'}`}
          >
            {line.words.map((w) => (
              <span
                key={w.id}
                ref={(el) => {
                  if (el) wordEls.current.set(w.id, el)
                  else wordEls.current.delete(w.id)
                }}
                className={i === 0 ? 'karaoke-word' : ''}
              >
                {w.text}{' '}
              </span>
            ))}
          </p>
        ))}
      </div>

      {storagePath ? (
        <div className="mt-4 flex items-center gap-3" dir="ltr">
          <button
            type="button"
            disabled={!audioReady}
            onClick={() => wsRef.current?.playPause()}
            aria-label={playing ? t('project.pause') : t('project.play')}
            className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-900/40 transition active:scale-95 disabled:opacity-50"
          >
            {!audioReady ? (
              <Spinner />
            ) : playing ? (
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
                <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div ref={waveRef} className="w-full" />
            <div className="mt-1 flex justify-between text-xs tabular-nums text-white/50">
              <span>{formatDuration(timeMs)}</span>
              <span>{formatDuration(durationMs)}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-white/50">{t('project.audioGone')}</p>
      )}
    </div>
  )
}
