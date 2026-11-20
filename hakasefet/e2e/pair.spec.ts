import { expect, test, type Page } from '@playwright/test'
import { onboard } from './helpers'
import { lightGraphics } from './fixtures'

async function digits(page: Page, code: string) {
  for (const d of code) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'אישור' }).click()
}
const stage = (page: Page, n: number, name: string) => expect(page.getByRole('heading', { name: `שלב ${n}: ${name}` })).toBeVisible()

test('two players on two devices: invite, ready, per-role views, wrong answer, reconnect, exit together', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'two browsers once, on desktop')
  test.setTimeout(120_000)
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  await lightGraphics(ctxA)
  await lightGraphics(ctxB)
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  await a.goto('./')
  await onboard(a, 'דנה', '🦉')
  await a.goto('./#/pair')
  await a.getByRole('button', { name: /פתיחת חדר חדש/ }).click()
  await expect(a.getByTestId('my-role')).toHaveText('צד א׳')
  const code = (await a.getByTestId('pair-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{5}$/)
  expect(a.url()).toContain(`/pair/${code}`)

  // the invite link joins as side B
  await b.goto(`./#/pair/${code}`)
  await onboard(b, 'יוסי', '🦊')
  await expect(b.getByTestId('my-role')).toHaveText('צד ב׳')
  await expect(a.getByTestId('waiting')).toContainText('מחובר')

  // a third device gets "full", a wrong code gets "not found"
  const ctxC = await browser.newContext()
  await lightGraphics(ctxC)
  const c = await ctxC.newPage()
  await c.goto('./')
  await onboard(c, 'רון', '🐼')
  await c.goto(`./#/pair/${code}`)
  await expect(c.getByTestId('pair-error')).toContainText('החדר מלא')
  await c.goto('./#/pair/ZZZZ9')
  await expect(c.getByTestId('pair-error')).toContainText('הקוד לא נמצא')
  await ctxC.close()

  await a.getByRole('button', { name: /אני מוכן/ }).click()
  await expect(b.getByTestId('waiting')).toContainText('✓ מוכן')
  await b.getByRole('button', { name: /אני מוכן/ }).click()

  // stage 1: A has the map, B has the legend and the input
  await stage(a, 1, 'המפה והמקרא')
  await expect(a.getByTestId('pair-board')).toContainText('מגדלור')
  await expect(a.getByTestId('pair-board')).not.toContainText('מאיר בלילה')
  await expect(b.getByTestId('pair-board')).not.toContainText('מגדלור')
  await expect(a.getByRole('button', { name: 'ג3' })).toHaveCount(0)
  await b.getByRole('button', { name: 'א1', exact: true }).click()
  await expect(b.getByRole('alert')).toContainText('✗')
  await expect(a.getByTestId('points')).toContainText('975')
  await b.getByRole('button', { name: 'ג3', exact: true }).click()

  // stage 2: A types the code
  await stage(b, 2, 'קלפים בצבעים')
  await digits(a, '9742')

  // B drops and comes back with the same role
  await stage(b, 3, 'מדים ומתגים')
  await b.reload()
  await expect(b.getByTestId('pair-board')).toHaveAttribute('data-role', 'B')
  await stage(b, 3, 'מדים ומתגים')

  await b.getByRole('switch', { name: 'מתג 1' }).click()
  await b.getByRole('switch', { name: 'מתג 4' }).click()
  await b.getByRole('button', { name: 'הפעלה' }).click()

  await stage(a, 4, 'צלילים ואותיות')
  await a.getByLabel(/הקלידו תשובה/).fill('שלום')
  await a.getByLabel(/הקלידו תשובה/).press('Enter')

  await stage(b, 5, 'שני חצאים')
  await b.getByLabel(/הקלידו תשובה/).fill('חירות')
  await b.getByLabel(/הקלידו תשובה/).press('Enter')

  // stage 6: each side gets the other's code
  await stage(a, 6, 'הדלת')
  await expect(a.getByTestId('pair-board')).toContainText('הקוד לצד ב׳: 2538')
  await expect(b.getByTestId('pair-board')).toContainText('הקוד לצד א׳: 6194')
  await digits(a, '6194')
  await expect(a.getByTestId('task')).toContainText('מחכים')
  await digits(b, '2538')

  await a.getByRole('button', { name: /יוצאים/ }).click()
  await expect(a.getByRole('button', { name: /מחכים שהשותף/ })).toBeVisible()
  await b.getByRole('button', { name: /יוצאים/ }).click()
  for (const p of [a, b]) {
    await expect(p.getByTestId('pair-result')).toBeVisible()
    await expect(p.getByTestId('score')).toContainText('975')
    await expect(p.getByTestId('rewards')).toContainText('פרס סיום ראשון')
  }
  await ctxA.close()
  await ctxB.close()
})

test('same-device practice is labelled and switches sides', async ({ page }) => {
  await lightGraphics(page)
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/pair-practice')
  await expect(page.getByTestId('practice-banner')).toContainText('אימון')
  await expect(page.getByTestId('pair-board')).toContainText('מגדלור')
  await page.getByRole('tab', { name: 'צד ב׳' }).click()
  await page.getByRole('button', { name: 'ג3', exact: true }).click()
  await stage(page, 2, 'קלפים בצבעים')
})
