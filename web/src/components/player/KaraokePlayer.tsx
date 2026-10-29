import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { AudioClock } from '../../lib/audioClock'
import { directionOf, formatDuration } from '../../lib/format'
import { computeView, sameView, wordState, type KaraokeView } from '../../lib/karaoke'
import { wordFill } from '../../lib/sync'
import type { LyricLine } from '../../lib/types'
import { useLyrics } from '../../lib/useLyrics'
import { useSignedAudio } from '../../lib/useSignedAudio'
import { DEFAULT_STYLE, styleVars, type SubtitleStyle } from '../../lib/subtitleStyle'
import { Spinner } from '../ui'
import { LyricsStage } from './LyricsStage'
import { useFullscreen } from './useFullscreen'
import { useWakeLock } from './useWakeLock'

interface Props {
  projectId: string
  title: string
  storagePath: string | null
  language: string | null
  variant?: 'embedded' | 'page'
  style?: SubtitleStyle
  /** Show the lyrics inside a frame with the export video's aspect ratio (style/export page). */
  videoFrame?: VideoAspect
}

export type VideoAspect = '16:9' | '9:16' | '1:1'

/**
 * Inside a video frame, sizes are relative to the frame width (cqi) with the
 * same proportions as the exported video (server/karaokesync/exports/ass.py):
 * base text size 6.67% of the short side (8.5% of the width when vertical),
 * 6% side margins and 10% top/bottom margins.
 */
const FRAME: Record<VideoAspect, { ratio: string; base: string; padY: string }> = {
  '16:9': { ratio: '16 / 9', base: '3.75cqi', padY: '5.6cqi' },
  '9:16': { ratio: '9 / 16', base: '8.5cqi', padY: '17.8cqi' },
  '1:1': { ratio: '1 / 1', base: '6.67cqi', padY: '10cqi' },
}

const SKIP_MS = 5000
const EMPTY_VIEW: KaraokeView = { main: -1, prev: -1, next: -1, countdown: null, instrumental: false }

export function KaraokePlayer({
  projectId,
  title,
  storagePath,
  language,
  variant = 'embedded',
  style = DEFAULT_STYLE,
  videoFrame,
}: Props) {
  const { t, dir: uiDir } = useI18n()
  const { lines, error: lyricsError } = useLyrics(projectId)
  const { url, failed: urlFailed, refresh } = useSignedAudio(storagePath)

  const audioRef = useRef<HTMLAudioElement>(null)
  const clockRef = useRef<{ audio: HTMLAudioElement; clock: AudioClock } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const wordEls = useRef(new Map<string, HTMLSpanElement>())
  const scrubbing = useRef(false)
  const restoreRef = useRef<{ time: number; play: boolean } | null>(null)
  const lastRecovery = useRef(0)

  const [view, setView] = useState<KaraokeView>(EMPTY_VIEW)
  const [playing, setPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [ready, setReady] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const { isFullscreen, toggle: toggleFullscreen, pseudo } = useFullscreen(containerRef)
  useWakeLock(playing)

  const lyricDir = directionOf(language)
  const wordsById = useMemo(() => {
    const map = new Map<string, { start_ms: number; end_ms: number }>()
    for (const line of lines ?? []) for (const w of line.words) map.set(w.id, w)
    return map
  }, [lines])

  // ------------------------------------------------------------ frame render
  /** Draw everything for the current audio position. Cheap: called every frame while playing. */
  const renderFrame = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !lines) return
    if (clockRef.current?.audio !== audio) clockRef.current = { audio, clock: new AudioClock(audio) }
    const now = clockRef.current.clock.nowMs()

    const next = computeView(lines, now)
    setView((prev) => (sameView(prev, next) ? prev : next))

    for (const [id, el] of wordEls.current) {
      const word = wordsById.get(id)
      if (!word) continue
      const state = style.animation === 'none' ? 'upcoming' : wordState(word, now)
      const fill = style.animation === 'fill' ? wordFill(word, now) : state === 'upcoming' ? 0 : 1
      el.style.setProperty('--p', fill.toFixed(4))
      if (el.dataset.state !== state) el.dataset.state = state
    }

    if (!scrubbing.current && seekRef.current) {
      seekRef.current.value = String(Math.round(now))
      const pct = audio.duration > 0 ? (now / (audio.duration * 1000)) * 100 : 0
      seekRef.current.style.setProperty('--pct', `${Math.min(100, pct)}%`)
      seekRef.current.setAttribute('aria-valuetext', formatDuration(now))
    }
    if (timeRef.current) timeRef.current.textContent = formatDuration(now)
  }, [lines, wordsById, style.animation])

  // Animation loop only while playing; single renders on seek/pause/load.
  useEffect(() => {
    if (!playing) {
      renderFrame()
      return
    }
    let raf = 0
    const loop = () => {
      renderFrame()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, renderFrame])

  const registerWord = useCallback(
    (id: string, el: HTMLSpanElement | null) => {
      if (el) {
        wordEls.current.set(id, el)
        // Paint the new line immediately, so it never flashes un-filled.
        requestAnimationFrame(renderFrame)
      } else {
        wordEls.current.delete(id)
      }
    },
    [renderFrame],
  )

  // ---------------------------------------------------------------- controls
  const seekTo = useCallback(
    (ms: number) => {
      const audio = audioRef.current
      if (!audio) return
      const max = Number.isFinite(audio.duration) ? audio.duration * 1000 : ms
      audio.currentTime = Math.max(0, Math.min(ms, max)) / 1000
      clockRef.current?.clock.reset()
      renderFrame()
    },
    [renderFrame],
  )

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
    }
  }, [])

  const skip = useCallback((delta: number) => seekTo((audioRef.current?.currentTime ?? 0) * 1000 + delta), [seekTo])

  // Land exactly on the line's first word, so that line (not the previous one) is shown.
  const seekToLine = useCallback((line: LyricLine) => seekTo(line.start_ms), [seekTo])

  const onKeyDown = useCallback(
    (e: KeyboardEvent | ReactKeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      // Arrow keys follow the visual direction of the seek bar.
      const forwardKey = uiDir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      const backKey = uiDir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === ' ' || e.key === 'k') togglePlay()
      else if (e.key === forwardKey) skip(SKIP_MS)
      else if (e.key === backKey) skip(-SKIP_MS)
      else if (e.key === 'f') toggleFullscreen()
      else if (e.key === 'Home') seekTo(0)
      else return
      e.preventDefault()
    },
    [uiDir, togglePlay, skip, toggleFullscreen, seekTo],
  )

  // On the dedicated page (or in fullscreen) shortcuts work without focusing the player.
  useEffect(() => {
    if (variant !== 'page' && !isFullscreen) return
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [variant, isFullscreen, onKeyDown])

  // Lock-screen / headphone controls on phones.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'KaraokeSync AI' })
    navigator.mediaSession.setActionHandler('play', () => audioRef.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => skip(-SKIP_MS))
    navigator.mediaSession.setActionHandler('seekforward', () => skip(SKIP_MS))
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && seekTo(d.seekTime * 1000))
    return () => {
      for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto'] as const) {
        navigator.mediaSession.setActionHandler(action, null)
      }
    }
  }, [title, skip, seekTo])

  // ------------------------------------------------------------ audio events
  const onLoadedMetadata = () => {
    const audio = audioRef.current!
    setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0)
    setReady(true)
    setAudioError(false)
    const restore = restoreRef.current
    if (restore) {
      restoreRef.current = null
      audio.currentTime = restore.time
      if (restore.play) void audio.play().catch(() => undefined)
    }
    renderFrame()
  }

  /** The signed URL may expire during a long session: get a new one and resume. */
  const onAudioError = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (Date.now() - lastRecovery.current < 15000) {
      setAudioError(true)
      setPlaying(false)
      return
    }
    lastRecovery.current = Date.now()
    restoreRef.current = { time: audio.currentTime, play: !audio.paused || playing }
    setReady(false)
    if (!(await refresh())) setAudioError(true)
  }

  // ------------------------------------------------------------------ render
  if (lyricsError) return <p className="text-white/60">{t('error.generic')}</p>
  if (lines === null) {
    return (
      <div className="grid min-h-48 place-items-center text-white/60">
        <Spinner className="size-7" />
      </div>
    )
  }
  if (lines.length === 0) return <p className="text-white/60">{t('project.noWords')}</p>

  const large = variant === 'page' || isFullscreen
  const canPlay = Boolean(storagePath) && !urlFailed && !audioError
  const frame = videoFrame ? FRAME[videoFrame] : null
  const justify = { top: 'justify-start', center: 'justify-center', bottom: 'justify-end' }[style.position]
  const stageVars = {
    ...styleVars(style),
    '--k-base': frame ? frame.base : large ? 'clamp(2rem, 7vw, 5.5rem)' : 'clamp(1.6rem, 6vw, 3.25rem)',
  } as CSSProperties

  const stage = (
    <LyricsStage
      lines={lines}
      view={view.main === -1 ? computeView(lines, 0) : view}
      dir={lyricDir}
      language={language}
      videoFrame={Boolean(frame)}
      showNext={style.show_next_line}
      textBox={style.text_box}
      registerWord={registerWord}
      onSeekToLine={seekToLine}
    />
  )

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={variant === 'embedded' && !isFullscreen ? onKeyDown : undefined}
      style={stageVars}
      className={`karaoke-theme flex flex-col overflow-hidden outline-none ${frame && !isFullscreen ? '' : 'bg-[image:var(--k-bg)]'} ${
        isFullscreen
          ? `${pseudo ? 'fixed inset-0 z-50' : 'h-full w-full'} px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]`
          : frame
            ? ''
            : variant === 'page'
              ? 'min-h-[calc(100dvh-10rem)] rounded-3xl px-4 py-5 ring-1 ring-white/5 sm:px-8'
              : 'rounded-3xl px-4 py-5 ring-1 ring-white/5'
      }`}
    >
      {isFullscreen && (
        <p className="truncate text-center text-sm text-white/50" dir="auto">
          {title}
        </p>
      )}

      {/* Lyrics */}
      {frame && !isFullscreen ? (
        <div
          className="relative mx-auto max-w-full overflow-hidden rounded-2xl bg-[image:var(--k-bg)] ring-1 ring-white/10 [container-type:inline-size]"
          style={{ aspectRatio: frame.ratio, ...(videoFrame === '16:9' ? { width: '100%' } : { height: '62vh' }) }}
        >
          <div
            className={`absolute inset-0 flex flex-col items-center ${justify}`}
            style={{ paddingBlock: frame.padY, paddingInline: '6cqi' }}
          >
            {stage}
          </div>
        </div>
      ) : (
        <div className={`flex flex-1 flex-col items-center ${large ? 'py-8' : 'min-h-56 py-4'} ${justify}`}>{stage}</div>
      )}

      {/* Controls */}
      {storagePath ? (
        <div className="mx-auto w-full max-w-3xl">
          {audioError || urlFailed ? (
            <p role="alert" className="mb-3 text-center text-sm text-red-200">
              {t('player.audioError')}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  lastRecovery.current = 0
                  setAudioError(false)
                  void refresh()
                }}
              >
                {t('upload.retry')}
              </button>
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <span ref={timeRef} dir="ltr" className="w-12 text-xs tabular-nums text-white/60">
              0:00
            </span>
            <input
              ref={seekRef}
              type="range"
              className="ks-seek"
              min={0}
              max={Math.max(1, Math.round(durationMs))}
              step={100}
              defaultValue={0}
              disabled={!ready}
              aria-label={t('player.seek')}
              onPointerDown={() => (scrubbing.current = true)}
              onPointerUp={() => (scrubbing.current = false)}
              onPointerCancel={() => (scrubbing.current = false)}
              onBlur={() => (scrubbing.current = false)}
              onInput={(e) => {
                const value = Number(e.currentTarget.value)
                e.currentTarget.style.setProperty('--pct', `${durationMs ? (value / durationMs) * 100 : 0}%`)
                seekTo(value)
              }}
            />
            <span dir="ltr" className="w-12 text-end text-xs tabular-nums text-white/60">
              {formatDuration(durationMs)}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center">
            <span />
            <div className="flex items-center gap-4 sm:gap-6">
              <RoundButton label={t('player.back5')} onClick={() => skip(-SKIP_MS)} disabled={!ready}>
                <SkipIcon back />
              </RoundButton>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!canPlay || !url}
                aria-label={playing ? t('project.pause') : t('project.play')}
                className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-900/50 transition active:scale-95 disabled:opacity-50 sm:size-[4.5rem]"
              >
                {canPlay && !ready && url ? (
                  <Spinner className="size-6" />
                ) : playing ? (
                  <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
                  </svg>
                )}
              </button>
              <RoundButton label={t('player.forward5')} onClick={() => skip(SKIP_MS)} disabled={!ready}>
                <SkipIcon />
              </RoundButton>
            </div>
            <div className="flex justify-end">
              <RoundButton
                label={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
                onClick={toggleFullscreen}
                subtle
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  {isFullscreen ? (
                    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  ) : (
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  )}
                </svg>
              </RoundButton>
            </div>
          </div>

          {url && (
            <audio
              ref={audioRef}
              src={url}
              preload="auto"
              playsInline
              onLoadedMetadata={onLoadedMetadata}
              onDurationChange={(e) => {
                const d = e.currentTarget.duration
                if (Number.isFinite(d)) setDurationMs(d * 1000)
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onSeeked={renderFrame}
              onTimeUpdate={playing ? undefined : renderFrame}
              onError={onAudioError}
            />
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-white/50">{t('project.audioGone')}</p>
      )}
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  disabled,
  subtle,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  subtle?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid size-12 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
        subtle ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'bg-white/10 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}

/** "5 seconds back/forward" icon (↺ / ↻, the universal convention in both directions). */
function SkipIcon({ back = false }: { back?: boolean }) {
  return (
    <span className="relative grid size-6 place-items-center">
      <svg
        viewBox="0 0 24 24"
        className={`absolute inset-0 size-6 ${back ? '-scale-x-100' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v4h-4" />
      </svg>
      <span className="relative pt-px text-[9px] font-bold" aria-hidden="true">
        5
      </span>
    </span>
  )
}
