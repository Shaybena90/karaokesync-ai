import type { Page } from '@playwright/test'
import { expect, isMobileProject, MockBackend, PID, test } from './fixtures'

/** The word inspector: side panel on desktop, bottom sheet on phones. */
const inspector = (page: Page, mobile: boolean) => (mobile ? page.locator('div.fixed.bottom-0') : page.locator('aside'))

async function waitForSave(backend: MockBackend, count: number) {
  await expect.poll(() => backend.lyricSaves.length, { timeout: 6000 }).toBeGreaterThanOrEqual(count)
}

async function regionBox(page: Page, text: string) {
  return page.evaluate((t) => {
    const host = [...document.querySelectorAll('.ks-waveform *')].find((e) => e.shadowRoot)!
    const region = [...host.shadowRoot!.querySelectorAll('[part~="region"]')].find((r) => r.textContent?.includes(t))!
    const b = region.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  }, text)
}

test.beforeEach(async ({ page, backend }) => {
  void backend
  await page.goto(`/projects/${PID}/edit`)
  await page.locator('.ks-chip').first().waitFor()
  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('.ks-waveform *')].find((e) => e.shadowRoot)
    return host?.shadowRoot?.querySelectorAll('[part~="region"]').length
  }, null, { timeout: 10000 })
})

test('edit text, timing, add and delete words — autosaved', async ({ page, backend }, info) => {
  const mobile = isMobileProject(info.project.name)
  const panel = inspector(page, mobile)

  await page.locator('.ks-chip', { hasText: 'עולם' }).click()
  const text = panel.getByRole('textbox').first()
  await text.fill('עולם ומלואו')
  await text.press('Enter')
  await waitForSave(backend, 1)
  expect(backend.lastSavedText()[0]).toBe('שלום עולם ומלואו')

  await page.locator('.ks-chip', { hasText: 'שלום' }).click()
  await panel.getByRole('button', { name: 'התחלה (שניות) +0.05' }).click()
  await waitForSave(backend, 2)
  expect(backend.lyricSaves.at(-1)!.p_lines[0].words[0].start_ms).toBe(2050)

  await page.locator('.ks-chip', { hasText: 'קריוקי' }).click()
  await panel.getByPlaceholder('המילה החסרה').fill('יפה')
  await panel.getByRole('button', { name: 'הוספה אחרי' }).click()
  await waitForSave(backend, 3)
  expect(backend.lastSavedText()[1]).toBe('זה שיר קריוקי יפה')

  await page.locator('.ks-chip', { hasText: 'זה' }).click()
  await panel.getByRole('button', { name: /מחיקה/ }).click()
  await waitForSave(backend, 4)
  expect(backend.lastSavedText()[1]).toBe('שיר קריוקי יפה')
  await expect(page.getByRole('status')).toContainText('נשמר')
})

test('split and merge lines, undo and redo', async ({ page, backend }, info) => {
  const panel = inspector(page, isMobileProject(info.project.name))
  await page.locator('.ks-chip', { hasText: 'שיר' }).click()
  await panel.getByRole('button', { name: /שורה חדשה מכאן/ }).click()
  await waitForSave(backend, 1)
  expect(backend.lastSavedText()).toEqual(['שלום עולם', 'זה', 'שיר קריוקי', 'סוף טוב'])
  await panel.getByRole('button', { name: 'סגירה' }).click()

  await page.getByRole('button', { name: 'איחוד עם השורה הבאה' }).nth(1).click()
  await waitForSave(backend, 2)
  expect(backend.lastSavedText()).toEqual(['שלום עולם', 'זה שיר קריוקי', 'סוף טוב'])

  await page.getByRole('button', { name: 'ביטול פעולה' }).click()
  await waitForSave(backend, 3)
  expect(backend.lastSavedText()).toHaveLength(4)
  await page.getByRole('button', { name: 'ביצוע מחדש' }).click()
  await waitForSave(backend, 4)
  expect(backend.lastSavedText()).toHaveLength(3)
})

test('drag a word on the waveform (mouse or finger)', async ({ page, backend }, info) => {
  const mobile = isMobileProject(info.project.name)
  await page.locator('.ks-chip', { hasText: 'שלום' }).click()
  // On short screens the waveform is not pinned: scroll back up to it, like a user would.
  await page.locator('.ks-waveform').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const box = await regionBox(page, 'שלום')
  const y = box.y + box.h / 2
  const x0 = box.x + box.w / 2
  if (mobile) {
    // Real touch events through the Chrome DevTools protocol.
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    await touch('touchStart', x0)
    for (let i = 1; i <= 10; i++) await touch('touchMove', x0 + i * 5)
    await touch('touchEnd', x0 + 50)
  } else {
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + i * 5, y)
    await page.mouse.up()
  }
  await waitForSave(backend, 1)
  const moved = backend.lyricSaves.at(-1)!.p_lines[0].words[0]
  expect(moved.start_ms).toBeGreaterThan(2250) // 50px at 120px/s ≈ +0.42s
  expect(moved.end_ms - moved.start_ms).toBe(800) // dragged, not resized
})

test('loop a line keeps playback inside it', async ({ page }) => {
  await page.getByRole('button', { name: 'השמעת השורה בלולאה' }).first().click()
  await expect(page.getByRole('button', { name: /לולאה ✕/ })).toBeVisible()
  const samples: number[] = []
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100)
    const [m, s] = (await page.locator('span.font-mono').first().textContent())!.split(':')
    samples.push(Number(m) * 60 + Number(s))
  }
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(1.9)
  expect(Math.max(...samples)).toBeLessThanOrEqual(4.2)
  expect(samples.some((x, i) => i > 0 && samples[i - 1] - x > 1)).toBe(true) // wrapped around
})

test('an edit elsewhere stops saving instead of overwriting', async ({ page, backend }, info) => {
  backend.forceSaveConflict = true
  const panel = inspector(page, isMobileProject(info.project.name))
  await page.locator('.ks-chip', { hasText: 'טוב' }).click()
  await panel.getByRole('button', { name: 'סוף (שניות) +0.05' }).click()
  await expect(page.getByText('השמירה הופסקה')).toBeVisible()
})
