// Renders the PWA icons from inline SVG with the preinstalled Playwright Chromium.
// Usage: npm run icons
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#a87720"/></linearGradient>
  <radialGradient id="bg" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#1d3270"/><stop offset="1" stop-color="#050b1f"/></radialGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <rect x="56" y="56" width="400" height="400" rx="64" fill="#1f3470" stroke="url(#g)" stroke-width="18"/>
    <circle cx="256" cy="256" r="110" fill="#0d1838" stroke="url(#g)" stroke-width="18"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `<line x1="${256 + Math.cos(a) * 78}" y1="${256 + Math.sin(a) * 78}" x2="${256 + Math.cos(a) * 96}" y2="${256 + Math.sin(a) * 96}" stroke="#f2c14e" stroke-width="8"/>` }).join('')}
    <circle cx="256" cy="256" r="30" fill="url(#g)"/>
    <rect x="246" y="158" width="20" height="52" rx="10" fill="#ffe9a8"/>
    <rect x="400" y="216" width="26" height="80" rx="10" fill="url(#g)"/>
  </g></svg>`

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size, pad] of [['pwa-192.png', 192, 0], ['pwa-512.png', 512, 0], ['pwa-maskable-512.png', 512, 70], ['apple-touch-icon.png', 180, 30]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0">${svg(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: path.join(out, name), omitBackground: false })
  console.log('wrote', name)
}
await browser.close()
