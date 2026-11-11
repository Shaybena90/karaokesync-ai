import { expect, PID, test } from './fixtures'

const audioSrc = (page: import('@playwright/test').Page) => page.evaluate(() => decodeURIComponent(document.querySelector('audio')!.src))

test('remove the singer, then switch back and forth at the same position', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}/play`)
  await expect(page.getByRole('button', { name: 'ניגון' })).toBeEnabled({ timeout: 10000 })

  await page.getByRole('button', { name: /הסרת הקול של הזמר/ }).click()
  await expect(page.getByText(/ממתין לשרת העיבוד|מסיר את הקול של הזמר/).first()).toBeVisible()
  const without = page.getByRole('radio', { name: /בלי הזמר/ })
  await expect(without).toBeVisible({ timeout: 8000 })
  expect(backend.instrumentalJobs).toHaveLength(1)
  await expect(page.getByRole('radio', { name: /עם הזמר/ })).toHaveAttribute('aria-checked', 'true')

  // Play a little, then switch: the melody-only track continues from the same moment.
  await page.getByRole('button', { name: 'ניגון' }).click()
  await page.waitForFunction(() => document.querySelector('audio')!.currentTime > 1.5, null, { timeout: 8000 })
  await without.click()
  await expect(without).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => audioSrc(page)).toContain('instrumental-i1.mp3')
  await page.waitForFunction(() => {
    const a = document.querySelector('audio')!
    return a.readyState >= 1 && !a.paused
  }, null, { timeout: 8000 })
  expect(await page.evaluate(() => document.querySelector('audio')!.currentTime)).toBeGreaterThan(1.4)

  // And back to the song with the singer.
  await page.getByRole('radio', { name: /עם הזמר/ }).click()
  await expect.poll(() => audioSrc(page)).not.toContain('instrumental')
})

test('asking again does not separate the song twice', async ({ page, backend }) => {
  backend.instrumentalJobs.push({ id: 'i9', project_id: PID, audio_file_id: 'A1', status: 'succeeded', progress: 100,
    output_path: `x/${PID}/instrumental-i9.mp3`, error_code: null, created_at: new Date().toISOString() })
  await page.goto(`/projects/${PID}/play`)
  await expect(page.getByRole('radio', { name: /בלי הזמר/ })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /הסרת הקול של הזמר/ })).toHaveCount(0)
})

test('a failed separation can be tried again', async ({ page, backend }) => {
  backend.instrumentalJobs.push({ id: 'i8', project_id: PID, audio_file_id: 'A1', status: 'failed', progress: 0,
    output_path: null, error_code: 'separation_failed', created_at: new Date().toISOString() })
  await page.goto(`/projects/${PID}/play`)
  await expect(page.getByRole('alert')).toContainText('הפרדת השירה נכשלה')
  await page.getByRole('button', { name: /ניסיון נוסף/ }).click()
  await expect(page.getByRole('radio', { name: /בלי הזמר/ })).toBeVisible({ timeout: 8000 })
})

test('video without the singer', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}/style`)
  const box = page.getByRole('checkbox', { name: /סרטון בלי הזמר/ })
  await expect(box).toBeDisabled() // no melody-only track yet
  await expect(page.getByText('צרו קודם גרסה בלי הזמר')).toBeVisible()

  await page.getByRole('button', { name: /הסרת הקול של הזמר/ }).click()
  await expect(box).toBeEnabled({ timeout: 8000 })
  await box.check()
  await page.getByRole('button', { name: /יצירת סרטון/ }).click()
  await expect.poll(() => backend.exportJobs[0]?.options).toMatchObject({ audio: 'instrumental' })
  await expect(page.getByText('· 🎵 בלי הזמר')).toBeVisible()
})
