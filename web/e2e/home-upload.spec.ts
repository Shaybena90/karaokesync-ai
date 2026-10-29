import { expect, makeWav, test } from './fixtures'

test.describe('signed out', () => {
  test.use({ signedIn: false })

  test('home page in Hebrew RTL, switches to English LTR', async ({ page, backend }) => {
    void backend
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הופכים כל שיר לקריוקי')
    await expect(page.getByRole('link', { name: 'העלה שיר' })).toBeVisible()
    await expect(page.getByText('גררו לכאן קובץ שמע')).toBeVisible()
    await page.getByRole('button', { name: /^(English|EN)$/ }).click() // "EN" on phones
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turn any song into karaoke')
    // the choice is remembered
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('a file chosen before signing in is uploaded right after signing in', async ({ page, backend }) => {
    await page.goto('/')
    await page.locator('input[type=file]').setInputFiles({ name: 'השיר שלי.wav', mimeType: 'audio/wav', buffer: makeWav(3) })
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('הקובץ שבחרתם יישמר')).toBeVisible()
    await page.getByLabel('אימייל').fill('singer@example.com')
    await page.getByLabel('סיסמה').fill('a-good-password')
    await page.getByRole('button', { name: 'כניסה', exact: true }).last().click()
    await expect(page).toHaveURL(/\/projects\/33333333/, { timeout: 15000 })
    expect(backend.uploads).toHaveLength(1)
    expect(backend.uploads[0].contentType).toBe('audio/wav')
  })
})

test('upload: shows file details, progress and goes to the project', async ({ page, backend }) => {
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: makeWav(5) })
  await expect(page.getByText('song.wav')).toBeVisible()
  await expect(page.getByText('0:05')).toBeVisible() // duration read by the browser
  await expect(page).toHaveURL(/\/projects\/33333333/, { timeout: 15000 })
  await expect(page.getByText('בתור לעיבוד').first()).toBeVisible()
  expect(backend.apiCalls).toContain('POST /uploads')
  expect(backend.apiCalls).toContain('POST /uploads/33333333-3333-3333-3333-333333333333/complete')
  // the file went straight to storage, not through the API
  expect(backend.uploads[0].path).toContain('/storage/v1/object/upload/sign/audio/')
  expect(backend.uploads[0].size).toBeGreaterThan(80_000)
})

test('upload: a fake audio file is rejected in the browser with a Hebrew message', async ({ page, backend }) => {
  await page.goto('/upload')
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)])
  await page.locator('input[type=file]').setInputFiles({ name: 'song.mp3', mimeType: 'audio/mpeg', buffer: png })
  await expect(page.getByRole('alert')).toContainText('הקובץ אינו קובץ שמע תקין')
  expect(backend.apiCalls.filter((c) => c.startsWith('POST /uploads'))).toEqual([])
  await expect(page.getByRole('button', { name: 'העלאת קובץ אחר' })).toBeVisible()
})

test('upload: server-side rejection is shown with retry options', async ({ page, backend }) => {
  backend.completeError = 'too_long'
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: makeWav(2) })
  await expect(page.getByRole('alert')).toContainText('השיר ארוך מדי')
  await expect(page.getByRole('button', { name: 'נסו שוב' })).toBeVisible()
})

test('projects list: open and delete a project', async ({ page, backend }) => {
  await page.goto('/projects')
  await expect(page.getByText('שיר בדיקה')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'מחיקה' }).click()
  await expect(page.getByText('עדיין אין פרויקטים')).toBeVisible()
  expect(backend.apiCalls).toContain('DELETE /projects/11111111-1111-1111-1111-111111111111')
})
