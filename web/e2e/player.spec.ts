import type { Page } from '@playwright/test'
import { expect, PID, test } from './fixtures'

const wordStates = (page: Page) =>
  page.$$eval('.karaoke-word', (els) =>
    els.map((e) => `${e.querySelector('.kw-fill')!.textContent}:${e.getAttribute('data-state')}:${Number(e.style.getPropertyValue('--p')).toFixed(2)}`),
  )
const mainLine = (page: Page) => page.$$eval('.karaoke-word .kw-fill', (els) => els.map((e) => e.textContent).join(' '))
const seek = (page: Page, ms: number) =>
  page.evaluate((v) => {
    const input = document.querySelector<HTMLInputElement>('input.ks-seek')!
    input.value = String(v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, ms)
const nextFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

test.beforeEach(async ({ page, backend }) => {
  void backend
  await page.goto(`/projects/${PID}/play`)
  await page.locator('.karaoke-word').first().waitFor()
  await expect(page.getByRole('button', { name: 'ניגון' })).toBeEnabled({ timeout: 10000 })
})

test('highlight follows the real audio clock while playing', async ({ page }) => {
  expect(await mainLine(page)).toBe('שלום עולם')
  await page.getByRole('button', { name: 'ניגון' }).click()
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 2.3, null, { timeout: 8000 })
  const mismatches = await page.evaluate(async () => {
    const words = [
      { text: 'שלום', s: 2000, e: 2800 }, { text: 'עולם', s: 2900, e: 4000 },
      { text: 'זה', s: 4500, e: 5000 }, { text: 'שיר', s: 5100, e: 5600 }, { text: 'קריוקי', s: 5700, e: 6500 },
    ]
    const bad: number[] = []
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const t = document.querySelector('audio')!.currentTime * 1000
      const active = [...document.querySelectorAll('.karaoke-word[data-state="active"] .kw-fill')].map((e) => e.textContent)
      const expected = words.filter((w) => t >= w.s && t < w.e).map((w) => w.text)
      const nearBoundary = words.some((w) => Math.abs(t - w.s) < 60 || Math.abs(t - w.e) < 60)
      if (!nearBoundary && JSON.stringify(active) !== JSON.stringify(expected)) bad.push(Math.round(t))
    }
    return bad
  })
  expect(mismatches).toEqual([])
})

test('seeking forward and backward updates the lyrics immediately', async ({ page }) => {
  await seek(page, 12_500)
  await nextFrame(page)
  expect((await wordStates(page))[0]).toBe('סוף:active:0.50')
  await seek(page, 5_300)
  await nextFrame(page)
  const states = (await wordStates(page)).join(' ')
  expect(states).toContain('זה:sung:1.00')
  expect(states).toContain('שיר:active:0.40')
  expect(states).toContain('קריוקי:upcoming:0.00')
})

test('countdown before singing resumes after a long break', async ({ page }) => {
  await seek(page, 9_500)
  await nextFrame(page)
  expect(await mainLine(page)).toBe('סוף טוב')
  await expect(page.locator('span.size-3.scale-100')).toHaveCount(3)
  await seek(page, 8_000)
  await expect(page.getByText('♪ ♪ ♪')).toBeVisible()
})

test('tapping a line jumps to it', async ({ page }) => {
  await seek(page, 2_100)
  await nextFrame(page)
  await page.getByRole('button', { name: 'זה שיר קריוקי' }).click() // the "next line" preview
  await nextFrame(page)
  const t = await page.evaluate(() => document.querySelector('audio')!.currentTime)
  expect(t).toBeCloseTo(4.5, 1)
  expect(await mainLine(page)).toBe('זה שיר קריוקי')
})

test('fullscreen and back', async ({ page }) => {
  await page.getByRole('button', { name: 'מסך מלא' }).click()
  await expect(page.getByRole('button', { name: 'יציאה ממסך מלא' })).toBeVisible()
  const covers = await page.evaluate(() => {
    const el = document.fullscreenElement ?? document.querySelector('.karaoke-theme.fixed')
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1
  })
  expect(covers).toBe(true)
  await page.getByRole('button', { name: 'יציאה ממסך מלא' }).click()
  await expect(page.getByRole('button', { name: 'מסך מלא' })).toBeVisible()
})

test('pause stops the clock', async ({ page }) => {
  await page.getByRole('button', { name: 'ניגון' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'השהיה' }).click()
  const t1 = await page.evaluate(() => document.querySelector('audio')!.currentTime)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.querySelector('audio')!.currentTime)).toBe(t1)
})
