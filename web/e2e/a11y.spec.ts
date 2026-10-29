/** Automated accessibility audit (axe-core): no serious or critical issues. */
import AxeBuilder from '@axe-core/playwright'
import { expect, PID, test } from './fixtures'

const PAGES = [
  { path: '/', ready: 'h1' },
  { path: '/upload', ready: 'input[type=file]' },
  { path: '/projects', ready: 'a[href^="/projects/"]' },
  { path: `/projects/${PID}`, ready: '.karaoke-word' },
  { path: `/projects/${PID}/play`, ready: '.karaoke-word' },
  { path: `/projects/${PID}/edit`, ready: '.ks-chip' },
  { path: `/projects/${PID}/style`, ready: '.karaoke-word' },
]

for (const pg of PAGES) {
  test(`a11y ${pg.path}`, async ({ page, backend }) => {
    void backend
    await page.goto(pg.path)
    await page.locator(pg.ready).first().waitFor()
    await page.waitForTimeout(400)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // wavesurfer's internal shadow DOM is a canvas widget we don't control
      .exclude('.ks-waveform')
      .analyze()
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(serious).toEqual([])
  })
}

test.describe('signed out', () => {
  test.use({ signedIn: false })
  test('a11y /login', async ({ page, backend }) => {
    void backend
    await page.goto('/login')
    await page.locator('form').waitFor()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  })
})
