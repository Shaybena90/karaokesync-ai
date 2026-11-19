import { describe, expect, it } from 'vitest'
import { PACKS, CATEGORIES, LEVELS } from './index'

/**
 * Independent solutions: what a player extracts from each clue, written by
 * hand, and how the board's rule combines them. If a clue or code is edited
 * and they stop agreeing, this test fails.
 */
const FIXTURES: Record<string, { extract: Record<'sports' | 'music' | 'general', string>; mustMention: Record<'sports' | 'music' | 'general', string[]>; assemble: (e: Record<string, string>) => string }> = {
  'm01-diamond': { extract: { music: String(3 + 4), sports: '15'.split('').reverse().join(''), general: String(2 ** 3) }, mustMention: { music: ['3', '4'], sports: ['15'], general: ['לחצי'] }, assemble: (e) => e.music + e.sports + e.general },
  'm02-future': { extract: { general: '2087'.slice(-1), sports: '3', music: '90'.split('').reverse().join('') }, mustMention: { general: ['2087'], sports: ['12', 'רבע'], music: ['90'] }, assemble: (e) => e.general + e.sports + e.music },
  'm03-ticket': { extract: { sports: '4', music: '2', general: String(4 + 2) }, mustMention: { sports: ['4', 'הראשונה', 'האחרונה'], music: ['2', 'השנייה'], general: ['השלישית'] }, assemble: (e) => e.sports + e.music + e.general + e.sports },
  'm04-lost-city': { extract: { sports: String(3 - 3), general: String(25 - 13), music: String(5 + 4) }, mustMention: { sports: ['3:3'], general: ['25', '13'], music: ['5', '4'] }, assemble: (e) => e.sports + e.general + e.music },
  'm05-midnight-train': { extract: { music: '23', general: String(7 - 2), sports: '6' }, mustMention: { music: ['חצות', '24'], general: ['7', '2'], sports: ['12', '6'] }, assemble: (e) => e.music + e.general + e.sports },
  'm06-flute': { extract: { general: '3' + '4', music: String(8 - 3), sports: '1' }, mustMention: { general: ['ג=3', 'ד=4', 'גד'], music: ['8', '3'], sports: ['ראשון'] }, assemble: (e) => e.general + e.music + e.sports },
  'm07-treasure-map': { extract: { sports: '8', music: String(2 + 1), general: '61' }, mustMention: { sports: ['8'], music: ['2', 'פזמון אחד'], general: ['6', '1'] }, assemble: (e) => (e.sports + e.music + e.general).split('').reverse().join('') },
  'm08-orchestra': { extract: { sports: String(3 * 3), general: String(20 + 2), music: String(10 - 3) }, mustMention: { sports: ['3'], general: ['20:00', 'שעתיים'], music: ['10', '3'] }, assemble: (e) => e.sports + e.general + e.music },
  'm09-lab': { extract: { general: '2', music: String(4 * 2), sports: String(8 - 2) + String(2 * 2) }, mustMention: { general: ['זוגי'], music: ['4', '2'], sports: ['השלישית', 'הרביעית'] }, assemble: (e) => e.general + e.music + e.sports },
  'm10-library': { extract: { music: String(3 + 3), sports: '100'.slice(0, 2), general: String(7 - 1) }, mustMention: { music: ['3'], sports: ['100'], general: ['7'] }, assemble: (e) => e.music + e.sports + e.general },
  'm11-satellite': { extract: { general: '0', music: String(2 + 2 + 1), sports: String(3 * 4) }, mustMention: { general: ['3, 2, 1'], music: ['ארוך = 2', 'קצר = 1'], sports: ['3', '4'] }, assemble: (e) => e.general + e.music + e.sports },
  'm12-masquerade': { extract: { music: String(3 + 3), general: '60'.split('').reverse().join(''), sports: '7' }, mustMention: { music: ['1-2-3'], general: ['60', 'האמצעיות'], sports: ['7', 'האחרונה'] }, assemble: (e) => e.music + e.general + e.sports },
  'm13-lost-star': { extract: { sports: String(5 + 4), general: '4' + '7', music: String(1 * 2) }, mustMention: { sports: ['5', '4'], general: ['שורה 4', 'עמודה 7'], music: ['פעמיים'] }, assemble: (e) => e.sports + e.general + e.music },
  'm14-hourglass': { extract: { music: String(9 / 3), general: '50', sports: String(3 + 5 + 0) }, mustMention: { music: ['3', '9'], general: ['50'], sports: ['סכום'] }, assemble: (e) => e.music + e.general + e.sports },
}

for (const pack of Object.values(PACKS)) {
  describe(`content pack ${pack.version}`, () => {
    const active = pack.questions.filter((q) => q.status === 'active')

    it('has at least 90 active questions, 30 per category, split between levels', () => {
      expect(active.length).toBeGreaterThanOrEqual(90)
      for (const c of CATEGORIES) {
        expect(active.filter((q) => q.category === c).length).toBeGreaterThanOrEqual(30)
        for (const l of LEVELS) expect(active.filter((q) => q.category === c && q.level === l).length).toBeGreaterThanOrEqual(10)
      }
    })

    it('every question is well formed', () => {
      const ids = new Set<string>()
      for (const q of pack.questions) {
        expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false)
        ids.add(q.id)
        expect(q.options).toHaveLength(4)
        expect(new Set(q.options.map((o) => o.id)).size).toBe(4)
        expect(new Set(q.options.map((o) => o.text.trim())).size, `duplicate option text in ${q.id}`).toBe(4)
        expect(q.options.filter((o) => o.id === q.answerId), `answer of ${q.id}`).toHaveLength(1)
        expect(q.text.trim().length).toBeGreaterThan(5)
        expect(q.explanation.trim().length).toBeGreaterThan(5)
        expect(q.source.trim().length).toBeGreaterThan(3)
        expect(q.source, 'no invented URLs — only checked sources may carry a link').not.toMatch(/https?:/)
      }
    })

    it(`has at least 14 mysteries with valid 4-digit codes`, () => {
      expect(pack.mysteries.length).toBeGreaterThanOrEqual(14)
      expect(new Set(pack.mysteries.map((m) => m.id)).size).toBe(pack.mysteries.length)
      for (const m of pack.mysteries) {
        expect(m.code, m.id).toMatch(/^\d{4}$/)
        expect(typeof m.code).toBe('string')
        expect([...m.readingOrder].sort()).toEqual([...CATEGORIES].sort())
        expect(m.teaser.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length).toBeLessThanOrEqual(3)
        for (const c of CATEGORIES) expect(m.clues[c].text, `${m.id}/${c} must say how many digits`).toMatch(/ספרה|ספרות/)
        expect(m.explanation).toContain(m.code)
        if (m.next) expect(pack.mysteries.some((x) => x.id === m.next!.mysteryId)).toBe(true)
      }
    })

    it('every mystery is solved by its clue fixtures, and only by its code', () => {
      for (const m of pack.mysteries) {
        const f = FIXTURES[m.id]
        expect(f, `missing fixture for ${m.id}`).toBeDefined()
        expect(f.assemble(f.extract), m.id).toBe(m.code)
        for (const c of CATEGORIES) for (const token of f.mustMention[c]) expect(m.clues[c].text, `${m.id}/${c}`).toContain(token)
      }
    })

    it('has at least one code that starts with zero (kept as a string)', () => {
      expect(pack.mysteries.some((m) => m.code.startsWith('0'))).toBe(true)
    })
  })
}
