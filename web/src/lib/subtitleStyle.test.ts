import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, PRESETS, normalizeStyle, styleVars } from './subtitleStyle'

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
