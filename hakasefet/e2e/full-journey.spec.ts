import { expect, test } from '@playwright/test'
import { answer, continueOn, currentQuestion, finishRoom, noHorizontalScroll, onboard, todaysMystery } from './helpers'

test('guest → full vault with a mistake, 50/50, refresh, wrong code → reward → share → friend opens the same challenge → buy a room item', async ({ page, browser, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'full journey runs once, on desktop')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // Force the copy fallback (desktop Chromium has no share sheet in tests).
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }))
  const mystery = todaysMystery()

  await page.goto('./')
  await onboard(page)

  // Home → intro
  await expect(page.getByRole('heading', { name: new RegExp(mystery.title) })).toBeVisible()
  await page.getByRole('link', { name: 'לכספת של היום' }).click()
  await expect(page.getByText(mystery.teaser)).toBeVisible()
  await page.getByRole('button', { name: 'מתחילים לפצח' }).click()

  // Level
  await page.getByRole('button', { name: /^רגיל/ }).click()

  // Room 1: sports — one mistake, then 50/50 + correct
  await page.getByRole('button', { name: 'חדר הספורט' }).click()
  const firstQ = await currentQuestion(page)
  await answer(page, false)
  await expect(page.getByTestId('score')).toHaveText('0')
  await continueOn(page)
  await page.getByRole('button', { name: /חצי־חצי/ }).click()
  await expect(page.locator('button[aria-hidden="true"]')).toHaveCount(2)
  await expect(page.getByTestId('score')).toHaveText('0') // floor at zero
  await answer(page, true)
  const afterSports = Number(await page.getByTestId('score').innerText())
  expect(afterSports).toBeGreaterThanOrEqual(100)
  await continueOn(page)
  await finishRoom(page)

  // Room 2: music — refresh in the middle restores the same game
  await page.getByRole('button', { name: 'חדר המוזיקה' }).click()
  const q3 = await answer(page, true)
  const scoreBefore = await page.getByTestId('score').innerText()
  await page.reload()
  await expect(page.locator('#qtext')).toHaveText(q3.text)
  await expect(page.getByText('✓ נכון!')).toBeVisible()
  await expect(page.getByTestId('score')).toHaveText(scoreBefore)
  await continueOn(page)
  await answer(page, true)
  await continueOn(page)
  await finishRoom(page)

  // The clue board is reachable during the game
  await page.getByRole('button', { name: /^לוח הרמזים:/ }).click()
  await expect(page.getByRole('dialog', { name: 'לוח הרמזים' })).toContainText(mystery.clues.sports.title)
  await page.getByRole('button', { name: 'סגירה' }).click()

  // Room 3: general
  await page.getByRole('button', { name: 'חדר הידע' }).click()
  await answer(page, true)
  await continueOn(page)
  await answer(page, true)
  await continueOn(page)
  await finishRoom(page)

  // Board: wrong code then the right one
  await expect(page.getByRole('heading', { name: 'לוח החקירה' })).toBeVisible()
  const score = Number(await page.getByTestId('score').innerText())
  const wrong = mystery.code === '1111' ? '2222' : '1111'
  await page.getByLabel('הקוד הסופי').fill(wrong)
  await page.getByRole('button', { name: 'פתיחה' }).click()
  await expect(page.getByRole('alert')).toContainText('לא פותח')
  await expect(page.getByTestId('score')).toHaveText(String(Math.max(0, score - 20)))
  await page.getByLabel('הקוד הסופי').fill(mystery.code)
  await page.getByRole('button', { name: 'פתיחה' }).click()

  // Results + reward
  await expect(page.getByRole('heading', { name: 'הכספת נפתחה!' })).toBeVisible()
  await expect(page.getByText('5/6')).toBeVisible()
  await expect(page.getByTestId('rewards')).toContainText('+100 XP')
  await expect(page.getByTestId('rewards')).toContainText('+20 מטבעות')
  await expect(page.getByText(mystery.explanation)).toBeVisible()
  const finalScore = await page.getByTestId('final-score').innerText()
  await expect(page.getByTestId('share-text')).toContainText(`עם ${finalScore} נקודות`)

  // Refreshing the result page does not grant again
  await page.reload()
  await expect(page.getByRole('heading', { name: 'הכספת נפתחה!' })).toBeVisible()
  await expect(page.getByLabel('20 מטבעות', { exact: true })).toBeVisible()

  // Share → clipboard (success message only after the copy succeeded)
  await page.getByRole('button', { name: 'שיתוף האתגר' }).click()
  await expect(page.getByText('הטקסט והקישור הועתקו')).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('פתחתי את הכספת ב־')
  const url = clip.split('\n')[1]
  expect(url).toContain('#/challenge?')
  expect(url).not.toContain(mystery.code)
  expect(url).not.toContain('דנה')
  expect(url).toMatch(/o=smg$/)

  // A friend opens the link in a separate browser context
  const friendCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  const friend = await friendCtx.newPage()
  await friend.goto(url)
  await onboard(friend, 'יואב', '🐯')
  await expect(friend.getByText('קיבלתם אתגר מחבר')).toBeVisible()
  await expect(friend.getByRole('heading', { name: new RegExp(mystery.title) })).toBeVisible()
  await friend.getByRole('button', { name: 'מתחילים לפצח' }).click()
  // Level is fixed by the link; only the sender's first room is open
  await expect(friend.getByRole('button', { name: 'חדר הספורט' })).toBeEnabled()
  await expect(friend.getByRole('button', { name: /חדר המוזיקה/ })).toBeDisabled()
  await friend.getByRole('button', { name: 'חדר הספורט' }).click()
  await expect(friend.locator('#qtext')).toHaveText(firstQ.text)
  await friendCtx.close()

  // Buy a room item with the 20 coins
  await page.getByRole('link', { name: 'החדר שלי' }).click()
  await page.getByRole('button', { name: /תצוגה מקדימה וקנייה: קקטוס קטן/ }).click()
  await expect(page.getByText('תצוגה מקדימה:')).toBeVisible()
  await page.getByRole('button', { name: /^קנייה/ }).click()
  await expect(page.getByText('קקטוס קטן נקנה ונכנס לחדר!')).toBeVisible()
  await expect(page.getByLabel('0 מטבעות', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'הסרה: קקטוס קטן' })).toBeVisible()
  await noHorizontalScroll(page)

  // Mistake shows up in "ההזדמנות לתקן"
  await page.getByRole('link', { name: 'לתקן' }).click()
  await expect(page.getByText(firstQ.text)).toBeVisible()
})
