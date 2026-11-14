import { describe, expect, it } from 'vitest'
import { ANIMATED_BACKGROUNDS, animatedClipUrl } from './animatedBackgrounds'
import { COUNTDOWNS, DEFAULT_STYLE, ENTRANCES, FONTS, PRESETS, clipWindow, normalizeStyle, styleVars, text3dShadow } from './subtitleStyle'

describe('subtitle style', () => {
  it('falls back to defaults / preset values for invalid input', () => {
    expect(normalizeStyle(null)).toEqual(DEFAULT_STYLE)
    expect(normalizeStyle({ preset: 'neon' })).toEqual(PRESETS.neon)
    const s = normalizeStyle({ preset: 'tiktok', size: 9999, text_color: 'red', font: 'Comic Sans', outline: 2, glow: 'yes' })
    expect(s.size).toBe(PRESETS.tiktok.size)
    expect(s.text_color).toBe('#ffffff')
    expect(s.font).toBe('Heebo')
    expect(s.outline).toBe(2)
    expect(s.glow).toBe(false)
  })

  it('matches the server presets', () => {
    // Same values as server/karaokesync/styles.py
    expect(PRESETS.tiktok).toMatchObject({ animation: 'word', show_next_line: false, highlight_color: '#facc15', size: 125 })
    expect(PRESETS.neon).toMatchObject({ glow: true, font: 'Rubik', highlight_color: '#22d3ee', position: 'center' })
  })

  it('produces CSS variables proportional to the font size', () => {
    const vars = styleVars({ ...DEFAULT_STYLE, outline: 3, size: 100 }) as Record<string, string>
    expect(vars['--k-stroke']).toBe('0.1250em') // 2 × 3px at a 48px base
    expect(vars['--k-active']).toBe(DEFAULT_STYLE.highlight_color)
    expect((styleVars({ ...DEFAULT_STYLE, text_box: true }) as Record<string, string>)['--k-stroke']).toBe('0em')
  })
})

describe('background clips', () => {
  const id = '0b4f8f5e-3c1d-4b8a-9e2f-123456789abc'
  it('keeps valid clips and drops broken ones (same rule as the server)', () => {
    const s = normalizeStyle({ preset: 'neon', backgrounds: [{ media_id: id, start_ms: 1000, end_ms: 5000 }, { media_id: 'bad' }, 'x', { media_id: id, start_ms: -5, end_ms: null }] })
    expect(s.backgrounds).toEqual([{ media_id: id, start_ms: 1000, end_ms: 5000 }])
    expect(normalizeStyle({ backgrounds: 'nope' }).backgrounds).toEqual([])
    expect(normalizeStyle({ backgrounds: [{ media_id: id }] }).backgrounds).toEqual([{ media_id: id, start_ms: null, end_ms: null }])
  })

  it('works out when a clip is visible', () => {
    expect(clipWindow({ media_id: id, start_ms: null, end_ms: null }, 60_000)).toEqual({ start: 0, end: 60_000 })
    expect(clipWindow({ media_id: id, start_ms: 10_000, end_ms: 90_000 }, 60_000)).toEqual({ start: 10_000, end: 60_000 })
    expect(clipWindow({ media_id: id, start_ms: 70_000, end_ms: null }, 60_000)).toBeNull()
  })
})

describe('fonts and entrance effects', () => {
  it('has many Hebrew fonts and at least ten effects, same as the server', () => {
    expect(Object.keys(FONTS).length).toBeGreaterThanOrEqual(20)
    expect(FONTS.Alef).toBe(700)
    expect(ENTRANCES.filter((e) => e !== 'none').length).toBeGreaterThanOrEqual(10)
    // Same values as server/karaokesync/styles.py
    expect(PRESETS.neon.entrance).toBe('blur')
    expect(PRESETS.tiktok.entrance).toBe('pop')
    expect(DEFAULT_STYLE.entrance).toBe('rise')
  })

  it('keeps a known effect and font, falls back otherwise', () => {
    expect(normalizeStyle({ entrance: 'wipe', font: 'Suez One' })).toMatchObject({ entrance: 'wipe', font: 'Suez One' })
    expect(normalizeStyle({ preset: 'tiktok', entrance: 'explode' }).entrance).toBe('pop')
  })
})

describe('countdown designs', () => {
  it('has five designs plus none, same as the server', () => {
    expect(COUNTDOWNS.filter((c) => c !== 'none').length).toBeGreaterThanOrEqual(5)
    expect(DEFAULT_STYLE.countdown).toBe('dots')
    expect(PRESETS.tiktok.countdown).toBe('numbers')
    expect(PRESETS.neon.countdown).toBe('pulse')
    expect(normalizeStyle({ countdown: 'bar' }).countdown).toBe('bar')
    expect(normalizeStyle({ countdown: 'fireworks' }).countdown).toBe('dots')
  })
})

describe('built-in animated backgrounds', () => {
  it('has 30 classic and 23 in 3D, each with a clip and a picture', () => {
    expect(ANIMATED_BACKGROUNDS.filter((b) => b.kind !== '3d')).toHaveLength(30)
    expect(ANIMATED_BACKGROUNDS.filter((b) => b.kind === '3d')).toHaveLength(23)
    expect(new Set(ANIMATED_BACKGROUNDS.map((b) => b.id)).size).toBe(53)
    expect(animatedClipUrl('aurora')).toBe('/backgrounds/aurora.mp4')
    expect(DEFAULT_STYLE.animated_background).toBeNull()
  })

  it('keeps a known background, drops anything else', () => {
    expect(normalizeStyle({ animated_background: 'galaxy' }).animated_background).toBe('galaxy')
    expect(normalizeStyle({ animated_background: '../../etc' }).animated_background).toBeNull()
    expect(normalizeStyle({ animated_background: 5 }).animated_background).toBeNull()
  })
})

describe('3D lettering', () => {
  it('extrudes the letters in the depth colour, darker towards the back', () => {
    expect(text3dShadow('none', '#7c3aed')).toBe('none')
    const parts = text3dShadow('deep', '#808080').split(', ')
    expect(parts).toHaveLength(16 + 1) // 16 copies and a soft shadow
    expect(parts[0]).toBe('0.000em 0.010em 0 #7c7c7c')
    expect(parts[15]).toBe('0.000em 0.160em 0 #3a3a3a')
    expect(parts[16]).toContain('rgb(0 0 0')
  })

  it('is off by default and keeps only known kinds', () => {
    expect(DEFAULT_STYLE.text_3d).toBe('none')
    expect(normalizeStyle({ text_3d: 'retro', depth_color: '#112233' })).toMatchObject({ text_3d: 'retro', depth_color: '#112233' })
    expect(normalizeStyle({ text_3d: 'spin', depth_color: 'red' })).toMatchObject({ text_3d: 'none', depth_color: '#7c3aed' })
    expect((styleVars({ ...DEFAULT_STYLE, text_3d: 'block' }) as Record<string, string>)['--k-3d']).toContain('em')
  })
})
