import type { Page } from '@playwright/test'
import { expect, PID, test } from './fixtures'

const frame = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('div')].find((d) => d.style.aspectRatio)!
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
const lyricFontPx = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.ks-lyric')!).fontSize))

test.beforeEach(async ({ page, backend }) => {
  void backend
  await page.goto(`/projects/${PID}/style`)
  await page.locator('.karaoke-word').first().waitFor()
})

test('preview uses the video proportions', async ({ page }) => {
  const f = await frame(page)
  expect(f.w / f.h).toBeCloseTo(16 / 9, 1)
  expect((await lyricFontPx(page)) / f.h).toBeCloseTo(0.0667, 2) // same as the rendered video
})

test('presets change the look and are saved', async ({ page, backend }) => {
  await page.getByRole('button', { name: /ניאון/ }).click()
  await expect.poll(() => (backend.stylePatches.at(-1)?.style as { preset?: string })?.preset).toBe('neon')
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ks-lyric')!).fontFamily)).toContain('Rubik')

  await page.getByRole('button', { name: /TikTok/ }).click()
  const f = await frame(page)
  expect(f.w / f.h).toBeCloseTo(9 / 16, 1) // TikTok switches to vertical video
  expect((await lyricFontPx(page)) / f.w).toBeCloseTo(0.085 * 1.25, 2)

  await page.getByRole('radio', { name: 'למעלה' }).click()
  await expect.poll(() => (backend.stylePatches.at(-1)?.style as { preset?: string })?.preset).toBe('custom')
})

test('subtitle files download with the song name', async ({ page }) => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /SRT/ }).click()])
  expect(download.suggestedFilename()).toBe('שיר בדיקה.srt')
})

test('video export: request, progress, download', async ({ page, backend }) => {
  await page.getByRole('radio', { name: '9:16 טלפון' }).click()
  await page.getByRole('radio', { name: '720p' }).click()
  await page.getByRole('button', { name: /יצירת סרטון/ }).click()
  await expect(page.getByText(/בתור ליצירה|יוצר סרטון/)).toBeVisible()
  expect(backend.exportJobs[0].options).toEqual({ aspect: '9:16', resolution: 720 })
  await page.getByRole('button', { name: /הורדת הסרטון/ }).click({ timeout: 15000 })
  await expect.poll(() => backend.apiCalls.find((c) => c.startsWith('VIDEO'))).toBe('VIDEO download=שיר בדיקה.mp4')
})

test('the player uses the saved style', async ({ page, backend }) => {
  backend.project().style = { preset: 'tiktok' }
  await page.goto(`/projects/${PID}/play`)
  await page.locator('.karaoke-word').first().waitFor()
  const active = await page.evaluate(() => getComputedStyle(document.querySelector('.karaoke-theme')!).getPropertyValue('--k-active').trim())
  expect(active).toBe('#facc15')
})
