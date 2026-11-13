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

test('automatic sync of a line', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'סנכרון אוטומטי של השורה' }).nth(1).click()
  await expect(page.getByText(/ממתין לשרת העיבוד|מסנכרן את השורה/)).toBeVisible()
  await expect(page.getByText('השורה סונכרנה')).toBeVisible({ timeout: 8000 })
  // The window is the gap between the neighbouring lines.
  expect(backend.syncJobs[0]).toMatchObject({ words: ['זה', 'שיר', 'קריוקי'], window_start_ms: 4000, window_end_ms: 12000 })
  await waitForSave(backend, 1)
  const line = backend.lyricSaves.at(-1)!.p_lines[1].words
  expect(line.map((w) => [w.start_ms, w.end_ms])).toEqual([[4300, 4650], [4700, 5050], [5100, 5450]])

  // Undo brings the old timing back.
  await page.getByRole('button', { name: 'ביטול פעולה' }).click()
  await waitForSave(backend, 2)
  expect(backend.lyricSaves.at(-1)!.p_lines[1].words[0].start_ms).toBe(4500)
})

test('automatic sync failure is explained', async ({ page, backend }) => {
  backend.syncError = 'sync_no_vocals'
  await page.getByRole('button', { name: 'סנכרון אוטומטי של השורה' }).first().click()
  await expect(page.getByText('לא נמצאה שירה בקטע הזה')).toBeVisible({ timeout: 8000 })
  expect(backend.lyricSaves).toHaveLength(0)
})

test('tap to sync a line', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'סנכרון בהקשה' }).first().click()
  const panel = page.getByTestId('tap-sync')
  await expect(panel).toBeVisible()
  const tap = panel.getByRole('button', { name: 'הקשה', exact: true })
  await page.waitForTimeout(600)
  await tap.click()
  await expect(panel.getByText('המילה הבאה: עולם')).toBeVisible()
  await page.waitForTimeout(500)
  await tap.click()
  await expect(panel.getByText('הקישו שוב בסוף המילה האחרונה')).toBeVisible()
  await page.waitForTimeout(500)
  await tap.click()
  await expect(panel).toBeHidden()

  await waitForSave(backend, 1)
  const [a, b] = backend.lyricSaves.at(-1)!.p_lines[0].words
  // Times come from the audio clock: playback started at 0, taps every ~0.5 s.
  expect(a.start_ms).toBeGreaterThan(200)
  expect(b.start_ms - a.start_ms).toBeGreaterThan(250)
  expect(a.end_ms).toBe(b.start_ms)
  expect(b.end_ms).toBeGreaterThan(b.start_ms)
  expect(b.end_ms).toBeLessThan(4500) // still before the next line
})

test('tap sync can be cancelled without changes', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'סנכרון בהקשה' }).first().click()
  const panel = page.getByTestId('tap-sync')
  await panel.getByRole('button', { name: 'הקשה', exact: true }).click()
  await panel.getByRole('button', { name: 'ביטול' }).last().click()
  await expect(panel).toBeHidden()
  await page.waitForTimeout(1500)
  expect(backend.lyricSaves).toHaveLength(0)
})

test('the word panel is mounted once', async ({ page }) => {
  await page.locator('.ks-chip', { hasText: 'שלום' }).click()
  await expect(page.getByPlaceholder('המילה החסרה')).toHaveCount(1)
  await page.getByRole('button', { name: 'סגירה' }).click()
  await page.getByRole('button', { name: 'סנכרון בהקשה' }).first().click()
  await expect(page.getByTestId('tap-sync')).toHaveCount(1)
})

test('type a whole sentence and sync it to the singer', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'עריכת המשפט כולו' }).nth(1).click()
  const editor = page.getByTestId('line-editor')
  await editor.getByRole('textbox').fill('זה השיר הכי יפה')
  await editor.getByRole('button', { name: /שמירה וסנכרון לפי הזמר/ }).click()
  await expect(page.getByText('השורה סונכרנה')).toBeVisible({ timeout: 8000 })
  expect(backend.syncJobs[0]).toMatchObject({ words: ['זה', 'השיר', 'הכי', 'יפה'], window_start_ms: 4000, window_end_ms: 12000 })
  // Saved twice: first the typed sentence (estimated timing), then the synced timing.
  await expect.poll(() => backend.lyricSaves.at(-1)?.p_lines[1].words.map((w) => w.start_ms)).toEqual([4300, 4700, 5100, 5500])
  expect(backend.lastSavedText()[1]).toBe('זה השיר הכי יפה')
})

test('save a sentence without syncing', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'עריכת המשפט כולו' }).first().click()
  await page.getByTestId('line-editor').getByRole('textbox').fill('שלום לכולם')
  await page.getByRole('button', { name: 'שמירה בלבד' }).click()
  await waitForSave(backend, 1)
  expect(backend.lastSavedText()[0]).toBe('שלום לכולם')
  expect(backend.syncJobs).toHaveLength(0)
})

test('add a missing sentence where the song is now', async ({ page, backend }, info) => {
  // Put the playhead at 5.7 s (selecting a word moves it there), then close the word panel.
  await page.locator('.ks-chip', { hasText: 'קריוקי' }).click()
  await inspector(page, isMobileProject(info.project.name)).getByRole('button', { name: 'סגירה' }).click()
  await page.getByRole('button', { name: /משפט חדש/ }).click()
  const panel = page.getByTestId('new-line')
  await expect(panel.getByTestId('new-line-at')).toHaveText('0:05.7')
  await panel.getByRole('textbox').fill('שורה שחסרה באמצע')
  await panel.getByRole('button', { name: /הוספה וסנכרון/ }).click()
  await expect(panel).toBeHidden()
  await expect(page.getByText('השורה סונכרנה')).toBeVisible({ timeout: 8000 })
  expect(backend.syncJobs[0]).toMatchObject({ words: ['שורה', 'שחסרה', 'באמצע'], window_start_ms: 6500, window_end_ms: 12000 })
  await expect.poll(() => backend.lastSavedText()).toEqual(['שלום עולם', 'זה שיר קריוקי', 'שורה שחסרה באמצע', 'סוף טוב'])
})

const rangeRegions = (page: Page) =>
  page.evaluate(() => {
    const host = [...document.querySelectorAll('.ks-waveform *')].find((e) => e.shadowRoot)!
    return [...host.shadowRoot!.querySelectorAll<HTMLElement>('[part~="region"]')].filter((r) => r.style.backgroundColor.includes('250, 204, 21')).length
  })

test('mark where a sentence is sung and sync inside that stretch', async ({ page, backend }) => {
  await page.getByRole('button', { name: 'תחימת המשפט בזמן וסנכרון' }).nth(1).click()
  const panel = page.getByTestId('line-range')
  await expect(panel.getByText('זה שיר קריוקי')).toBeVisible()
  await expect.poll(() => rangeRegions(page)).toBe(1) // the yellow stretch on the waveform

  const start = panel.getByRole('textbox', { name: 'התחלה (שניות)' })
  await start.fill('4.1')
  await start.press('Enter')
  const end = panel.getByRole('textbox', { name: 'סוף (שניות)' })
  await end.fill('7.25')
  await end.press('Enter')
  await panel.getByRole('button', { name: /סנכרון המילים בקטע הזה/ }).click()
  await expect(panel).toBeHidden()
  await expect.poll(() => rangeRegions(page)).toBe(0)
  expect(backend.syncJobs[0]).toMatchObject({ words: ['זה', 'שיר', 'קריוקי'], window_start_ms: 4100, window_end_ms: 7250 })
  await expect(page.getByText('השורה סונכרנה')).toBeVisible({ timeout: 8000 })
})

test('the stretch can be set from the playback position', async ({ page, backend }, info) => {
  await page.getByRole('button', { name: 'תחימת המשפט בזמן וסנכרון' }).nth(1).click()
  const panel = page.getByTestId('line-range')
  // Selecting a word moves the playhead to it (here: "שיר" at 5.1 s).
  await page.locator('.ks-chip', { hasText: 'שיר' }).click()
  await panel.getByRole('button', { name: /לפי מיקום הניגון/ }).first().click()
  await expect(panel.getByRole('textbox', { name: 'התחלה (שניות)' })).toHaveValue('5.10')
  void info
  // An end before the start is refused with an explanation.
  const end = panel.getByRole('textbox', { name: 'סוף (שניות)' })
  await end.fill('5.2')
  await end.press('Enter')
  await expect(panel.getByRole('alert')).toContainText('הקטע קצר מדי')
  await expect(panel.getByRole('button', { name: /סנכרון המילים בקטע הזה/ })).toBeDisabled()
  expect(backend.syncJobs).toHaveLength(0)
})
