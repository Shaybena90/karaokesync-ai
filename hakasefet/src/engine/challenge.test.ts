import { describe, expect, it } from 'vitest'
import { packV1 } from '../content/v1'
import { challengeUrl, parseChallenge } from './challenge'
import { mysteryForDate, planQuestions } from './selection'
import { shareText } from './share'

const today = '2026-11-19'

describe('challenge links', () => {
  const c = { version: packV1.version, date: today, level: 'hard' as const, order: ['music', 'sports', 'general'] as const }
  const url = challengeUrl({ ...c, order: [...c.order] }, 'https://example.org/')

  it('round-trips and recreates the same questions', () => {
    const params = new URLSearchParams(url.split('?')[1])
    const r = parseChallenge(params, today)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.challenge).toEqual({ ...c, order: [...c.order] })
    const m = mysteryForDate(packV1, r.challenge.date)
    expect(planQuestions(packV1, r.challenge.date, m.id, r.challenge.level)).toEqual(planQuestions(packV1, today, m.id, 'hard'))
  })

  it('contains no answers, code or personal data', () => {
    const m = mysteryForDate(packV1, today)
    expect(url).not.toContain(m.code)
    expect(url).not.toMatch(/nick|name|avatar|score|answer/i)
    expect(new URLSearchParams(url.split('?')[1]).toString()).toMatch(/^v=[^&]+&d=\d{4}-\d{2}-\d{2}&l=[nh]&o=[smg]{3}$/)
  })

  it('rejects unknown versions, bad input and future dates', () => {
    expect(parseChallenge(new URLSearchParams('v=1999.9&d=2026-11-19&l=n&o=smg'), today)).toEqual({ ok: false, reason: 'unknown-version' })
    expect(parseChallenge(new URLSearchParams('v=2026.1&d=2026-11-19&l=n&o=ssg'), today)).toEqual({ ok: false, reason: 'malformed' })
    expect(parseChallenge(new URLSearchParams('v=2026.1&d=2026-02-30&l=n&o=smg'), today)).toEqual({ ok: false, reason: 'malformed' })
    expect(parseChallenge(new URLSearchParams('v=2026.1&d=2026-11-20&l=n&o=smg'), today)).toEqual({ ok: false, reason: 'future' })
  })

  it('share text uses the real result', () => {
    expect(shareText({ durationMs: 134_000, score: 620 })).toBe('פתחתי את הכספת ב־2:14 עם 620 נקודות. נראה אותך עוקף אותי 🔐')
  })
})
