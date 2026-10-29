/**
 * Installability (Android/desktop "Install app", iPhone "Add to Home Screen")
 * and offline start-up of the app shell.
 */
import { expect, test } from './fixtures'

test.use({ serviceWorkers: 'allow', signedIn: false })
test('web app manifest is complete and its icons load', async ({ page, request, backend }) => {
  void backend
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'KaraokeSync AI', display: 'standalone', start_url: '/', lang: 'he', dir: 'rtl' })
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']))
  for (const icon of manifest.icons) {
    const resp = await request.get(`/${icon.src}`)
    expect(resp.status()).toBe(200)
    expect(resp.headers()['content-type']).toContain('image/png')
  }
})

test('iPhone home-screen support', async ({ page, request, backend }) => {
  void backend
  await page.goto('/')
  const touchIcon = await page.locator('link[rel=apple-touch-icon]').getAttribute('href')
  expect((await request.get(touchIcon!)).status()).toBe(200)
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#07060f')
})

test('Chrome reports the app as installable', async ({ page, backend }) => {
  void backend
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  expect(installabilityErrors).toEqual([])
})

test('the app shell opens offline after the first visit', async ({ page, context, backend }) => {
  void backend
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.goto('/projects') // a deep link, served by the cached index.html
  await expect(page.locator('header')).toBeVisible()
  await context.setOffline(false)
})
