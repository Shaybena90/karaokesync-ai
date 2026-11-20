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
  await page.goto('./#/rooms')
  // rooms are grouped by theme; the lab is under "מדע ודמיון"
  await page.getByRole('tab', { name: /מדע ודמיון/ }).click()
  await page.getByRole('link', { name: 'לבד' }).first().click()
  await expect(page.getByRole('heading', { name: /המעבדה של ד״ר נוי/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /בינוני/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await expect(page.getByTestId('timer')).toHaveText(/^(50:00|49:5\d)$/)

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
  await expect(page.getByTestId('rewards')).toContainText('+170 XP')
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
  await page.goto('./#/rooms')
  await noHorizontalScroll(page)
  await page.goto('./#/solo/station')
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

test('levels and themes: a historical room on the hard level — 40 minutes, vaguer clues, 3 hints', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once')
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/rooms')
  await expect(page.getByRole('heading', { name: /מחתרות/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /מלחמות ישראל/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /מלחמת העולם השנייה/ })).toBeVisible()
  await page.goto('./#/solo/ayalon')
  await expect(page.getByText(/מכון איילון/)).toBeVisible()
  await page.getByRole('radio', { name: /קשה/ }).click()
  await expect(page.getByText(/עד 3 רמזים/)).toBeVisible()
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await expect(page.getByTestId('timer')).toHaveText(/^(40:00|39:5\d)$/)
  await expect(page.getByText(/· קשה/)).toBeVisible()
  // hard wording of a clue
  await page.getByRole('tab', { name: 'משרד המפעל' }).click()
  await hotspot(page, 'מכונת הכתיבה').click()
  await expect(page.getByRole('dialog')).toContainText('בגליל — שורה אחת')
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).last().click()
  // the hint counter shows the limit
  await page.getByRole('button', { name: /רמזים/ }).click()
  await expect(page.getByRole('dialog')).toContainText('נשארו 3 מתוך 3 רמזים')
})

test('typing a code word: the text field keeps focus while the game timer ticks (phone keyboard stays open)', async ({ page }) => {
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/solo/museum')
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await page.getByRole('tab', { name: 'משרד השומר' }).click()
  await hotspot(page, 'מחשב האבטחה').click()
  const field = page.getByRole('dialog').getByLabel(/הקלידו תשובה/)
  await expect(field).toBeFocused()
  await page.waitForTimeout(1600) // the timer re-renders the game several times
  await expect(field).toBeFocused()
  await page.keyboard.type('18', { delay: 150 })
  await page.waitForTimeout(800)
  await page.keyboard.type('31', { delay: 150 })
  await expect(field).toHaveValue('1831')
  await expect(field).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('הלייזרים כבו!').first()).toBeVisible()
})

test('immersive puzzles: UV lens finds hidden ink; the whole factory room — light beam, radio dial, voice message — can be escaped', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once')
  test.setTimeout(180_000)
  await page.goto('./')
  await onboard(page)

  // UV lens in the lab: nothing until you sweep the lens over the right spot
  const lab = getRoom('lab')!
  await page.goto('./#/solo/lab')
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await doStep(page, 'lab', lab.walkthrough[0])
  await doStep(page, 'lab', lab.walkthrough[1])
  await page.getByRole('tab', { name: /מדפי הדגימות/ }).click()
  await hotspot(page, 'הפוסטר').click()
  const area = page.getByTestId('reveal')
  await expect(area).toBeVisible()
  const b = (await area.boundingBox())!
  await page.mouse.move(b.x + 8, b.y + 8)
  await page.waitForTimeout(900)
  await expect(page.getByText('פנס ה־UV חשף')).toHaveCount(0) // wrong spot: nothing yet
  await page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.7, { steps: 6 })
  await expect(page.getByText('פנס ה־UV חשף כתב סמוי על הפוסטר!').first()).toBeVisible()

  // the underground factory, end to end
  const ayalon = getRoom('ayalon')!
  await page.goto('./#/')
  await page.goto('./#/solo/ayalon')
  await page.getByRole('button', { name: /מתחילים/ }).click()
  for (const s of ayalon.walkthrough) {
    await doStep(page, 'ayalon', s)
    if ('solve' in s && s.solve === 'radio') {
      // the radio now plays the message; the transcript is available
      await hotspot(page, 'הרדיו').click()
      await expect(page.getByTestId('voice')).toContainText('שידור נכנס')
      // sound is off in tests, so the transcript is shown straight away
      await expect(page.getByTestId('voice')).toContainText('נון. יוד. סמך.')
      await expect(page.getByRole('dialog').getByRole('button', { name: /השמעה/ })).toBeVisible()
      await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).last().click()
    }
  }
  await expect(page.getByRole('heading', { name: 'ברחתם!' })).toBeVisible({ timeout: 20_000 })
})

test('photo room: the Palmach HQ photo is the room, its objects are clickable, and the room can be escaped', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the full run is checked once, on desktop')
  test.setTimeout(150_000)
  const room = getRoom('jerusalem')!
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/solo/jerusalem')
  await page.getByRole('button', { name: /מתחילים/ }).click()
  await expect(page.getByTestId('photo-scene')).toBeVisible()
  await expect(page.getByTestId('photo-scene').locator('img')).toHaveJSProperty('complete', true)
  expect(await page.getByTestId('photo-scene').locator('img').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(1672)
  for (const s of room.walkthrough) await doStep(page, 'jerusalem', s)
  await expect(page.getByRole('heading', { name: 'ברחתם!' })).toBeVisible({ timeout: 20_000 })
})
