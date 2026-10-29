/**
 * Every page on every device profile: no sideways scrolling, touch targets
 * large enough for fingers, and form fields that don't make iOS zoom in.
 */
import type { Page } from '@playwright/test'
import { expect, expectNoHorizontalScroll, isMobileProject, PID, test } from './fixtures'

const MIN_TARGET = 32 // px; primary actions are larger (44–72px), this is the floor for every control
const MIN_INPUT_FONT = 16 // px; iOS Safari zooms into fields with smaller text

const PAGES: { name: string; path: string; ready: string; signedIn?: boolean }[] = [
  { name: 'home', path: '/', ready: 'h1' },
  { name: 'login', path: '/login', ready: 'form', signedIn: false },
  { name: 'signup', path: '/signup', ready: 'form', signedIn: false },
  { name: 'upload', path: '/upload', ready: 'input[type=file]' },
  { name: 'projects', path: '/projects', ready: 'a[href^="/projects/"]' },
  { name: 'project', path: `/projects/${PID}`, ready: '.karaoke-word' },
  { name: 'player', path: `/projects/${PID}/play`, ready: '.karaoke-word' },
  { name: 'editor', path: `/projects/${PID}/edit`, ready: '.ks-chip' },
  { name: 'style', path: `/projects/${PID}/style`, ready: '.karaoke-word' },
]

async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = []
    const els = document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type=range]):not([type=file]):not([type=checkbox]), [role=radio]')
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden=true]')) continue
      // Links inside running text are exempt (WCAG 2.5.8 inline exception).
      if (el.tagName === 'A' && style.display === 'inline' && el.closest('p')) continue
      if (Math.min(r.width, r.height) < min) {
        out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return out
  }, MIN_TARGET)
}

for (const pg of PAGES) {
  test.describe(pg.name, () => {
    if (pg.signedIn === false) test.use({ signedIn: false })

    test(`${pg.name}: layout fits the screen`, async ({ page, backend }, testInfo) => {
      void backend
      await page.goto(pg.path)
      await page.locator(pg.ready).first().waitFor()
      await page.waitForTimeout(300)
      await expectNoHorizontalScroll(page)
      await page.screenshot({ path: testInfo.outputPath(`${pg.name}.png`), fullPage: true })

      if (isMobileProject(testInfo.project.name)) {
        expect(await smallTargets(page), 'touch targets smaller than 32px').toEqual([])
        const tinyInputs = await page.evaluate((min) => {
          return [...document.querySelectorAll<HTMLElement>('input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=file]), select, textarea')]
            .filter((el) => el.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(el).fontSize) < min)
            .map((el) => `${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.tagName} ${getComputedStyle(el).fontSize}`)
        }, MIN_INPUT_FONT)
        expect(tinyInputs, 'form fields under 16px make iOS zoom in').toEqual([])
      }
    })
  })
}
