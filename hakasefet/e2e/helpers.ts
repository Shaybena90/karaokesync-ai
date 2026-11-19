import { expect, type Page } from '@playwright/test'
import { currentPack } from '../src/content'
import type { Question } from '../src/content/types'
import { israelDate } from '../src/engine/date'
import { mysteryForDate } from '../src/engine/selection'

export const pack = currentPack()
export const today = () => israelDate()
export const todaysMystery = () => mysteryForDate(pack, today())

export function questionByText(text: string): Question {
  const q = pack.questions.find((x) => x.text === text.trim())
  if (!q) throw new Error(`question not found: ${text}`)
  return q
}

export async function onboard(page: Page, nick = 'דנה', avatar = '🦉') {
  await expect(page.getByRole('heading', { name: 'ברוכים הבאים להכספת' })).toBeVisible()
  await page.getByLabel('איך לקרוא לך?').fill(nick)
  await page.getByRole('button', { name: `אווטאר ${avatar}` }).click()
  await page.getByRole('button', { name: 'ממשיכים' }).click()
  await page.getByRole('button', { name: 'יאללה, לכספת!' }).click()
  await expect(page.getByRole('heading', { name: 'ברוכים הבאים להכספת' })).toBeHidden()
}

export async function currentQuestion(page: Page): Promise<Question> {
  const text = await page.locator('#qtext').innerText()
  return questionByText(text)
}

const optionButton = (page: Page, text: string) => page.locator('button', { hasText: text }).filter({ has: page.locator('span.flex-1', { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) })

export async function answer(page: Page, correct: boolean) {
  const q = await currentQuestion(page)
  const right = q.options.find((o) => o.id === q.answerId)!
  if (correct) {
    await optionButton(page, right.text).click()
    await expect(page.getByText('✓ נכון!')).toBeVisible()
  } else {
    // choose a wrong option that is still visible
    for (const o of q.options.filter((x) => x.id !== q.answerId)) {
      const b = optionButton(page, o.text)
      if (await b.isVisible()) {
        await b.click()
        break
      }
    }
    await expect(page.getByText('✗ לא הפעם')).toBeVisible()
  }
  return q
}

export async function continueOn(page: Page) {
  await page.getByRole('button', { name: 'ממשיכים', exact: true }).click()
}

export async function finishRoom(page: Page) {
  await expect(page.getByText(/הושלם — נחשף רמז/)).toBeVisible()
  await page.getByRole('button', { name: /ממשיכים לחדר הבא|ללוח החקירה/ }).click()
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0)
}
