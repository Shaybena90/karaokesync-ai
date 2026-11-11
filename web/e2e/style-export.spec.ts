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
  expect(backend.exportJobs[0].options).toEqual({ aspect: '9:16', resolution: 720, audio: 'original' })
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

// ------------------------------------------------------------- backgrounds
const GIF = Buffer.from('R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
type Clip = { media_id: string; start_ms: number | null; end_ms: number | null }
const lastClips = (backend: { stylePatches: Record<string, unknown>[] }) =>
  (backend.stylePatches.at(-1)?.style as { backgrounds?: Clip[] } | undefined)?.backgrounds

test('add a looping background for part of the song', async ({ page, backend }) => {
  const panel = page.getByTestId('background-panel')
  await panel.getByTestId('background-file').setInputFiles({ name: 'לולאה.gif', mimeType: 'image/gif', buffer: GIF })
  await expect(panel.getByText('לולאה.gif')).toBeVisible()
  await expect(panel.getByText('GIF מונפש · 0:10.0')).toBeVisible()
  // Uploaded straight to the private bucket, then the whole song by default.
  expect(backend.uploads.some((u) => u.path.includes('/upload/sign/backgrounds/'))).toBe(true)
  await expect.poll(() => lastClips(backend)).toEqual([{ media_id: backend.backgroundMedia[0].id, start_ms: null, end_ms: null }])

  // Shown in the preview, behind the lyrics.
  const layer = page.getByTestId('background-layers').locator('img')
  await expect(layer).toHaveCSS('opacity', '1')

  // Only part of the song.
  await panel.getByLabel('לכל אורך השיר').uncheck()
  await expect.poll(() => lastClips(backend)?.[0]).toMatchObject({ start_ms: 0, end_ms: 10000 })
  const to = panel.getByRole('textbox', { name: 'עד' })
  await to.fill('0:05')
  await to.press('Enter')
  await expect.poll(() => lastClips(backend)?.[0]).toMatchObject({ start_ms: 0, end_ms: 5000 })
  const from = panel.getByRole('textbox', { name: 'מ-' })
  await from.fill('8')
  await from.press('Enter')
  // A start after the end moves the end, so the range stays valid.
  await expect.poll(() => lastClips(backend)?.[0]).toMatchObject({ start_ms: 8000, end_ms: 9000 })
  // The playhead is at 0, outside 8–9 s: hidden in the preview.
  await expect(layer).toHaveCSS('opacity', '0')
})

test('a rejected background explains why', async ({ page, backend }) => {
  backend.backgroundError = 'not_media'
  const panel = page.getByTestId('background-panel')
  await panel.getByTestId('background-file').setInputFiles({ name: 'fake.gif', mimeType: 'image/gif', buffer: Buffer.from('nope') })
  await expect(panel.getByRole('alert')).toContainText('אינו תמונה או סרטון')
  await page.waitForTimeout(800)
  expect(lastClips(backend) ?? []).toEqual([])
})

test('removing a background deletes its file', async ({ page, backend }) => {
  const panel = page.getByTestId('background-panel')
  await panel.getByTestId('background-file').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: GIF })
  await expect(panel.getByText('תמונה', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'הסרת הרקע' }).click()
  await expect.poll(() => lastClips(backend)).toEqual([])
  await expect.poll(() => backend.backgroundMedia.length).toBe(0)
  await expect(page.getByTestId('background-layers')).toHaveCount(0)
})

test('the player shows the saved background', async ({ page, backend }) => {
  const id = '0b4f8f5e-3c1d-4b8a-9e2f-000000000009'
  backend.backgroundMedia.push({ id, project_id: PID, storage_path: `x/${PID}/${id}.gif`, original_name: 'a.gif', format: 'gif',
    kind: 'video', duration_ms: 10000, width: 64, height: 36, status: 'verified', error_code: null, created_at: new Date().toISOString() })
  backend.project().style = { backgrounds: [{ media_id: id, start_ms: null, end_ms: null }] }
  await page.goto(`/projects/${PID}/play`)
  await expect(page.getByTestId('background-layers').locator('img')).toHaveCSS('opacity', '1')
})
