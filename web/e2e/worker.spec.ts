import { expect, PID, test } from './fixtures'

test('the owner sees the processing server and pauses it from the phone', async ({ page, backend }) => {
  backend.workerStatus.admin = true
  await page.goto('/projects')
  await page.getByRole('link', { name: /שרת העיבוד: 🟢 פעיל/ }).click()
  await expect(page).toHaveURL(/\/worker$/)
  await expect(page.getByText('STUDIO')).toBeVisible()
  await expect(page.getByText('GPU (NVIDIA RTX A5000) · מזהה מילים בשיר')).toBeVisible()

  await page.getByRole('button', { name: /השהיית העיבוד/ }).click()
  await expect(page.getByRole('status').first()).toContainText('מושהה')
  expect(backend.workerStatus.paused).toBe(true)
  await page.getByRole('button', { name: /המשך עיבוד/ }).click()
  await expect(page.getByRole('status').first()).toContainText('פעיל')
  expect(backend.workerStatus.paused).toBe(false)
})

test('other users see the status but cannot control it', async ({ page, backend }) => {
  backend.workerStatus.online = false
  await page.goto('/worker')
  await expect(page.getByRole('status').first()).toContainText('כבוי')
  await expect(page.getByRole('button', { name: /השהיית העיבוד|המשך עיבוד/ })).toHaveCount(0)
  await expect(page.getByText('STUDIO')).toHaveCount(0) // computer names are for the owner only
})

test('a waiting song explains that the processing server is off', async ({ page, backend }) => {
  backend.workerStatus.online = false
  Object.assign(backend.project(), { status: 'queued' })
  backend.jobs.push({ id: 'J1', project_id: PID, status: 'queued', stage: 'queued', progress: 0, attempts: 0, max_attempts: 3,
    error_code: null, created_at: new Date().toISOString() })
  await page.goto(`/projects/${PID}`)
  await expect(page.getByText('שרת העיבוד כבוי כרגע. השיר יעובד אוטומטית כשהוא יחזור לפעול.')).toBeVisible()
})
