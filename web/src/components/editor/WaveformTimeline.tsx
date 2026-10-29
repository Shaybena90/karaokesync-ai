import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { LyricsDoc } from '../../lib/lyricsDoc'
import { Spinner } from '../ui'

interface Props {
  url: string
  doc: LyricsDoc
  selectedId: string | null
  zoom: number
  onReady: (ws: WaveSurfer | null) => void
  onSelect: (wordId: string) => void
  onTimingChange: (wordId: string, startMs: number, endMs: number) => void
}

type RegionsApi = ReturnType<typeof RegionsPlugin.create>

const COLORS = ['rgba(168, 85, 247, 0.22)', 'rgba(59, 130, 246, 0.22)']
const SELECTED = 'rgba(232, 121, 249, 0.5)'

/**
 * Waveform of the song with one draggable / resizable region per word.
 * Dragging a region (or its edges) changes the word's timing.
 */
export function WaveformTimeline({ url, doc, selectedId, zoom, onReady, onSelect, onTimingChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsApi | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Latest callbacks without re-creating wavesurfer.
  const callbacks = useRef({ onSelect, onTimingChange, onReady })
  useLayoutEffect(() => {
    callbacks.current = { onSelect, onTimingChange, onReady }
  })
  const initialZoom = useRef(zoom)

  useEffect(() => {
    if (!container.current) return
    setReady(false)
    setFailed(false)
    const ws = WaveSurfer.create({
      container: container.current,
      url,
      height: 88,
      waveColor: 'rgba(255,255,255,0.28)',
      progressColor: 'rgba(168,85,247,0.9)',
      cursorColor: '#f0abfc',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      minPxPerSec: initialZoom.current,
      autoScroll: true,
      autoCenter: false,
      dragToSeek: false,
    })
    const regions = ws.registerPlugin(RegionsPlugin.create())
    regions.on('region-updated', (r: Region) => callbacks.current.onTimingChange(r.id, r.start * 1000, r.end * 1000))
    regions.on('region-clicked', (r: Region, e: MouseEvent) => {
      e.stopPropagation()
      callbacks.current.onSelect(r.id)
    })
    ws.on('ready', () => {
      setReady(true)
      callbacks.current.onReady(ws)
    })
    ws.on('error', () => setFailed(true))
    wsRef.current = ws
    regionsRef.current = regions
    return () => {
      callbacks.current.onReady(null)
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
    }
  }, [url])

  useEffect(() => {
    if (ready) wsRef.current?.zoom(zoom)
  }, [zoom, ready])

  // Keep regions in sync with the document (add / update / remove by word id).
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !ready) return
    const existing = new Map(regions.getRegions().map((r) => [r.id, r]))
    doc.forEach((line, li) => {
      for (const w of line.words) {
        const start = w.start_ms / 1000
        const end = Math.max(w.end_ms, w.start_ms + 1) / 1000
        const color = w.id === selectedId ? SELECTED : COLORS[li % 2]
        const region = existing.get(w.id)
        if (region) {
          existing.delete(w.id)
          const textChanged = region.content?.textContent !== w.text
          if (Math.abs(region.start - start) > 0.0005 || Math.abs(region.end - end) > 0.0005 || textChanged) {
            region.setOptions({ start, end, ...(textChanged ? { content: w.text } : {}) })
          }
          region.setOptions({ color })
        } else {
          regions.addRegion({ id: w.id, start, end, content: w.text, color, drag: true, resize: true, minLength: 0.02 })
        }
      }
    })
    for (const stale of existing.values()) stale.remove()
  }, [doc, selectedId, ready])

  // Bring the selected word into view.
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || !ready || !selectedId) return
    const r = regionsRef.current?.getRegions().find((x) => x.id === selectedId)
    if (!r) return
    const scroll = ws.getScroll()
    const width = container.current?.clientWidth ?? 0
    const px = r.start * zoom
    if (px < scroll || px > scroll + width - 40) ws.setScrollTime(Math.max(0, r.start - 1))
  }, [selectedId, ready, zoom])

  return (
    <div className="relative" dir="ltr">
      <div ref={container} className="ks-waveform min-h-[88px] w-full touch-pan-x" />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-white/50">
          <Spinner />
        </div>
      )}
    </div>
  )
}
