import { expect, PID, test } from './fixtures'
import { makeWav } from './fixtures'

test('lyrics pasted at upload are sent with the song', async ({ page, backend }) => {
  await page.goto('/upload')
  await page.getByRole('button', { name: /יש לך את המילים\? הדבק אותן/ }).click()
  await page.getByTestId('upload-lyrics').getByRole('textbox').fill('[פזמון]\nשלום עולם\nזה שיר')
  await page.locator('input[type=file]').setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: makeWav(3) })
  await expect(page).toHaveURL(/\/projects\/33333333/, { timeout: 15000 })
  expect(backend.uploadRequests[0].lyrics_text).toBe('[פזמון]\nשלום עולם\nזה שיר')
})

test('a ready song can be synced again to pasted lyrics', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}`)
  await page.getByRole('button', { name: /יש לך את המילים המדויקות\? הדבק אותן/ }).click()
  const panel = page.getByTestId('pasted-lyrics')
  await expect(panel.getByText('עריכות שעשית בעורך יוחלפו')).toBeVisible()
  const submit = panel.getByRole('button', { name: 'סנכרון לפי המילים שלי' })
  await expect(submit).toBeDisabled() // nothing pasted yet
  await panel.getByRole('textbox').fill('שלום עולם\nזה שיר קריוקי')
  await submit.click()
  await expect(page.getByText('בתור לעיבוד').first()).toBeVisible({ timeout: 8000 })
  expect(backend.project().lyrics_text).toBe('שלום עולם\nזה שיר קריוקי')
  expect(backend.apiCalls).toContain(`POST /projects/${PID}/lyrics-text`)
})

test('pasting lyrics is offered when recognition failed', async ({ page, backend }) => {
  Object.assign(backend.project(), { status: 'failed', error_code: 'no_lyrics_detected' })
  await page.goto(`/projects/${PID}`)
  await expect(page.getByText('לא זוהו מילים מושרות')).toBeVisible()
  await page.getByRole('button', { name: /יש לך את המילים המדויקות/ }).click()
  await page.getByTestId('pasted-lyrics').getByRole('textbox').fill('שלום עולם')
  await page.getByRole('button', { name: 'סנכרון לפי המילים שלי' }).click()
  await expect.poll(() => backend.project().status).toBe('queued')
})

test('pasted lyrics can be dropped to go back to automatic recognition', async ({ page, backend }) => {
  backend.project().lyrics_text = 'שלום עולם'
  await page.goto(`/projects/${PID}`)
  await page.getByRole('button', { name: /יש לך את המילים המדויקות/ }).click()
  await expect(page.getByTestId('pasted-lyrics').getByRole('textbox')).toHaveValue('שלום עולם')
  await page.getByRole('button', { name: 'חזרה לזיהוי אוטומטי' }).click()
  await expect.poll(() => backend.project().status).toBe('queued')
  expect(backend.project().lyrics_text).toBeNull()
})

test('find the lyrics online and sync them with one button', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}`)
  await page.getByRole('button', { name: /חפש את המילים באינטרנט/ }).click()
  const panel = page.getByTestId('lyrics-search')
  // searched right away with the song's name and length
  await expect.poll(() => backend.lyricsQueries.at(-1)?.q).toBe(backend.project().title as string)
  expect(backend.lyricsQueries.at(-1)?.duration_ms).not.toBeNull()
  const results = panel.getByRole('radiogroup', { name: 'תוצאות החיפוש' }).getByRole('radio')
  await expect(results).toHaveCount(2)
  // the one with the same length as the song is picked and shown for checking
  await expect(results.first()).toHaveAttribute('aria-checked', 'true')
  await expect(panel.getByText('באורך של השיר שלכם')).toBeVisible()
  const words = panel.locator('textarea')
  await expect(words).toHaveValue('שלום עולם זה שיר קריוקי\nסוף טוב')
  await words.fill('שלום עולם זה שיר קריוקי\nסוף טוב מאוד') // can be corrected before use
  await panel.getByRole('button', { name: /השתמש במילים האלה וסנכרן לזמר/ }).click()
  await expect.poll(() => backend.project().status).toBe('queued')
  expect(backend.project().lyrics_text).toBe('שלום עולם זה שיר קריוקי\nסוף טוב מאוד')
})

test('lyrics search: another song, nothing found, service down', async ({ page, backend }) => {
  await page.goto(`/projects/${PID}`)
  await page.getByRole('button', { name: /חפש את המילים באינטרנט/ }).click()
  const panel = page.getByTestId('lyrics-search')
  await panel.getByRole('radio').nth(1).click()
  await expect(panel.locator('textarea')).toHaveValue('גרסה אחרת לגמרי')
  await panel.getByRole('textbox', { name: 'שם השיר והזמר' }).fill('אין כזה שיר')
  await panel.getByRole('button', { name: 'חפש', exact: true }).click()
  await expect(panel.getByText(/לא נמצאו מילים/)).toBeVisible()
  backend.lyricsResults = null
  await panel.getByRole('button', { name: 'חפש', exact: true }).click()
  await expect(panel.getByText(/שירות חיפוש המילים לא זמין/)).toBeVisible()
})

test('lyrics found online fill the upload form', async ({ page, backend }) => {
  await page.goto('/upload')
  await page.getByRole('button', { name: /יש לך את המילים\? הדבק אותן/ }).click()
  await page.getByRole('button', { name: /חפש את המילים באינטרנט/ }).click()
  const panel = page.getByTestId('lyrics-search')
  await panel.getByRole('textbox', { name: 'שם השיר והזמר' }).fill('הזמרת - שיר בדיקה')
  await panel.getByRole('button', { name: 'חפש', exact: true }).click()
  await panel.getByRole('radio').first().click()
  await panel.getByRole('button', { name: /^✓ השתמש במילים האלה$/ }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: makeWav(3) })
  await expect(page).toHaveURL(/\/projects\/33333333/, { timeout: 15000 })
  expect(backend.uploadRequests[0].lyrics_text).toBe('שלום עולם זה שיר קריוקי\nסוף טוב')
})
