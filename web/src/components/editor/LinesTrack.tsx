import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import { useI18n } from '../../i18n/I18nProvider'
import { formatDuration } from '../../lib/format'
import { lineEnd, lineStart, type LyricsDoc } from '../../lib/lyricsDoc'

interface Props {
  ws: WaveSurfer | null
  ready: boolean
  doc: LyricsDoc
  /** The line of the chosen word (highlighted). */
  activeLineId: string | null
  lyricDir: 'rtl' | 'ltr' | 'auto'
  onSeek: (ms: number) => void
  onSelectLine: (lineId: string) => void
  /** The whole line moved by `deltaMs` (dragged by its middle or with the arrow keys). */
  onMoveLine: (lineId: string, deltaMs: number) => void
  /** The line stretched or squeezed to new times (dragged by an edge). */
  onScaleLine: (lineId: string, startMs: number, endMs: number) => void
  /** Double click on an empty place: add a sentence there. */
  onAddAt: (ms: number) => void
}

type Drag = { lineId: string; kind: 'move' | 'start' | 'end'; x0: number; start: number; end: number; dx: number }

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]

/**
 * The timeline under the waveform, like in a video editor: a time ruler and one
 * block per line at its place in the song. Drag a block to move the line, drag
 * its edges to make it start or end at another moment (the words keep their
 * proportions), click to choose it, double click an empty place to add a
 * sentence there. It scrolls and zooms together with the waveform above it.
 */
export function LinesTrack({ ws, ready, doc, activeLineId, lyricDir, onSeek, onSelectLine, onMoveLine, onScaleLine, onAddAt }: Props) {
  const { t } = useI18n()
  const [view, setView] = useState({ pps: 100, scroll: 0, width: 0, duration: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const playhead = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view

  // Follow the waveform's zoom and scrolling.
  useEffect(() => {
    if (!ws || !ready) return
    const measure = () => {
      const duration = ws.getDuration()
      const wrapper = ws.getWrapper()
      if (!duration || !wrapper) return
      setView({ pps: wrapper.scrollWidth / duration, scroll: ws.getScroll(), width: wrapper.scrollWidth, duration })
    }
    measure()
    const offs = [
      ws.on('scroll', (_a, _b, left) => setView((v) => ({ ...v, scroll: left }))),
      ws.on('zoom', () => requestAnimationFrame(measure)),
      ws.on('redrawcomplete', measure),
      ws.on('resize', measure),
      ws.on('timeupdate', (sec) => {
        const v = viewRef.current
        if (playhead.current) playhead.current.style.transform = `translateX(${sec * v.pps - v.scroll}px)`
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [ws, ready])

  // The playhead also follows scrolling while paused.
  useEffect(() => {
    if (ws && playhead.current) playhead.current.style.transform = `translateX(${ws.getCurrentTime() * view.pps - view.scroll}px)`
  }, [ws, view])

  const msAt = useCallback((clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const v = viewRef.current
    return Math.max(0, ((clientX - r.left + v.scroll) / v.pps) * 1000)
  }, [])

  const startDrag = (e: ReactPointerEvent, lineId: string, kind: Drag['kind'], start: number, end: number) => {
    e.stopPropagation()
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ lineId, kind, x0: e.clientX, start, end, dx: 0 })
  }
  const moveDrag = (e: ReactPointerEvent) => {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.x0 })
  }
  const endDrag = () => {
    if (!drag) return
    const deltaMs = Math.round((drag.dx / view.pps) * 1000)
    setDrag(null)
    if (Math.abs(drag.dx) < 3) {
      onSelectLine(drag.lineId)
      return
    }
    if (drag.kind === 'move') onMoveLine(drag.lineId, deltaMs)
    else if (drag.kind === 'start') onScaleLine(drag.lineId, drag.start + deltaMs, drag.end)
    else onScaleLine(drag.lineId, drag.start, drag.end + deltaMs)
  }

  const step = STEPS.find((s) => s * view.pps >= 70) ?? 300
  const firstTick = Math.floor(view.scroll / view.pps / step) * step
  const ticks: number[] = []
  for (let s = firstTick; s <= Math.min(view.duration, (view.scroll + 4000) / view.pps); s += step) ticks.push(s)

  return (
    <div
      dir="ltr"
      className="relative mt-1 select-none overflow-hidden rounded-xl border border-white/10 bg-black/25"
      data-testid="lines-track"
      onWheel={(e) => ws && ws.setScroll(ws.getScroll() + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY))}
    >
      {/* Time ruler */}
      <div
        className="relative h-6 cursor-pointer border-b border-white/10 text-[10px] text-white/45"
        onClick={(e) => onSeek(msAt(e.clientX, e.currentTarget))}
        aria-hidden="true"
      >
        {ticks.map((s) => (
          <span key={s} className="absolute top-0 h-full border-l border-white/15 ps-1 leading-6 tabular-nums" style={{ left: s * view.pps - view.scroll }}>
            {formatDuration(s * 1000)}
          </span>
        ))}
      </div>
      {/* Lines */}
      <div
        className="relative h-14"
        role="list"
        aria-label={t('editor.timeline')}
        onClick={(e) => onSeek(msAt(e.clientX, e.currentTarget))}
        onDoubleClick={(e) => onAddAt(msAt(e.clientX, e.currentTarget))}
      >
        {doc.map((line, i) => {
          let start = lineStart(line)
          let end = lineEnd(line)
          if (drag?.lineId === line.id) {
            const d = (drag.dx / view.pps) * 1000
            if (drag.kind !== 'end') start += d
            if (drag.kind !== 'start') end += d
            if (end - start < 80) drag.kind === 'start' ? (start = end - 80) : (end = start + 80)
          }
          const left = (start / 1000) * view.pps - view.scroll
          const width = Math.max(10, ((end - start) / 1000) * view.pps)
          if (left + width < -50 || left > 4000) return null
          const active = line.id === activeLineId
          const text = line.words.map((w) => w.text).join(' ')
          return (
            <div
              key={line.id}
              role="listitem"
              className={`group absolute top-1.5 h-11 touch-none rounded-lg text-xs shadow-md transition-colors ${
                active
                  ? 'bg-gradient-to-br from-fuchsia-500/70 to-violet-600/70 ring-2 ring-fuchsia-200'
                  : i % 2
                    ? 'bg-blue-500/35 hover:bg-blue-500/50'
                    : 'bg-violet-500/35 hover:bg-violet-500/50'
              } ${drag?.lineId === line.id ? 'z-10 opacity-90' : ''}`}
              style={{ left, width }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-grab overflow-hidden rounded-lg px-2.5 text-start active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                aria-label={`${t('editor.timelineLine')} ${i + 1}: ${text} (${formatDuration(start)}–${formatDuration(end)})`}
                onPointerDown={(e) => startDrag(e, line.id, 'move', lineStart(line), lineEnd(line))}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  const big = e.shiftKey ? 1000 : 100
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault()
                    onMoveLine(line.id, e.key === 'ArrowRight' ? big : -big)
                  } else if (e.key === 'Enter') onSelectLine(line.id)
                }}
              >
                <span className="block truncate pt-1 font-semibold leading-4" dir={lyricDir}>
                  {text}
                </span>
                <span className="block truncate text-[10px] leading-4 text-white/60 tabular-nums">
                  {formatDuration(start)}–{formatDuration(end)}
                </span>
              </button>
              {/* Edge handles: start and end of the line */}
              {(['start', 'end'] as const).map((side) => (
                <span
                  key={side}
                  aria-hidden="true"
                  title={t(side === 'start' ? 'editor.timelineStart' : 'editor.timelineEnd')}
                  className={`absolute top-0 z-10 h-full w-2.5 cursor-ew-resize touch-none ${side === 'start' ? 'left-0 rounded-l-lg' : 'right-0 rounded-r-lg'} bg-white/0 group-hover:bg-white/25`}
                  data-edge={side}
                  onPointerDown={(e) => startDrag(e, line.id, side, lineStart(line), lineEnd(line))}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                />
              ))}
            </div>
          )
        })}
      </div>
      <div ref={playhead} aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-fuchsia-300 shadow-[0_0_8px_#f0abfc]" />
    </div>
  )
}
