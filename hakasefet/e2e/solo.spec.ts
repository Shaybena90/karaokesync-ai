import { expect, test } from '@playwright/test'
import { getRoom } from '../src/escape/rooms'
import { doStep, hotspot, noHorizontalScroll, onboard } from './helpers'
import { lightGraphics } from './fixtures'

test.beforeEach(async ({ page }) => lightGraphics(page))

test('solo: escape the lab — wrong code, refresh mid-game, hint, rewards, then buy a room item', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the full run is checked once, on desktop')
  test.setTimeout(120_000)
  const lab = getRoom('lab')!
  await page.goto('./')
  await onboard(page)
  await page.getByRole('link', { name: /משחק לבד/ }).click()
  await page.getByRole('link', { name: 'לבד' }).first().click()
  await expect(page.getByRole('heading', { name: /המעבדה של ד״ר נוי/ })).toBeVisible()
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await expect(page.getByTestId('timer')).toHaveText(/^(30:00|29:5\d)$/)

  // a locked computer explains itself
  await hotspot(page, 'המחשב').click()
  await expect(page.getByRole('dialog')).toContainText('אין חשמל')
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).last().click()

  // wrong code first
  await hotspot(page, 'המגירה').click()
  for (const d of '123') await page.getByRole('dialog').getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'אישור' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('לא נכון')
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click()

  const steps = lab.walkthrough
  for (const s of steps.slice(0, 4)) await doStep(page, 'lab', s)

  // refresh keeps everything
  await page.reload()
  await expect(page.getByLabel('התיק')).toContainText('נתיך')

  // a hint costs a minute
  await page.getByRole('button', { name: /רמזים/ }).click()
  await page.getByRole('button', { name: /רמז חדש/ }).click()
  await expect(page.getByRole('dialog')).toContainText('הנתיך שייך לארון החשמל')
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).click()

  for (const s of steps.slice(4)) await doStep(page, 'lab', s)
  await expect(page.getByRole('heading', { name: 'ברחתם!' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('rewards')).toContainText('+150 XP')
  await expect(page.getByTestId('rewards')).toContainText('+50 מטבעות')

  // refreshing the result never grants twice
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ברחתם!' })).toBeVisible()
  await expect(page.getByLabel('50 מטבעות', { exact: true })).toBeVisible()

  // spend coins in "החדר שלי"
  await page.getByRole('link', { name: 'פרופיל' }).first().click()
  await page.goto('./#/room')
  await page.getByRole('button', { name: /תצוגה מקדימה וקנייה: שטיח מלכותי/ }).click()
  await page.getByRole('button', { name: /^קנייה/ }).click()
  await expect(page.getByText('שטיח מלכותי נקנה ונכנס לחדר!')).toBeVisible()
  await expect(page.getByLabel('0 מטבעות', { exact: true })).toBeVisible()
  await noHorizontalScroll(page)
})

test('phone layout fits 360px; offline play works after the first visit', async ({ page, context }, info) => {
  await page.goto('./')
  if (info.project.name === 'desktop') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  }
  await onboard(page)
  await noHorizontalScroll(page)
  if (info.project.name === 'desktop') {
    await context.setOffline(true)
    await page.reload()
  }
  await page.getByRole('link', { name: /משחק לבד/ }).click()
  await noHorizontalScroll(page)
  await page.getByRole('link', { name: 'לבד' }).nth(1).click()
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await expect(hotspot(page, 'יומן הקברניט')).toBeVisible()
  await noHorizontalScroll(page)
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true })
  await context.setOffline(false)
})

test('the 3D room renders on high graphics and its objects are clickable', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'once')
  test.setTimeout(150_000)
  const ctx = await browser.newContext({ locale: 'he-IL' })
  await lightGraphics(ctx, 'high')
  const page = await ctx.newPage()
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/solo/museum')
  await page.getByRole('button', { name: /מתחילים/ }).click({ timeout: 30_000 })
  await expect(page.locator('[data-testid=scene-3d][data-ready=true]')).toBeVisible({ timeout: 60_000 })
  await hotspot(page, 'ציור במסגרת ירוקה').click({ timeout: 60_000 })
  await expect(page.getByRole('dialog', { name: 'ציור במסגרת ירוקה' })).toContainText('1831')
  await ctx.close()
})
