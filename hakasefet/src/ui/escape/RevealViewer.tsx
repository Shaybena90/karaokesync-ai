import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hotspot, RevealTool } from '../../escape/types'
import { play } from '../audio'
import { ObjectArt, SceneDefs } from './sceneArt'

/**
 * Sweep a tool over a document to find hidden writing:
 *  uv        — a violet UV lens; invisible ink glows only inside it
 *  magnifier — a zoom lens; tiny engraving becomes readable only inside it
 *  light     — a beam of light in a dark room
 * Holding the lens over the hidden spot for a moment reveals it for good.
 * Works with a finger, a mouse, or the arrow keys.
 */
const TOOL: Record<RevealTool, { name: string; ring: string; icon: string }> = {
  uv: { name: 'פנס UV', ring: '#b45cff', icon: '🔦' },
  magnifier: { name: 'זכוכית מגדלת', ring: '#f2c14e', icon: '🔍' },
  light: { name: 'אור המנורה', ring: '#ffe08a', icon: '💡' },
}

export function RevealViewer({ hotspot, tool, hidden, at = { x: 50, y: 60 }, onFound }: { hotspot: Hotspot; tool: RevealTool; hidden: string; at?: { x: number; y: number }; onFound: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 18, y: 18 })
  const [found, setFound] = useState(false)
  const [boxW, setBoxW] = useState(300)
  const holdSince = useRef<number | null>(null)
  // the game re-renders often (its timer); keep the latest callback without restarting the hold timer
  const onFoundRef = useRef(onFound)
  onFoundRef.current = onFound
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 300))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const R = tool === 'light' ? 22 : 16 // lens radius, % of the width

  const near = useCallback(
    (p: { x: number; y: number }) => {
      const el = box.current
      const aspect = el ? el.clientHeight / el.clientWidth : 1
      const dx = p.x - at.x
      const dy = (p.y - at.y) * aspect
      return Math.hypot(dx, dy) < R * 0.55
    },
    [at.x, at.y, R],
  )

  useEffect(() => {
    if (found) return
    if (!near(pos)) {
      holdSince.current = null
      return
    }
    holdSince.current ??= performance.now()
    const t = window.setTimeout(() => {
      setFound(true)
      play('clue')
      onFoundRef.current()
    }, 550)
    return () => window.clearTimeout(t)
  }, [pos, near, found])

  const move = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect()
    setPos({ x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)) })
  }

  const t = TOOL[tool]
  const rPx = (R / 100) * boxW
  const mask = `radial-gradient(circle ${rPx}px at ${pos.x}% ${pos.y}%, #000 55%, transparent 100%)`
  const lensStyle = { left: `${pos.x}%`, top: `${pos.y}%`, width: `${R * 2}%`, borderColor: t.ring, boxShadow: `0 0 24px ${t.ring}, inset 0 0 30px ${t.ring}55` }
  return (
    <div>
      <p className="mb-2 text-sm text-mist">
        {t.icon} {found ? 'נמצא!' : `העבירו את ה${t.name} על הדף ${tool === 'magnifier' ? '— חפשו כתב זעיר' : '— חפשו כתב נסתר'}. אפשר גם עם החיצים במקלדת.`}
      </p>
      <div
        ref={box}
        className={`reveal-box reveal-${tool} ${found ? 'is-found' : ''}`}
        style={{ aspectRatio: `${hotspot.w} / ${hotspot.h}` }}
        tabIndex={0}
        role="application"
        aria-label={`${t.name} על ${hotspot.name}. הזיזו את העדשה כדי לחפש כתב נסתר.`}
        data-testid="reveal"
        onPointerMove={(e) => move(e.clientX, e.clientY)}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          move(e.clientX, e.clientY)
        }}
        onKeyDown={(e) => {
          const d = 4
          const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }
          if (k[e.key]) {
            e.preventDefault()
            setPos((p) => ({ x: Math.min(100, Math.max(0, p.x + k[e.key][0])), y: Math.min(100, Math.max(0, p.y + k[e.key][1])) }))
          }
        }}
      >
        <svg viewBox={`-8 -8 ${hotspot.w + 16} ${hotspot.h + 16}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <SceneDefs />
          <ObjectArt art={hotspot.art} w={hotspot.w} h={hotspot.h} active={false} variant={hotspot.variant} />
        </svg>
        {tool === 'light' && !found && <div className="reveal-dark" style={{ WebkitMaskImage: `radial-gradient(circle ${rPx * 1.2}px at ${pos.x}% ${pos.y}%, transparent 45%, #000 100%)`, maskImage: `radial-gradient(circle ${rPx * 1.2}px at ${pos.x}% ${pos.y}%, transparent 45%, #000 100%)` }} />}
        {tool === 'uv' && !found && <div className="reveal-uvtint" style={{ WebkitMaskImage: mask, maskImage: mask }} />}
        <div className="reveal-hidden" aria-hidden={!found} style={found ? undefined : { WebkitMaskImage: mask, maskImage: mask }}>
          <span className={`reveal-text reveal-text-${tool}`} style={{ left: `${at.x}%`, top: `${at.y}%` }}>
            {hidden}
          </span>
        </div>
        {!found && <span className="reveal-lens" style={lensStyle} aria-hidden="true" />}
      </div>
    </div>
  )
}
