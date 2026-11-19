import { expect, test } from '@playwright/test'
import { noHorizontalScroll, onboard, today } from './helpers'

test('challenge link with an unknown content version shows a clear message', async ({ page }) => {
  await page.goto(`./#/challenge?v=1999.1&d=${today()}&l=n&o=smg`)
  await onboard(page)
  await expect(page.getByText('לא הצלחנו לפתוח את האתגר')).toBeVisible()
  await expect(page.getByText(/גרסת תוכן שלא זמינה/)).toBeVisible()
  await page.getByRole('link', { name: 'לכספת של היום' }).click()
  await expect(page.getByText('הכספת של היום ·')).toBeVisible()
})

test('timer keeps running across a refresh and a timed-out question waits for "continue"', async ({ page }) => {
  await page.clock.install()
  await page.goto('./')
  await onboard(page)
  await page.getByRole('link', { name: 'לכספת של היום' }).click()
  await page.getByRole('button', { name: 'מתחילים לפצח' }).click()
  await page.getByRole('button', { name: /^מאתגר/ }).click()
  await page.getByRole('button', { name: 'חדר הידע' }).click()
  await expect(page.locator('#qtext')).toBeVisible()
  await page.clock.fastForward(12_000)
  await page.reload()
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /נותרו 1[78] שניות/)
  await page.clock.fastForward(20_000)
  await expect(page.getByText('⏰ נגמר הזמן')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ממשיכים', exact: true })).toBeVisible()
})

test('layout fits small phones and the archive / profile screens work', async ({ page }, info) => {
  await page.goto('./')
  await onboard(page)
  await noHorizontalScroll(page)
  await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true })
  await page.getByRole('link', { name: 'ארכיון' }).first().click()
  await expect(page.getByRole('heading', { name: /ארכיון הכספות/ })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(7 + 5) // 7 vaults + 5 nav items
  await noHorizontalScroll(page)
  await page.getByRole('link', { name: 'פרופיל' }).last().click()
  await expect(page.getByText('ההתקדמות נשמרת במכשיר הזה')).toBeVisible()
  await page.getByRole('switch', { name: /צלילים/ }).click()
  await expect(page.getByRole('switch', { name: /צלילים/ })).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('button', { name: 'איפוס כל הנתונים' }).click()
  await page.getByRole('button', { name: 'כן, למחוק הכול' }).click()
  await expect(page.getByRole('heading', { name: 'ברוכים הבאים להכספת' })).toBeVisible()
})

test('works offline after the first visit cached the app', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough')
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await onboard(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('link', { name: 'לכספת של היום' })).toBeVisible()
  await page.getByRole('link', { name: 'לכספת של היום' }).click()
  await page.getByRole('button', { name: 'מתחילים לפצח' }).click()
  await page.getByRole('button', { name: /^רגיל/ }).click()
  await page.getByRole('button', { name: 'חדר המוזיקה' }).click()
  await expect(page.locator('#qtext')).toBeVisible()
  await context.setOffline(false)
})
