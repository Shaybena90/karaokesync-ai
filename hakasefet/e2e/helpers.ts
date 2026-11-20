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
  await page.getByRole('tab', { name: new RegExp(scene.name) }).click()
  await hotspot(page, h.name).click()
  await expect(page.getByRole('dialog', { name: h.name })).toBeVisible()
  return h
}

/** Perform one walkthrough step through the real UI. */
export async function doStep(page: Page, roomId: string, step: WalkStep) {
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
      for (const ch of step.input.replace(/ם/g, 'מ')) await dlg.getByRole('button', { name: ch, exact: true }).click()
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
    } else if (lock.kind === 'switches') {
      for (let i = 0; i < step.input.length; i++) if (step.input[i] === '1') await dlg.getByRole('switch', { name: `מתג ${i + 1}` }).click()
      await dlg.getByRole('button', { name: 'הפעלה' }).click()
    } else {
      await dlg.getByLabel(/הקלידו תשובה/).fill(step.input)
      await dlg.getByLabel(/הקלידו תשובה/).press('Enter')
    }
  }
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
