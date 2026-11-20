import type { Hotspot, Interaction } from '../../types'

/**
 * Helpers for the escape collection. Phone apps and the evidence board list
 * their objects instead of placing them in a scene, so position is nominal.
 */
export function doc(id: string, scene: string, name: string, icon: string, subtitle: string, interactions: Interaction[], extra: Partial<Hotspot> = {}): Hotspot {
  return { id, scene, name, art: 'card', x: 0, y: 0, w: 120, h: 160, icon, subtitle, interactions, ...extra }
}
