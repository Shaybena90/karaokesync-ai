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
  const panel = page.getByTestId('lyrics-search') // open right away on the new-song screen
  await panel.getByRole('textbox', { name: 'שם השיר והזמר' }).fill('הזמרת - שיר בדיקה')
  await panel.getByRole('button', { name: 'חפש', exact: true }).click()
  await panel.getByRole('radio').first().click()
  await panel.getByRole('button', { name: /^✓ השתמש במילים האלה$/ }).click()
  await expect(page.getByTestId('upload-lyrics').locator('textarea')).toHaveValue('שלום עולם זה שיר קריוקי\nסוף טוב')
  await page.locator('input[type=file]').setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: makeWav(3) })
  await expect(page).toHaveURL(/\/projects\/33333333/, { timeout: 15000 })
  expect(backend.uploadRequests[0].lyrics_text).toBe('שלום עולם זה שיר קריוקי\nסוף טוב')
})

test('my own lyrics websites: add, search them on the new-song screen, remove', async ({ page, backend }) => {
  await page.goto('/upload')
  const panel = page.getByTestId('lyrics-search')
  await panel.getByRole('button', { name: /אתרי המילים שלי/ }).click()
  const sites = page.getByTestId('lyrics-sources')
  // a page that is not a search address is refused with an explanation
  await sites.getByRole('textbox', { name: 'כתובת החיפוש באתר' }).fill('https://shirim.example/about')
  await sites.getByRole('button', { name: 'הוסף אתר' }).click()
  await expect(sites.getByText(/זו לא כתובת חיפוש/)).toBeVisible()
  // the address of a search for "test" becomes the site's search address
  await sites.getByRole('textbox', { name: 'שם האתר (לא חובה)' }).fill('שירים בעברית')
  await sites.getByRole('textbox', { name: 'כתובת החיפוש באתר' }).fill('https://shirim.example/search?q=test')
  await sites.getByRole('button', { name: 'הוסף אתר' }).click()
  await expect(sites.getByText('נוסף. החיפוש ישתמש בכתובת: https://shirim.example/search?q={q}')).toBeVisible()
  await expect.poll(() => backend.userMetadata.lyrics_sources).toEqual([{ name: 'שירים בעברית', url: 'https://shirim.example/search?q={q}' }])
  await sites.getByRole('textbox', { name: 'כתובת החיפוש באתר' }).fill('https://blocked.example/?s=test')
  await sites.getByRole('button', { name: 'הוסף אתר' }).click()
  await expect(panel.getByText('מחפש במאגר הפתוח ובעוד 2 אתרים שהגדרת.')).toBeVisible()

  await panel.getByRole('textbox', { name: 'שם השיר והזמר' }).fill('ירושלים של זהב')
  await panel.getByRole('button', { name: 'חפש', exact: true }).click()
  await expect.poll(() => backend.sourceSearches.at(-1)?.sources.length).toBe(2)
  const hit = panel.getByRole('radio', { name: /ירושלים של זהב - מילים/ })
  await expect(hit).toContainText('shirim.example')
  await hit.click()
  await expect(panel.locator('textarea')).toHaveValue('שורה מהאתר שלי\nועוד שורה')
  await expect(panel.getByRole('link', { name: /פתח את הדף באתר/ })).toHaveAttribute('href', 'https://shirim.example/song/1')
  // a site that blocks automatic searches offers its own search page instead
  const missed = page.getByTestId('sources-missed')
  await expect(missed).toContainText('blocked.example חוסם חיפוש אוטומטי.')
  await expect(missed.getByRole('link')).toHaveAttribute('href', /blocked\.example\/\?s=/)

  await sites.getByRole('button', { name: 'הסר את blocked.example' }).click()
  await expect.poll(() => (backend.userMetadata.lyrics_sources as unknown[]).length).toBe(1)
})
