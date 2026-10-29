import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type WaveSurfer from 'wavesurfer.js'
import { LinesList } from '../components/editor/LinesList'
import { WaveformTimeline } from '../components/editor/WaveformTimeline'
import { WordInspector } from '../components/editor/WordInspector'
import { Alert, Spinner } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/he'
import { directionOf, formatDuration } from '../lib/format'
import {
  deleteWord,
  findWord,
  flatWords,
  fromLyricLines,
  historyReducer,
  insertWord,
  lineEnd,
  lineStart,
  mergeWithNext,
  setWordText,
  setWordTiming,
  shiftTiming,
  splitLineAt,
  type DocLine,
  type LyricsDoc,
} from '../lib/lyricsDoc'
import { activeWordIndex } from '../lib/sync'
import { useLyrics } from '../lib/useLyrics'
import { useLyricsAutosave, type SaveStatus } from '../lib/useLyricsAutosave'
import { useProjectLive } from '../lib/useProjectLive'
import { useSignedAudio } from '../lib/useSignedAudio'

const statusKey: Record<SaveStatus, MessageKey> = {
  saved: 'editor.status.saved',
  pending: 'editor.status.pending',
  saving: 'editor.status.saving',
  error: 'editor.status.error',
  offline: 'editor.status.offline',
  conflict: 'editor.status.conflict',
  invalid: 'editor.status.invalid',
}

export function EditorPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const { project, audio, loading, notFound } = useProjectLive(id)
  const { lines } = useLyrics(id)
  const storagePath = audio?.status === 'verified' ? audio.storage_path : null
  const { url } = useSignedAudio(storagePath)

  const [history, dispatch] = useReducer(historyReducer, { past: [], present: [], future: [] })
  const [initialized, setInitialized] = useState(false)
  const doc = history.present
  const docRef = useRef<LyricsDoc>(doc)
  useLayoutEffect(() => {
    docRef.current = doc
  }, [doc])
  const { status, markSaved } = useLyricsAutosave(id, 0, initialized ? doc : null)

  // Load the lyrics once, together with the version they belong to.
  useEffect(() => {
    if (initialized || !lines || !project) return
    const loaded = fromLyricLines(lines)
    dispatch({ type: 'reset', doc: loaded })
    markSaved(loaded, project.lyrics_version ?? 0)
    setInitialized(true)
  }, [initialized, lines, project, markSaved])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(120)
  const [rate, setRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null)
  const loopRef = useRef(loop)
  useLayoutEffect(() => {
    loopRef.current = loop
  }, [loop])
  const [waveReady, setWaveReady] = useState(false)
  const wsRef = useRef<WaveSurfer | null>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const chips = useRef(new Map<string, HTMLButtonElement>())
  const playingChip = useRef<HTMLButtonElement | null>(null)

  const lyricDir = directionOf(project?.language)

  // ------------------------------------------------------------ edit helpers
  const edit = useCallback((fn: (d: LyricsDoc) => LyricsDoc) => {
    const next = fn(docRef.current)
    if (next === docRef.current) return
    docRef.current = next
    dispatch({ type: 'apply', doc: next })
  }, [])

  const nowMs = useCallback(() => (wsRef.current?.getCurrentTime() ?? 0) * 1000, [])
  const audioDuration = useCallback(() => (wsRef.current ? wsRef.current.getDuration() * 1000 : undefined), [])

  const select = useCallback((wordId: string) => {
    setSelectedId(wordId)
    // On phones the word panel covers the lower half: keep the chosen word visible above it.
    chips.current.get(wordId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const pos = findWord(docRef.current, wordId)
    if (pos && wsRef.current && !wsRef.current.isPlaying()) {
      wsRef.current.setTime(docRef.current[pos.line].words[pos.word].start_ms / 1000)
    }
  }, [])

  const onTimingChange = useCallback(
    (wordId: string, start: number, end: number, moved = false) => {
      edit((d) => setWordTiming(d, wordId, start, end, audioDuration(), moved))
      setSelectedId(wordId)
    },
    [edit, audioDuration],
  )

  // --------------------------------------------------------------- playback
  const playRange = useCallback((startMs: number, endMs: number) => {
    const ws = wsRef.current
    if (!ws) return
    setLoop(null)
    void ws.play(startMs / 1000, Math.max(endMs, startMs + 50) / 1000)
  }, [])

  const loopRange = useCallback((startMs: number, endMs: number) => {
    const ws = wsRef.current
    if (!ws) return
    const range = { start: startMs, end: Math.max(endMs, startMs + 200) }
    setLoop(range)
    ws.setTime(range.start / 1000)
    void ws.play()
  }, [])

  const togglePlay = useCallback(() => void wsRef.current?.playPause(), [])

  const onWaveReady = useCallback(
    (ws: WaveSurfer | null) => {
      wsRef.current = ws
      setWaveReady(Boolean(ws))
      if (!ws) return
      ws.on('play', () => setPlaying(true))
      ws.on('pause', () => setPlaying(false))
      ws.on('finish', () => setPlaying(false))
      ws.on('timeupdate', (sec: number) => {
        const ms = sec * 1000
        const l = loopRef.current
        if (l && ws.isPlaying() && ms >= l.end) {
          ws.setTime(l.start / 1000)
          return
        }
        if (timeRef.current) timeRef.current.textContent = `${formatDuration(ms)}.${String(Math.floor((ms % 1000) / 100))}`
        // Highlight the word under the playhead (driven by the audio clock).
        const words = flatWords(docRef.current)
        const i = activeWordIndex(words, ms)
        const chip = i >= 0 ? chips.current.get(words[i].id) ?? null : null
        if (chip !== playingChip.current) {
          playingChip.current?.removeAttribute('data-playing')
          chip?.setAttribute('data-playing', 'true')
          playingChip.current = chip
        }
      })
    },
    [],

  )

  useEffect(() => {
    if (waveReady) wsRef.current?.setPlaybackRate(rate, true)
  }, [rate, waveReady])

  const registerChip = useCallback((wordId: string, el: HTMLButtonElement | null) => {
    if (el) chips.current.set(wordId, el)
    else chips.current.delete(wordId)
  }, [])

  // ------------------------------------------------------- list callbacks
  const onPlayLine = useCallback((line: DocLine) => playRange(lineStart(line), lineEnd(line)), [playRange])
  const onLoopLine = useCallback((line: DocLine) => loopRange(lineStart(line), lineEnd(line)), [loopRange])
  const onShiftLine = useCallback(
    (lineId: string, delta: number) => edit((d) => shiftTiming(d, lineId, delta, audioDuration())),
    [edit, audioDuration],
  )
  const onMergeNext = useCallback((lineId: string) => edit((d) => mergeWithNext(d, lineId)), [edit])

  // -------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'y') {
        if (typing) return
        dispatch({ type: 'redo' })
        e.preventDefault()
      } else if (e.key === ' ' && !typing && !(e.target as HTMLElement).closest('button')) {
        togglePlay()
        e.preventDefault()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  const selected = useMemo(() => {
    if (!selectedId) return null
    const pos = findWord(doc, selectedId)
    return pos ? { pos, word: doc[pos.line].words[pos.word] } : null
  }, [doc, selectedId])

  // ---------------------------------------------------------------- render
  if (loading || (!initialized && !notFound)) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-white/60">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-xl pt-12">
        <Alert>{t('error.project_not_found')}</Alert>
      </div>
    )
  }
  if (project.status !== 'ready' && project.status !== 'expired') return <Navigate to={`/projects/${id}`} replace />

  const statusTone =
    status === 'saved'
      ? 'text-emerald-300'
      : status === 'conflict' || status === 'error' || status === 'invalid'
        ? 'text-red-300'
        : 'text-white/60'

  const inspector = selected ? (
    <WordInspector
      key={`${selected.word.id}:${selected.word.text}`}
      word={selected.word}
      canSplit={selected.pos.word > 0}
      lyricDir={lyricDir}
      currentTimeMs={nowMs}
      onText={(text) => edit((d) => setWordText(d, selected.word.id, text))}
      onTiming={(s, e) => onTimingChange(selected.word.id, s, e)}
      onInsert={(where, text) => {
        const res = insertWord(docRef.current, selected.word.id, where, text)
        edit(() => res.doc)
        setSelectedId(res.id)
      }}
      onDelete={() => {
        const words = flatWords(docRef.current)
        const i = words.findIndex((w) => w.id === selected.word.id)
        edit((d) => deleteWord(d, selected.word.id))
        setSelectedId(words[i + 1]?.id ?? words[i - 1]?.id ?? null)
      }}
      onSplitLine={() => edit((d) => splitLineAt(d, selected.word.id))}
      onPlay={() => playRange(selected.word.start_ms, selected.word.end_ms)}
      onLoop={() => loopRange(selected.word.start_ms, selected.word.end_ms)}
      onClose={() => setSelectedId(null)}
    />
  ) : null

  return (
    <div className={`pt-4 ${selected ? 'pb-[52vh] sm:pe-80 sm:pb-10 lg:pe-0' : 'pb-10'}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link to={`/projects/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-white/60 hover:text-white">
          <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('project.back')}
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold sm:text-xl" dir="auto">
          {t('editor.title')} · {project.title}
        </h1>
        <span className={`text-xs font-medium ${statusTone}`} role="status" aria-live="polite">
          {t(statusKey[status])}
        </span>
        <div className="flex gap-1">
          <ToolBtn label={t('editor.undo')} disabled={history.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
            <span className="rtl:-scale-x-100">↶</span>
          </ToolBtn>
          <ToolBtn label={t('editor.redo')} disabled={history.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>
            <span className="rtl:-scale-x-100">↷</span>
          </ToolBtn>
          <Link
            to={`/projects/${id}/play`}
            className="grid h-10 place-items-center rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/15"
          >
            {t('editor.preview')}
          </Link>
        </div>
      </div>

      {status === 'conflict' && (
        <div className="mt-3">
          <Alert>
            {t('editor.conflict')}{' '}
            <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>
              {t('editor.reload')}
            </button>
          </Alert>
        </div>
      )}

      {/* Waveform + transport (sticky) */}
      {/* Sticky only on tall screens: on short phones (and in landscape) it would leave no room for the words. */}
      <div className="glass z-20 mt-3 rounded-3xl bg-ink-950/85 p-3 [@media(min-height:700px)]:sticky [@media(min-height:700px)]:top-16">
        {url ? (
          <WaveformTimeline
            url={url}
            doc={doc}
            selectedId={selectedId}
            zoom={zoom}
            onReady={onWaveReady}
            onSelect={select}
            onTimingChange={onTimingChange}
          />
        ) : (
          <p className="py-4 text-center text-sm text-white/50">{storagePath ? <Spinner /> : t('project.audioGone')}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!url}
            aria-label={playing ? t('project.pause') : t('project.play')}
            className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-blue-600 disabled:opacity-50"
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <span ref={timeRef} dir="ltr" className="w-16 font-mono text-sm tabular-nums text-white/70">
            0:00.0
          </span>
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label={t('editor.speed')}
            className="h-10 rounded-xl bg-white/10 px-2 text-base"
          >
            {[0.5, 0.75, 1].map((r) => (
              <option key={r} value={r} className="bg-ink-900">
                {r}×
              </option>
            ))}
          </select>
          {loop && (
            <button
              type="button"
              onClick={() => setLoop(null)}
              className="h-10 rounded-xl bg-fuchsia-500/25 px-3 text-sm font-medium text-fuchsia-100"
            >
              ⟲ {t('editor.looping')} ✕
            </button>
          )}
          <label className="ms-auto flex items-center gap-2 text-xs text-white/60">
            {t('editor.zoom')}
            <input
              type="range"
              min={20}
              max={500}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-violet-400 sm:w-32"
            />
          </label>
          <div className="flex items-center gap-1 text-xs text-white/60">
            <span className="hidden sm:inline">{t('editor.shiftSong')}</span>
            <ToolBtn label={t('editor.shiftSongEarlier')} onClick={() => edit((d) => shiftTiming(d, null, -100, audioDuration()))}>
              −0.1
            </ToolBtn>
            <ToolBtn label={t('editor.shiftSongLater')} onClick={() => edit((d) => shiftTiming(d, null, 100, audioDuration()))}>
              +0.1
            </ToolBtn>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="mb-3 text-xs text-white/50">{t('editor.help')}</p>
          {doc.length === 0 ? (
            <p className="text-white/60">{t('project.noWords')}</p>
          ) : (
            <LinesList
              doc={doc}
              selectedId={selectedId}
              lyricDir={lyricDir}
              registerChip={registerChip}
              onSelect={select}
              onPlayLine={onPlayLine}
              onLoopLine={onLoopLine}
              onShiftLine={onShiftLine}
              onMergeNext={onMergeNext}
            />
          )}
        </div>

        {/* Desktop: side panel. Portrait phones: bottom sheet. Landscape phones / tablets: side drawer. */}
        <aside className="hidden lg:block">
          <div className="glass sticky top-[17rem] rounded-3xl p-4">
            {inspector ?? <p className="text-sm text-white/50">{t('editor.selectHint')}</p>}
          </div>
        </aside>
        {inspector && (
          <div className="fixed inset-x-0 bottom-0 z-40 max-h-[50vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-ink-900/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:end-0 sm:top-16 sm:max-h-none sm:w-80 sm:rounded-none sm:rounded-s-3xl sm:border-t-0 sm:border-s lg:hidden">
            {inspector}
          </div>
        )}
      </div>

      {status === 'invalid' && (
        <div className="mt-4">
          <Alert>{t('editor.status.invalid')}</Alert>
        </div>
      )}
    </div>
  )
}

function ToolBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      dir="ltr"
      className="grid h-10 min-w-10 place-items-center rounded-xl bg-white/10 px-2 text-sm font-medium hover:bg-white/15 disabled:opacity-35"
    >
      {children}
    </button>
  )
}
