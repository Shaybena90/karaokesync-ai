import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { isActive } from '../../escape/engine'
import type { Hotspot } from '../../escape/types'
import { ObjectArt, SceneDefs } from './sceneArt'

type Rect = [number, number, number, number]
export interface TourSpot {
  id: string
  name: string
  rect: Rect
  hotspot?: Hotspot
  done?: boolean
}

/**
 * A virtual tour of a realistic room image: drag to look around, pinch / wheel /
 * buttons to zoom, a gentle 3D tilt that follows the pointer, and a camera that
 * flies to an object before it opens. Viewpoints (`view`) frame part of the image.
 * Every object is a real button (keyboard, screen readers, tests).
 */
export function TourView(p: {
  src: string
  size: [number, number]
  view?: Rect
  spots: TourSpot[]
  flags: string[]
  label: string
  using?: boolean
  dark?: boolean
  reducedMotion: boolean
  /** Called after the camera reached the object (immediately with reduced motion or while using an item). */
  onTap: (id: string) => void
  /** An object whose dialog is open: the camera stays on it. */
  focusId?: string | null
}) {
  const [W, H] = p.size
  const box = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [cam, setCam] = useState({ x: W / 2, y: H / 2, s: 0.1 })
  const [anim, setAnim] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hint, setHint] = useState(true)
  const drag = useRef<{ id: number; x: number; y: number; moved: number } | null>(null)
  const pinch = useRef(new Map<number, { x: number; y: number }>())
  const pinchDist = useRef(0)
  const flying = useRef<number>(0)

  // the smallest scale that still covers the frame, and the largest zoom
  const minS = vp.w ? Math.max(vp.w / W, vp.h / H) : 0.1
  const maxS = minS * 4
  const clamp = (c: { x: number; y: number; s: number }) => {
    const s = Math.min(maxS, Math.max(minS, c.s))
    const hw = vp.w / 2 / s
    const hh = vp.h / 2 / s
    return { s, x: Math.min(W - hw, Math.max(hw, c.x)), y: Math.min(H - hh, Math.max(hh, c.y)) }
  }
  const frame = (r: Rect, margin = 1) => clamp({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, s: Math.min(vp.w / (r[2] * margin), vp.h / (r[3] * margin)) })
  const go = (c: { x: number; y: number; s: number }, animate = true) => {
    setAnim(animate && !p.reducedMotion)
    setCam(clamp(c))
  }

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setVp((v) => (Math.abs(v.w - el.clientWidth) > 1 || Math.abs(v.h - el.clientHeight) > 1 ? { w: el.clientWidth, h: el.clientHeight } : v)))
    ro.observe(el)
    setVp({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // move to the current viewpoint (and back to it when a dialog closes)
  const viewKey = (p.view ?? [0, 0, W, H]).join(',')
  const lastView = useRef('')
  useEffect(() => {
    if (!vp.w || p.focusId) return
    // a new viewpoint glides there; a resize just re-frames in place
    const moved = lastView.current !== viewKey
    lastView.current = viewKey
    go(frame(p.view ?? [0, 0, W, H]), moved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, vp.w, vp.h, p.focusId])

  useEffect(() => () => window.clearTimeout(flying.current), [])

  function tap(s: TourSpot) {
    setHint(false)
    if (p.using || p.reducedMotion) return p.onTap(s.id)
    go(frame(s.rect, 1.9))
    window.clearTimeout(flying.current)
    flying.current = window.setTimeout(() => p.onTap(s.id), 520)
  }

  const zoomBy = (k: number, at?: { x: number; y: number }) => {
    const ax = at?.x ?? vp.w / 2
    const ay = at?.y ?? vp.h / 2
    // keep the image point under the pointer where it is
    const ix = cam.x + (ax - vp.w / 2) / cam.s
    const iy = cam.y + (ay - vp.h / 2) / cam.s
    const s = Math.min(maxS, Math.max(minS, cam.s * k))
    go({ s, x: ix - (ax - vp.w / 2) / s, y: iy - (ay - vp.h / 2) / s }, false)
  }

  const world: CSSProperties = {
    width: W,
    height: H,
    transformOrigin: '0 0',
    transform: `translate(${vp.w / 2 - cam.x * cam.s}px, ${vp.h / 2 - cam.y * cam.s}px) scale(${cam.s})`,
    transition: anim ? 'transform 1.1s cubic-bezier(.25,.8,.25,1)' : 'none',
    ['--inv' as string]: String(1 / cam.s),
  }
  const depth: CSSProperties = p.reducedMotion ? {} : { transform: `perspective(1400px) rotateY(${tilt.x * 3}deg) rotateX(${-tilt.y * 2}deg) scale(1.035)`, transition: 'transform .6s ease-out' }

  return (
    <div className="relative">
      <div
        ref={box}
        className="tour relative w-full touch-none select-none overflow-hidden rounded-xl bg-black"
        role="group"
        aria-label={`${p.label} — אפשר לגרור כדי להסתכל מסביב`}
        data-testid="photo-scene"
        onPointerDown={(e) => {
          pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current.size === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }
        }}
        onPointerMove={(e) => {
          const r = box.current!.getBoundingClientRect()
          // the room holds still while the pointer is on an object, so it is easy to hit
          const onObject = (e.target as HTMLElement).closest?.('[data-hotspot], .tour-btn')
          if (!onObject && e.pointerType === 'mouse') setTilt({ x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 })
          if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current.size === 2) {
            const [a, b] = [...pinch.current.values()]
            const d = Math.hypot(a.x - b.x, a.y - b.y)
            if (pinchDist.current) zoomBy(d / pinchDist.current, { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top })
            pinchDist.current = d
            return
          }
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          d.moved += Math.abs(dx) + Math.abs(dy)
          d.x = e.clientX
          d.y = e.clientY
          if (d.moved > 6) {
            if (!box.current!.hasPointerCapture(e.pointerId)) box.current!.setPointerCapture(e.pointerId)
            setHint(false)
            go({ ...cam, x: cam.x - dx / cam.s, y: cam.y - dy / cam.s }, false)
          }
        }}
        onPointerUp={(e) => {
          pinch.current.delete(e.pointerId)
          if (pinch.current.size < 2) pinchDist.current = 0
          drag.current = null
        }}
        onPointerCancel={(e) => {
          pinch.current.delete(e.pointerId)
          drag.current = null
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        onWheel={(e) => {
          const r = box.current!.getBoundingClientRect()
          zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, { x: e.clientX - r.left, y: e.clientY - r.top })
        }}
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        <div className="absolute inset-0" style={depth}>
          <div className="absolute left-0 top-0" style={world}>
            <img src={`${import.meta.env.BASE_URL}${p.src}`} alt="" draggable={false} width={W} height={H} className="pointer-events-none absolute inset-0 max-w-none" decoding="async" />
            {p.spots.filter((s) => s.hotspot?.photoArt).map((s) => (
              <svg key={`art-${s.id}`} className="pointer-events-none absolute" style={{ left: s.rect[0], top: s.rect[1], width: s.rect[2], height: s.rect[3], filter: 'sepia(.6) saturate(.85) brightness(.9) drop-shadow(0 6px 8px rgba(0,0,0,.6))' }} viewBox={`0 0 ${s.hotspot!.w} ${s.hotspot!.h}`} aria-hidden="true">
                <SceneDefs />
                <ObjectArt art={s.hotspot!.art} w={s.hotspot!.w} h={s.hotspot!.h} active={isActive(s.hotspot!, p.flags)} variant={s.hotspot!.variant} />
              </svg>
            ))}
            <div className="tour-dust pointer-events-none absolute inset-0" aria-hidden="true" />
            {p.spots.map((s) => (
              <button
                key={s.id}
                data-hotspot
                aria-label={s.name}
                title={s.name}
                className={`photo-hotspot absolute ${p.using ? 'photo-hotspot-using' : ''} ${p.focusId === s.id ? 'photo-hotspot-focus' : ''}`}
                style={{ left: s.rect[0], top: s.rect[1], width: s.rect[2], height: s.rect[3] }}
                onClick={(e) => {
                  e.stopPropagation()
                  tap(s)
                }}
                // keyboard users: bring the focused object into view (not on a mouse / touch press)
                onFocus={(e) => !p.focusId && e.currentTarget.matches(':focus-visible') && go(frame(s.rect, 2.4))}
              >
                <span className="photo-hotspot-label">{s.name}</span>
                {s.done && <span className="photo-hotspot-done" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 photo-light" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-1000" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(0,0,0,.25), rgba(0,0,0,.92))', opacity: p.dark ? 1 : 0 }} aria-hidden="true" />
        {hint && <p className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-gold-2 backdrop-blur" aria-hidden="true">👆 גררו להסתכל מסביב · צביטה או גלגלת לזום</p>}

      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-bold text-mist">👁 {p.label}</p>
        <div className="flex gap-1.5">
          <button type="button" className="tour-btn" onClick={() => zoomBy(1.4)} aria-label="התקרבות">＋</button>
          <button type="button" className="tour-btn" onClick={() => zoomBy(1 / 1.4)} aria-label="התרחקות">－</button>
          <button type="button" className="tour-btn" onClick={() => go(frame(p.view ?? [0, 0, W, H]))} aria-label="חזרה לנקודת המבט">⟲</button>
        </div>
      </div>
    </div>
  )
}
