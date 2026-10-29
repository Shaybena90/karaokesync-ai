import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a production build (vite preview), with Supabase
 * and the Python API replaced by an in-browser mock (e2e/fixtures.ts).
 *
 * Device emulation uses Chromium for every profile (viewport, pixel density,
 * touch, mobile user agent). It catches layout and touch problems, but it is
 * not a real Safari: see docs/TESTING.md for the manual real-device checklist.
 */
const PORT = 4173

// iPhone / iPad profiles default to WebKit; run them on Chromium.
const chromium = <T extends object>(d: T) => ({ ...d, browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const })

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    // A service worker would see requests before the mocks; only the PWA spec enables it.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
      // UTF-8 locale so downloads keep their Hebrew file names on minimal Linux images.
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    },
  },
  projects: [
    // PWA checks run once (desktop); accessibility on desktop + the smallest phone.
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'iphone-se', use: chromium(devices['iPhone SE']), testIgnore: /pwa\.spec/ },
    { name: 'iphone-15-pro-max', use: chromium(devices['iPhone 15 Pro Max']), testIgnore: /(pwa|a11y)\.spec/ },
    { name: 'pixel-7', use: devices['Pixel 7'], testIgnore: /(pwa|a11y)\.spec/ },
    { name: 'galaxy-s8', use: devices['Galaxy S8'], testIgnore: /(pwa|a11y)\.spec/ },
    { name: 'ipad-mini', use: chromium(devices['iPad Mini']), testIgnore: /(pwa|a11y)\.spec/ },
    { name: 'phone-landscape', use: devices['Pixel 7 landscape'], testIgnore: /(pwa|a11y)\.spec/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://e2e.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-public-anon-key',
      VITE_API_URL: 'http://api.e2e.test',
      VITE_ENABLE_GOOGLE_AUTH: 'false',
    },
  },
})
