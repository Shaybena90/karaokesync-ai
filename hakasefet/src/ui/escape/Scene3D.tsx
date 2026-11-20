import { useEffect, useRef, useState } from 'react'
import type { RoomDef } from '../../escape/types'
import { isVisible } from '../../escape/engine'
import type { EscapeSceneHandle, Quality, Rect } from '../three/escape/escapeScene'

/**
 * The 3D room, with a layer of real (invisible) buttons placed exactly over
 * each object — so every object can be tapped, reached with the keyboard and
 * read by screen readers, just like in the 2D view.
 */
export function Scene3D(p: {
  room: RoomDef
  sceneId: string
  flags: string[]
  escaped: boolean
  focusId: string | null
  using: boolean
  quality: Quality
  reducedMotion: boolean
  onTap: (hotspotId: string) => void
  onFail: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<EscapeSceneHandle | null>(null)
  const [rects, setRects] = useState<Record<string, Rect>>({})
  const [ready, setReady] = useState(false)
  const [moving, setMoving] = useState(true)
  const latest = useRef(p)
  latest.current = p

  useEffect(() => {
    let cancelled = false
    const el = ref.current!
    import('../three/escape/escapeScene')
      .then(({ createEscapeScene, webglOk }) => {
        if (cancelled) return
        if (!webglOk()) return latest.current.onFail()
        const h = createEscapeScene(el, p.room, { quality: p.quality, reducedMotion: p.reducedMotion })
        handle.current = h
        h.onSettle(() => {
          setRects(h.rects())
          setMoving(false)
        })
        h.update({ flags: latest.current.flags, escaped: latest.current.escaped })
        h.setScene(latest.current.sceneId)
        setReady(true)
        window.setTimeout(() => !cancelled && (setRects(h.rects()), setMoving(false)), 120)
      })
      .catch(() => !cancelled && latest.current.onFail())
    return () => {
      cancelled = true
      handle.current?.dispose()
      handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.room.id, p.quality, p.reducedMotion])

  useEffect(() => {
    handle.current?.update({ flags: p.flags, escaped: p.escaped })
  }, [p.flags, p.escaped, ready])

  useEffect(() => {
    if (!handle.current) return
    setMoving(true)
    handle.current.setScene(p.sceneId)
  }, [p.sceneId, ready])

  useEffect(() => {
    if (!handle.current) return
    setMoving(true)
    handle.current.focus(p.focusId)
  }, [p.focusId, ready])

  const scene = p.room.scenes.find((s) => s.id === p.sceneId)!
  const hotspots = p.room.hotspots.filter((h) => h.scene === p.sceneId && isVisible(h, p.flags))
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink" role="group" aria-label={scene.name}>
      <div ref={ref} className="absolute inset-0" data-testid="scene-3d" data-ready={ready} />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-mist" role="status">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
            בונים את החדר בתלת־ממד…
          </div>
        </div>
      )}
      <div className={`absolute inset-0 transition-opacity duration-300 ${moving || p.escaped ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
        {hotspots.map((h) => {
          const r = rects[h.id]
          if (!r || r.w < 2 || r.h < 2) return null
          return (
            <button
              key={h.id}
              data-hotspot
              aria-label={h.name}
              title={h.name}
              className={`hotspot3d absolute ${p.using ? 'hotspot3d-using' : ''}`}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onClick={() => p.onTap(h.id)}
            >
              <span className="hotspot3d-label">{h.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
