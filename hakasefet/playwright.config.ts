import { defineConfig, devices } from '@playwright/test'

const PORT = 4174

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'phone-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
