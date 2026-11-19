import type { BrowserContext, Page } from '@playwright/test'

/** Long flow tests use the 2D view (the test browser has no GPU); a separate test checks the 3D room. */
export async function lightGraphics(target: Page | BrowserContext, graphics: 'normal' | 'high' | '2d' = '2d') {
  await target.addInitScript((g) => {
    if (!localStorage.getItem('hakasefet:prefs')) localStorage.setItem('hakasefet:prefs', JSON.stringify({ sound: false, reducedMotion: false, graphics: g }))
  }, graphics)
}
