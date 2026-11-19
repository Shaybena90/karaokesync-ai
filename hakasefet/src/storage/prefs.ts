/** Simple per-device preferences (localStorage). Game data lives in IndexedDB. */
export type Graphics = 'ultra' | 'high' | 'normal' | '2d'

export interface Prefs {
  sound: boolean
  reducedMotion: boolean
  graphics: Graphics
}

const KEY = 'hakasefet:prefs'
const DEFAULTS: Prefs = { sound: true, reducedMotion: false, graphics: 'high' }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* private mode — keep in memory only */
  }
}
