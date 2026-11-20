import { expect, test } from '@playwright/test'
import { COLLECTION, getRoom } from '../src/escape/rooms'
import type { WalkStep } from '../src/escape/types'
import { doStep, noHorizontalScroll, onboard } from './helpers'
import { lightGraphics } from './fixtures'

test.beforeEach(async ({ page }) => lightGraphics(page))

test('the catalog lists all seven rooms, reachable from the nav and the home screen', async ({ page }) => {
  await page.goto('./')
  await onboard(page)
  await expect(page.getByRole('link', { name: 'לחדרי הבריחה' })).toBeVisible()
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: /חדרי בריחה/ }).click()
  await expect(page.getByRole('heading', { name: 'חדרי בריחה', exact: true })).toBeVisible()
  const cards = page.getByTestId('catalog').locator('[data-room]')
  await expect(cards).toHaveCount(7)
  for (const r of COLLECTION) await expect(page.getByTestId('catalog')).toContainText(r.title)
  await expect(page.getByTestId('catalog')).toContainText('שני צדדים של הדלת')
  await noHorizontalScroll(page)
})

for (const room of COLLECTION) {
  test(`room "${room.title}": wrong answer, hint, refresh, full solve, score and explanations`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop' && room.id !== 'phone', 'full runs on desktop; the phone room also on a small screen')
    test.setTimeout(180_000)
    await page.goto('./')
    await onboard(page)
    await page.goto(`./#/solo/${room.id}`)
    await expect(page.getByRole('heading', { name: new RegExp(room.title) })).toBeVisible()
    if (room.timer || room.loop) await page.getByRole('radio', { name: /אימון/ }).click()
    await page.getByRole('button', { name: 'מתחילים' }).click()
    await expect(page.getByTestId('points')).toHaveText(/1000/)

    // a hint costs 50 points
    await page.getByRole('button', { name: /רמזים/ }).click()
    await page.getByRole('button', { name: /רמז 1 מתוך 3/ }).click()
    await expect(page.getByRole('dialog')).toContainText(room.puzzles![0].hints[0])
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('points')).toHaveText(/950/)

    const steps = room.walkthrough
    const half = Math.floor(steps.length / 2)
    let wrongDone = false
    for (const [i, s] of steps.entries()) {
      if (i === half) {
        await page.reload()
        await expect(page.getByTestId('points')).toHaveText(/9\d\d/)
      }
      if (!wrongDone && 'solve' in s && getRoom(room.id)!.hotspots.find((h) => h.id === s.solve)!.interactions.some((x) => x.type === 'lock' && x.lock.kind === 'digits')) {
        // one wrong submission (−25), then the real one
        const lock = getRoom(room.id)!.hotspots.find((h) => h.id === s.solve)!.interactions.find((x) => x.type === 'lock')!
        if (lock.type === 'lock' && lock.lock.kind === 'digits') {
          const wrong = (s.input[0] === '9' ? '1' : '9').repeat(lock.lock.length)
          await doStep(page, room.id, { solve: s.solve, input: wrong } as WalkStep, { wrong: true })
          await expect(page.getByRole('dialog').getByRole('alert')).toContainText('✗')
          await page.keyboard.press('Escape')
          wrongDone = true
        }
      }
      await doStep(page, room.id, s)
    }
    await expect(page.getByRole('heading', { name: 'ברחתם!' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('score')).toContainText(wrongDone ? '925' : '950')
    await expect(page.getByTestId('rewards')).toContainText('פרס סיום ראשון')
    await page.getByTestId('explanations').locator('summary').click()
    await expect(page.getByTestId('explanations')).toContainText(room.puzzles![5].solution)
    await noHorizontalScroll(page)
  })
}

test('the timed vault keeps its clock across a refresh', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.goto('./')
  await onboard(page)
  await page.goto('./#/solo/bank')
  await page.getByRole('button', { name: 'מתחילים' }).click()
  await expect(page.getByTestId('timer')).toHaveText(/^(20:00|19:5\d)$/)
  await expect(page.getByTestId('pressure')).toBeAttached()
  await page.waitForTimeout(2200)
  await page.reload()
  await expect(page.getByTestId('timer')).toHaveText(/^19:5[0-8]$/)
})
