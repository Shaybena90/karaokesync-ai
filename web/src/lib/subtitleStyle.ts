/**
 * Subtitle style — mirror of server/karaokesync/styles.py (keep both in sync).
 * The same values drive the in-browser player and the exported video/ASS.
 */
import type { CSSProperties } from 'react'

export const FONTS = {
  Heebo: 700,
  Rubik: 700,
  Assistant: 700,
  'Secular One': 400,
  'Varela Round': 400,
  'Frank Ruhl Libre': 700,
} as const
export type FontName = keyof typeof FONTS

export type Position = 'top' | 'center' | 'bottom'
export type Animation = 'fill' | 'word' | 'none'
export type PresetName = 'classic' | 'neon' | 'tiktok' | 'custom'

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
  show_next_line: boolean
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
  show_next_line: true,
}

export const PRESETS: Record<Exclude<PresetName, 'custom'>, SubtitleStyle> = {
  classic: DEFAULT_STYLE,
  neon: {
    ...DEFAULT_STYLE,
    preset: 'neon',
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
    show_next_line: pick('show_next_line', bool),
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
