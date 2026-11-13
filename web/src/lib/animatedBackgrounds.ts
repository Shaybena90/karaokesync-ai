/**
 * Built-in moving backgrounds — mirror of server/karaokesync/animated_backgrounds.py
 * (a server test checks the lists match). Each one is a short clip that loops
 * seamlessly, drawn from the same FFmpeg recipe the video export uses.
 * Files: public/backgrounds/<id>.mp4 (the clip) and <id>.jpg (a small picture).
 */
export interface AnimatedBackground {
  id: string
  he: string
  en: string
  /** Length of one loop. */
  seconds: number
}

export const ANIMATED_BACKGROUNDS: readonly AnimatedBackground[] = [
  { id: 'sunset', he: "שקיעה", en: 'Sunset', seconds: 20 },
  { id: 'ocean', he: "אוקיינוס", en: 'Ocean', seconds: 20 },
  { id: 'aurora', he: "זוהר צפוני", en: 'Northern lights', seconds: 10 },
  { id: 'neon-night', he: "לילה ניאון", en: 'Neon night', seconds: 20 },
  { id: 'candy', he: "סוכריה", en: 'Candy', seconds: 20 },
  { id: 'forest', he: "יער", en: 'Forest', seconds: 20 },
  { id: 'fire', he: "אש", en: 'Fire', seconds: 10 },
  { id: 'royal', he: "מלכותי", en: 'Royal', seconds: 20 },
  { id: 'mint', he: "מנטה", en: 'Mint', seconds: 20 },
  { id: 'peach', he: "אפרסק", en: 'Peach', seconds: 20 },
  { id: 'galaxy', he: "גלקסיה", en: 'Galaxy', seconds: 10 },
  { id: 'rainbow-spiral', he: "ספירלת קשת", en: 'Rainbow spiral', seconds: 10 },
  { id: 'gold', he: "זהב", en: 'Gold', seconds: 10 },
  { id: 'ice', he: "קרח", en: 'Ice', seconds: 10 },
  { id: 'berry', he: "פירות יער", en: 'Berry', seconds: 20 },
  { id: 'plasma', he: "פלזמה", en: 'Plasma', seconds: 10 },
  { id: 'pulse-rings', he: "טבעות דופק", en: 'Pulse rings', seconds: 10 },
  { id: 'tunnel', he: "מנהרה", en: 'Tunnel', seconds: 10 },
  { id: 'kaleidoscope', he: "קליידוסקופ", en: 'Kaleidoscope', seconds: 10 },
  { id: 'starry-night', he: "לילה זרוע כוכבים", en: 'Starry night', seconds: 10 },
  { id: 'synthwave', he: "סינת'ווייב", en: 'Synthwave', seconds: 10 },
  { id: 'bokeh', he: "אורות בוקה", en: 'Bokeh lights', seconds: 10 },
  { id: 'sea-waves', he: "גלי ים", en: 'Sea waves', seconds: 10 },
  { id: 'lava-lamp', he: "מנורת לבה", en: 'Lava lamp', seconds: 10 },
  { id: 'disco', he: "דיסקו", en: 'Disco', seconds: 10 },
  { id: 'equalizer', he: "אקולייזר", en: 'Equalizer', seconds: 10 },
  { id: 'heartbeat', he: "פעימות לב", en: 'Heartbeat', seconds: 10 },
  { id: 'digital-rain', he: "גשם דיגיטלי", en: 'Digital rain', seconds: 10 },
  { id: 'silk', he: "משי", en: 'Silk', seconds: 10 },
  { id: 'midnight', he: "חצות", en: 'Midnight', seconds: 20 },
]

export const ANIMATED_IDS: ReadonlySet<string> = new Set(ANIMATED_BACKGROUNDS.map((b) => b.id))

export const animatedClipUrl = (id: string) => `/backgrounds/${id}.mp4`
export const animatedThumbUrl = (id: string) => `/backgrounds/${id}.jpg`
