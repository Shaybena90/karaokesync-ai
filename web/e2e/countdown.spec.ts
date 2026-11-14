import type { Page } from '@playwright/test'
import { expect, PID, test } from './fixtures'

// The demo song: a 5.5 s break before the last line (12 s) -> countdown from 9 s.
const seek = (page: Page, ms: number) =>
  page.evaluate((v) => {
    const input = document.querySelector<HTMLInputElement>('input.ks-seek')!
    input.value = String(v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, ms)

/** Seek until the expected state shows: on a slow phone the first seek can land before the player is ready for it. */
const seekUntil = (page: Page, ms: number, check: () => Promise<unknown>) =>
  expect(async () => {
    await seek(page, ms)
    await check()
  }).toPass({ timeout: 15000 })

async function open(page: Page) {
  await page.goto(`/projects/${PID}/play`)
  await page.locator('.karaoke-word').first().waitFor()
  await expect(page.getByRole('button', { name: 'ניגון' })).toBeEnabled({ timeout: 10000 })
}

test('numbers count down 3, 2, 1 and disappear when the singing starts', async ({ page, backend }) => {
  backend.project().style = { countdown: 'numbers' }
  await open(page)
  const cd = page.getByTestId('countdown')
  for (const [ms, n] of [[9_400, '3'], [10_400, '2'], [11_400, '1']] as const) {
    await seekUntil(page, ms, () => expect(cd.locator('[data-cd="numbers"]')).toHaveText(n, { timeout: 1500 }))
  }
  await seek(page, 12_200)
  await expect(cd.locator('[data-cd]')).toHaveCount(0)
})

test('the progress bar follows the song', async ({ page, backend }) => {
  backend.project().style = { countdown: 'bar' }
  await open(page)
  // half way through the 3 s countdown
  await seekUntil(page, 10_500, () => expect(page.locator('[data-cd="bar"]')).toBeVisible({ timeout: 1500 }))
  const progress = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.karaoke-theme')!).getPropertyValue('--k-cd')))
  expect(progress).toBeGreaterThan(0.4)
  expect(progress).toBeLessThan(0.6)
})

test('pulse, zoom and none', async ({ page, backend }) => {
  for (const design of ['pulse', 'zoom']) {
    backend.project().style = { countdown: design }
    await open(page)
    await seekUntil(page, 10_500, () => expect(page.locator(`[data-cd="${design}"]`)).toBeVisible({ timeout: 1500 }))
  }
  backend.project().style = { countdown: 'none' }
  await open(page)
  await seek(page, 10_500)
  await expect(page.locator('[data-cd]')).toHaveCount(0)
})

test('the countdown design is chosen on the style page', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}/style`)
  await page.locator('.karaoke-word').first().waitFor()
  await page.getByRole('radiogroup', { name: 'ספירה לאחור לפני השירה' }).getByRole('radio', { name: 'פס התקדמות' }).click()
  await expect.poll(() => (backend.stylePatches.at(-1)?.style as { countdown?: string })?.countdown).toBe('bar')
})
