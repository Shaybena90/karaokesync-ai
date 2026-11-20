import type { CSSProperties } from 'react'
import { isActive } from '../../escape/engine'
import type { Hotspot, RoomDef } from '../../escape/types'
import { ObjectArt, SceneDefs } from './sceneArt'

/**
 * A realistic room: a photo (or a crop of one) with real buttons placed over the
 * objects in it. Objects the photo does not show can be drawn on top (`photoArt`),
 * and any object without a place in the photo is still reachable from the objects list.
 */
export function PhotoScene({ room, sceneId, hotspots, flags, using, dark, reducedMotion, onTap }: { room: RoomDef; sceneId: string; hotspots: Hotspot[]; flags: string[]; using: boolean; dark: boolean; reducedMotion: boolean; onTap: (id: string) => void }) {
  const scene = room.scenes.find((s) => s.id === sceneId)!
  const ph = scene.photo!
  const [W, H] = ph.size
  const [cx, cy, cw, ch] = ph.crop ?? [0, 0, W, H]
  // image placement so that the crop fills the frame
  const img: CSSProperties = { position: 'absolute', width: `${(W / cw) * 100}%`, height: `${(H / ch) * 100}%`, left: `${(-cx / cw) * 100}%`, top: `${(-cy / ch) * 100}%`, maxWidth: 'none' }
  const pct = (r: [number, number, number, number]): CSSProperties => ({ left: `${((r[0] - cx) / cw) * 100}%`, top: `${((r[1] - cy) / ch) * 100}%`, width: `${(r[2] / cw) * 100}%`, height: `${(r[3] / ch) * 100}%` })
  const placed = hotspots.filter((h) => h.photo)
  return (
    <div className="photo-scene relative w-full overflow-hidden rounded-xl bg-ink" style={{ aspectRatio: `${cw} / ${ch}` }} role="group" aria-label={scene.name} data-testid="photo-scene">
      <div className={`absolute inset-0 ${reducedMotion ? '' : 'photo-drift'}`}>
        <img src={`${import.meta.env.BASE_URL}${ph.src}`} alt="" draggable={false} style={img} className="select-none" decoding="async" />
        {placed.filter((h) => h.photoArt).map((h) => (
          <svg key={h.id} className="absolute" style={{ ...pct(h.photo!), filter: 'sepia(.7) saturate(.8) brightness(.92) drop-shadow(0 6px 8px rgba(0,0,0,.6))' }} viewBox={`0 0 ${h.w} ${h.h}`} aria-hidden="true">
            <SceneDefs />
            <ObjectArt art={h.art} w={h.w} h={h.h} active={isActive(h, flags)} variant={h.variant} />
          </svg>
        ))}
      </div>
      {/* warm light, vignette and (until the power is back) darkness */}
      <div className="pointer-events-none absolute inset-0 photo-light" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-1000" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(0,0,0,.25), rgba(0,0,0,.92))', opacity: dark ? 1 : 0 }} aria-hidden="true" />
      {placed.map((h) => (
        <button key={h.id} data-hotspot aria-label={h.name} title={h.name} className={`photo-hotspot absolute ${using ? 'photo-hotspot-using' : ''}`} style={pct(h.photo!)} onClick={() => onTap(h.id)}>
          <span className="photo-hotspot-label">{h.name}</span>
          {isActive(h, flags) && <span className="photo-hotspot-done" aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  )
}
