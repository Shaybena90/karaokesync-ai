import { expect, test } from '@playwright/test'
import { getRoom } from '../src/escape/rooms'
import { doStep, onboard } from './helpers'
import { lightGraphics } from './fixtures'

// Co-op over the same-browser transport (BroadcastChannel). It drives the same
// session logic as the online (Supabase) transport.
test('co-op: create a room, a friend joins by link, progress is shared, the host can leave, the team escapes', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once')
  test.setTimeout(150_000)
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await ctx.addInitScript(() => localStorage.setItem('hakasefet:net', 'local'))
  await lightGraphics(ctx)
  const a = await ctx.newPage()
  await a.goto('./')
  await onboard(a, 'דנה', '🦊')

  await a.getByRole('link', { name: /משחק עם חברים/ }).click()
  await a.getByRole('link', { name: 'בחירת חדר' }).click()
  await a.getByRole('button', { name: 'פתיחת חדר לצוות' }).first().click()
  await expect(a.getByRole('heading', { name: 'חדר ההמתנה' })).toBeVisible()
  const code = (await a.getByTestId('room-code').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{5}$/)
  const link = await a.getByTestId('invite-link').inputValue()
  expect(link).toContain(`#/coop/${code}`)

  // a friend joins in another tab (a separate player)
  const b = await ctx.newPage()
  await b.goto(link)
  await expect(b.getByRole('heading', { name: 'חדר ההמתנה' })).toBeVisible()
  await expect(a.getByTestId('players').getByRole('listitem')).toHaveCount(2)
  await expect(b.getByText('מחכים שהמארח יתחיל')).toBeVisible()

  await a.getByRole('button', { name: /מתחילים!/ }).click()
  await expect(a.getByTestId('timer')).toBeVisible()
  await expect(b.getByTestId('timer')).toBeVisible()

  const lab = getRoom('lab')!
  // B opens the drawer; A sees it in the team feed and takes what's inside
  await doStep(b, 'lab', lab.walkthrough[0])
  await expect(a.getByText(/המגירה נפתחה!/).first()).toBeVisible()
  await doStep(a, 'lab', lab.walkthrough[1])
  await expect(b.getByLabel('התיק')).toContainText('פנס UV')

  // the host leaves — B takes over and the game goes on
  await a.close()
  await b.waitForTimeout(6000)
  for (const s of lab.walkthrough.slice(2)) await doStep(b, 'lab', s)
  await expect(b.getByRole('heading', { name: 'ברחתם!' })).toBeVisible({ timeout: 20_000 })
  await ctx.close()
})
