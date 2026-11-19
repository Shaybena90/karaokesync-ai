import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Anything prefixed with VITE_ is shipped to every browser.
  for (const key of Object.keys(env)) {
    if (/SERVICE|SECRET|PRIVATE/i.test(key)) throw new Error(`${key} looks like a secret and must not be prefixed with VITE_.`)
  }
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt': a new version waits until the player agrees and no game is open (src/ui/UpdateBanner.tsx).
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'הכספת — טריוויה ותעלומות',
          short_name: 'הכספת',
          description: 'כל תשובה מקרבת אותך לפיצוח',
          lang: 'he',
          dir: 'rtl',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#050b1f',
          theme_color: '#0a1430',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // The whole game (code, content, fonts, art) is precached → works offline after the first visit.
          globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: { port: 5174 },
    preview: { port: 4174 },
  }
})
