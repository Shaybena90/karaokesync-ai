import { expect, type Page } from '@playwright/test'
import { getRoom } from '../src/escape/rooms'
import type { WalkStep } from '../src/escape/types'

export async function onboard(page: Page, nick = 'דנה', avatar = '🦉') {
  await expect(page.getByRole('heading', { name: 'ברוכים הבאים להכספת' })).toBeVisible()
  await page.getByLabel('איך לקרוא לך?').fill(nick)
  await page.getByRole('button', { name: `אווטאר ${avatar}` }).click()
  await page.getByRole('button', { name: 'ממשיכים' }).click()
  await page.getByRole('button', { name: 'יאללה, לכספת!' }).click()
  await expect(page.getByRole('heading', { name: 'ברוכים הבאים להכספת' })).toBeHidden()
}

export const hotspot = (page: Page, name: string) => page.locator(`[data-hotspot][aria-label="${name}"]`)

async function openHotspot(page: Page, roomId: string, id: string) {
  const room = getRoom(roomId)!
  const h = room.hotspots.find((x) => x.id === id)!
  const scene = room.scenes.find((s) => s.id === h.scene)!
  if (room.presentation === 'phone') {
    // in the room image: pick up the phone first
    const pick = page.locator('[data-hotspot][aria-label*="הטלפון של"]')
    if (await pick.isVisible()) {
      await pick.click()
      await expect(page.getByTestId('phone')).toBeVisible()
    }
    // go to the app: back to the home screen first, then the app icon (a lone lock screen has neither)
    const home = page.getByRole('button', { name: 'חזרה למסך הבית' })
    if (await home.isVisible()) await home.click()
    const app = page.getByRole('button', { name: new RegExp(`^${scene.name}( —|$)`) })
    if (await app.isVisible()) await app.click()
  } else {
    await page.getByRole('tab', { name: new RegExp(scene.name) }).click()
  }
  await hotspot(page, h.name).click()
  await expect(page.getByRole('dialog', { name: h.name })).toBeVisible()
  return h
}

/** Perform one walkthrough step through the real UI. */
export async function doStep(page: Page, roomId: string, step: WalkStep, opts: { wrong?: boolean } = {}) {
  const room = getRoom(roomId)!
  if ('reveal' in step) {
    const h = await openHotspot(page, roomId, step.reveal)
    const it = h.interactions.find((i) => i.type === 'reveal')!
    if (it.type !== 'reveal') throw new Error('no reveal')
    const area = page.getByTestId('reveal')
    const b = (await area.boundingBox())!
    const at = it.at ?? { x: 50, y: 60 }
    await page.mouse.move(b.x + 5, b.y + 5)
    await page.mouse.move(b.x + (b.width * at.x) / 100, b.y + (b.height * at.y) / 100, { steps: 8 })
  } else if ('read' in step) {
    await openHotspot(page, roomId, step.read)
    await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).last().click()
    return
  } else if ('act' in step) {
    const h = await openHotspot(page, roomId, step.act)
    const it = h.interactions.find((i) => i.type === 'action')!
    if (it.type !== 'action') throw new Error('no action')
    await page.getByRole('dialog').getByRole('button', { name: it.label }).click()
  } else if ('combine' in step) {
    const [a, b] = step.combine.map((id) => room.items.find((i) => i.id === id)!)
    await page.getByLabel('התיק').getByRole('button', { name: a.name }).click()
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(b.name.replace(/[()]/g, '.')) }).click()
    return
  } else if ('waitUntil' in step) {
    // press "wait" until the loop clock shows the wanted minute
    for (let i = 0; i < 8; i++) {
      const txt = (await page.getByTestId('loop-banner').getByRole('timer').getAttribute('aria-label')) ?? ''
      const minute = Number(/דקה (\d+)/.exec(txt)?.[1])
      const loop = Number(/לולאה (\d+)/.exec(txt)?.[1])
      if (minute === step.waitUntil) break
      await page.getByRole('button', { name: /המתנה לדקה הבאה/ }).click()
      await expect(page.getByTestId('loop-banner').getByRole('timer')).not.toHaveAttribute('aria-label', new RegExp(`לולאה ${loop}, דקה ${minute},`))
    }
    return
  } else if ('take' in step) {
    await openHotspot(page, roomId, step.take)
    await page.getByRole('button', { name: /לקחת:/ }).click()
  } else if ('use' in step) {
    await openHotspot(page, roomId, step.use)
    const item = room.items.find((i) => i.id === step.item)!
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(item.name) }).click()
  } else {
    const h = await openHotspot(page, roomId, step.solve)
    const it = h.interactions.find((i) => i.type === 'lock')!
    if (it.type !== 'lock') throw new Error('no lock')
    const dlg = page.getByRole('dialog')
    const lock = it.lock
    if (lock.kind === 'digits') {
      for (const ch of step.input) await dlg.getByRole('button', { name: ch, exact: true }).click()
      await dlg.getByRole('button', { name: 'אישור' }).click()
    } else if (lock.kind === 'letters') {
      for (const ch of step.input.replace(/[ךםןףץ]/g, (c) => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c]!)) await dlg.getByRole('button', { name: ch, exact: true }).click()
      await dlg.getByRole('button', { name: 'פתיחה' }).click()
    } else if (lock.kind === 'colors' || lock.kind === 'arrows') {
      const label: Record<string, string> = { red: 'אדום', green: 'ירוק', blue: 'כחול', yellow: 'צהוב', up: 'למעלה', down: 'למטה', left: 'שמאלה', right: 'ימינה' }
      // colour buttons are named by colour; arrow buttons are "↑ למעלה" etc.
      for (const v of step.input.split(',')) await dlg.getByRole('button', { name: new RegExp(`^(\\S+ )?${label[v]}$`) }).click()
      await dlg.getByRole('button', { name: 'פתיחה' }).click()
    } else if (lock.kind === 'tuner') {
      const range = dlg.locator('input[type=range]')
      await range.evaluate((el, v) => {
        const input = el as HTMLInputElement
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v))
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }, Number(step.input))
      await dlg.getByRole('button', { name: /קליטה/ }).click()
    } else if (lock.kind === 'choice') {
      const opt = lock.options.find((o) => o.id === step.input)!
      await dlg.getByRole('button', { name: opt.label, exact: true }).click()
    } else if (lock.kind === 'sequence') {
      for (const v of step.input.split(',')) await dlg.getByRole('button', { name: lock.options.find((o) => o.id === v)!.label, exact: true }).click()
      await dlg.getByRole('button', { name: 'פתיחה' }).click()
    } else if (lock.kind === 'multi') {
      for (const v of step.input.split(',')) await dlg.getByRole('checkbox', { name: lock.options.find((o) => o.id === v)!.label }).click()
      await dlg.getByRole('button', { name: /אישור/ }).click()
    } else if (lock.kind === 'accuse') {
      const [who, ev] = step.input.split('|')
      await dlg.getByRole('radio', { name: lock.suspects.find((o) => o.id === who)!.label }).click()
      for (const v of ev.split(',')) await dlg.getByRole('button', { name: `לצרף: ${lock.evidence.find((o) => o.id === v)!.label}` }).click()
      await dlg.getByRole('button', { name: /הגשה/ }).click()
    } else if (lock.kind === 'switches') {
      for (let i = 0; i < step.input.length; i++) if (step.input[i] === '1') await dlg.getByRole('switch', { name: `מתג ${i + 1}` }).click()
      await dlg.getByRole('button', { name: 'הפעלה' }).click()
    } else {
      await dlg.getByLabel(/הקלידו תשובה/).fill(step.input)
      await dlg.getByLabel(/הקלידו תשובה/).press('Enter')
    }
  }
  if (opts.wrong) return
  // success message, then close (unless the room was escaped and the screen changed)
  const cont = page.getByRole('button', { name: 'ממשיכים', exact: true })
  const escaped = page.getByRole('heading', { name: 'ברחתם!' })
  await expect(cont.or(escaped)).toBeVisible()
  if (await cont.isVisible()) await cont.click()
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0)
}
