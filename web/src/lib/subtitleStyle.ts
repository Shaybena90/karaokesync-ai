/**
 * Subtitle style — mirror of server/karaokesync/styles.py (keep both in sync).
 * The same values drive the in-browser player and the exported video/ASS.
 */
import type { CSSProperties } from 'react'
import { ANIMATED_IDS } from './animatedBackgrounds'

export const FONTS = {
  Heebo: 700,
  Rubik: 700,
  Assistant: 700,
  'Secular One': 400,
  'Varela Round': 400,
  'Frank Ruhl Libre': 700,
  'Alef': 700,
  'Amatic SC': 700,
  'Bellefair': 400,
  'Bona Nova': 700,
  'David Libre': 700,
  'Fredoka': 600,
  'IBM Plex Sans Hebrew': 700,
  'Karantina': 700,
  'Miriam Libre': 700,
  'Noto Sans Hebrew': 700,
  'Noto Serif Hebrew': 700,
  'Playpen Sans Hebrew': 700,
  'Solitreo': 400,
  'Suez One': 400,
  'Tinos': 700,
} as const
export type FontName = keyof typeof FONTS

export type Position = 'top' | 'center' | 'bottom'
export type Animation = 'fill' | 'word' | 'none'
/** How a line comes on screen — same look in the player and in the video (server: styles.py). */
export const ENTRANCES = ['none', 'fade', 'rise', 'drop', 'slide', 'zoom_in', 'zoom_out', 'pop', 'blur', 'swing', 'flip', 'spread', 'wipe'] as const
export type Entrance = (typeof ENTRANCES)[number]
/** What counts down before singing starts (after the intro or a long break) — same in the video. */
export const COUNTDOWNS = ['none', 'dots', 'numbers', 'zoom', 'bar', 'pulse'] as const
export type CountdownDesign = (typeof COUNTDOWNS)[number]
export type PresetName = 'classic' | 'neon' | 'tiktok' | 'custom'

/**
 * A background file shown behind the lyrics, looping, from start_ms to end_ms
 * (null = from the beginning / to the end of the song). Later clips are on top.
 */
export interface BackgroundClip {
  media_id: string
  start_ms: number | null
  end_ms: number | null
}

export const MAX_BACKGROUNDS = 10

export interface SubtitleStyle {
  preset: PresetName
  font: FontName
  size: number // 50..160 (%)
  text_color: string
  highlight_color: string
  outline_color: string
  outline: number // 0..10
  shadow: number // 0..10
  glow: boolean
  position: Position
  text_box: boolean
  background_color: string
  background_color2: string
  animation: Animation
  entrance: Entrance
  countdown: CountdownDesign
  show_next_line: boolean
  backgrounds: BackgroundClip[]
  /** A built-in moving background for the whole song (lib/animatedBackgrounds.ts), or null. */
  animated_background: string | null
}

export const DEFAULT_STYLE: SubtitleStyle = {
  preset: 'classic',
  font: 'Heebo',
  size: 100,
  text_color: '#ffffff',
  highlight_color: '#38bdf8',
  outline_color: '#000000',
  outline: 3,
  shadow: 2,
  glow: false,
  position: 'bottom',
  text_box: false,
  background_color: '#0b1026',
  background_color2: '#3b0764',
  animation: 'fill',
  entrance: 'rise',
  countdown: 'dots',
  show_next_line: true,
  backgrounds: [],
  animated_background: null,
}

export const PRESETS: Record<Exclude<PresetName, 'custom'>, SubtitleStyle> = {
  classic: DEFAULT_STYLE,
  neon: {
    ...DEFAULT_STYLE,
    preset: 'neon',
    entrance: 'blur',
    countdown: 'pulse',
    font: 'Rubik',
    size: 105,
    text_color: '#f5d0fe',
    highlight_color: '#22d3ee',
    outline_color: '#a21caf',
    outline: 2,
    shadow: 0,
    glow: true,
    position: 'center',
    background_color: '#05010d',
    background_color2: '#1e0838',
  },
  tiktok: {
    ...DEFAULT_STYLE,
    preset: 'tiktok',
    entrance: 'pop',
    countdown: 'numbers',
    font: 'Heebo',
    size: 125,
    text_color: '#ffffff',
    highlight_color: '#facc15',
    outline_color: '#000000',
    outline: 6,
    shadow: 0,
    position: 'center',
    background_color: '#111111',
    background_color2: '#111111',
    animation: 'word',
    show_next_line: false,
  },
}

const HEX = /^#[0-9a-fA-F]{6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Keep the valid clips, drop the rest (same rule as the server). */
function normalizeClips(raw: unknown): BackgroundClip[] {
  if (!Array.isArray(raw)) return []
  const ms = (v: unknown) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined)
  const clips: BackgroundClip[] = []
  for (const item of raw.slice(0, MAX_BACKGROUNDS)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const start = ms(r.start_ms)
    const end = ms(r.end_ms)
    if (typeof r.media_id !== 'string' || !UUID.test(r.media_id) || start === undefined || end === undefined) continue
    clips.push({ media_id: r.media_id.toLowerCase(), start_ms: start, end_ms: end })
  }
  return clips
}

/** [start, end) of a clip in song time, or null when it covers nothing. */
export function clipWindow(clip: BackgroundClip, songMs: number): { start: number; end: number } | null {
  const start = clip.start_ms ?? 0
  const end = clip.end_ms === null ? songMs : Math.min(clip.end_ms, songMs)
  return end > start ? { start, end } : null
}

/** Accept whatever is stored in the database and return a complete, valid style. */
export function normalizeStyle(raw: unknown): SubtitleStyle {
  if (!raw || typeof raw !== 'object') return DEFAULT_STYLE
  const r = raw as Record<string, unknown>
  const base = PRESETS[r.preset as keyof typeof PRESETS] ?? DEFAULT_STYLE
  const pick = <K extends keyof SubtitleStyle>(key: K, ok: (v: unknown) => boolean): SubtitleStyle[K] =>
    (ok(r[key]) ? r[key] : base[key]) as SubtitleStyle[K]
  const color = (v: unknown) => typeof v === 'string' && HEX.test(v)
  const int = (min: number, max: number) => (v: unknown) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
  const oneOf = (values: readonly unknown[]) => (v: unknown) => values.includes(v)
  const bool = (v: unknown) => typeof v === 'boolean'
  return {
    preset: pick('preset', oneOf(['classic', 'neon', 'tiktok', 'custom'])),
    font: pick('font', oneOf(Object.keys(FONTS))),
    size: pick('size', int(50, 160)),
    text_color: pick('text_color', color),
    highlight_color: pick('highlight_color', color),
    outline_color: pick('outline_color', color),
    outline: pick('outline', int(0, 10)),
    shadow: pick('shadow', int(0, 10)),
    glow: pick('glow', bool),
    position: pick('position', oneOf(['top', 'center', 'bottom'])),
    text_box: pick('text_box', bool),
    background_color: pick('background_color', color),
    background_color2: pick('background_color2', color),
    animation: pick('animation', oneOf(['fill', 'word', 'none'])),
    entrance: pick('entrance', oneOf(ENTRANCES)),
    countdown: pick('countdown', oneOf(COUNTDOWNS)),
    show_next_line: pick('show_next_line', bool),
    backgrounds: normalizeClips(r.backgrounds),
    animated_background: typeof r.animated_background === 'string' && ANIMATED_IDS.has(r.animated_background)
      ? r.animated_background
      : null,
  }
}

/**
 * CSS variables for the player. Outline/shadow sizes are expressed relative to
 * the font size with the same ratios the video renderer uses, so the preview
 * matches the exported video.
 */
export function styleVars(style: SubtitleStyle): CSSProperties {
  const scale = style.size / 100
  const perEm = (px: number) => `${(px / (48 * scale)).toFixed(4)}em`
  const filters = [
    style.shadow > 0 ? `drop-shadow(${perEm(style.shadow)} ${perEm(style.shadow)} 0 rgb(0 0 0 / 0.45))` : '',
  ].filter(Boolean)
  return {
    '--k-active': style.highlight_color,
    '--k-idle': style.text_color,
    '--k-glow': style.glow ? `${style.highlight_color}cc` : 'transparent',
    '--k-scale': String(scale),
    '--k-stroke': style.text_box ? '0em' : perEm(style.outline * 2),
    // Without an outline the outline layer must disappear completely (no halo).
    '--k-stroke-color': style.text_box || style.outline === 0 ? 'transparent' : style.outline_color,
    '--k-shadow': filters.join(' ') || 'none',
    '--k-font': `"${style.font}", "Heebo", system-ui, sans-serif`,
    '--k-weight': String(FONTS[style.font]),
    '--k-bg': `linear-gradient(135deg, ${style.background_color}, ${style.background_color2})`,
  } as CSSProperties
}
