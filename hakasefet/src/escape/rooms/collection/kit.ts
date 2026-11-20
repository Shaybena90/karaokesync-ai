import type { Hotspot, Interaction } from '../../types'

/**
 * Helpers for the escape collection. Phone apps and the evidence board list
 * their objects instead of placing them in a scene, so position is nominal.
 */
export function doc(id: string, scene: string, name: string, icon: string, subtitle: string, interactions: Interaction[], extra: Partial<Hotspot> = {}): Hotspot {
  return { id, scene, name, art: 'card', x: 0, y: 0, w: 120, h: 160, icon, subtitle, interactions, ...extra }
}

type Rect = [number, number, number, number]
/**
 * Puts a room's objects on its realistic image: `places` maps hotspot id →
 * [x, y, w, h] in the image's pixels; `art` lists objects the image does not
 * show, drawn on top of it at that place.
 */
export function placeOnPhoto(hotspots: Hotspot[], places: Record<string, Rect>, art: string[] = []): void {
  for (const h of hotspots) {
    if (places[h.id]) h.photo = places[h.id]
    if (art.includes(h.id)) h.photoArt = true
  }
}
