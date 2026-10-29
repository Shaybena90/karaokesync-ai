/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// The single .env file lives in the repository root (one level up).
const envDir = '..'

const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : ''
  } catch {
    return ''
  }
}

/**
 * Content-Security-Policy for production builds: the page may only load code
 * from itself and talk to its own Supabase project and API. Built from the
 * same VITE_ variables, so every deployment gets the right addresses.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const supabase = origin(env.VITE_SUPABASE_URL)
  const api = origin(env.VITE_API_URL)
  const supabaseWs = supabase.replace(/^http/, 'ws')
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline: wavesurfer's shadow-DOM styles
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `media-src 'self' blob: ${supabase}`,
    `connect-src 'self' ${supabase} ${supabaseWs} ${api}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .join('; ')
  return {
    name: 'karaokesync-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_')
  // Safety net: anything prefixed with VITE_ is shipped to every visitor's browser.
  for (const key of Object.keys(env)) {
    if (/SERVICE|SECRET|PRIVATE/i.test(key)) {
      throw new Error(`${key} looks like a secret and must not be prefixed with VITE_ (it would be public).`)
    }
  }

  return {
    envDir,
    plugins: [
      contentSecurityPolicy(env),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'KaraokeSync AI',
          short_name: 'KaraokeSync',
          description: 'הופכים כל שיר לקריוקי — כתוביות מסונכרנות אוטומטית',
          lang: 'he',
          dir: 'rtl',
          start_url: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#07060f',
          theme_color: '#07060f',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Only the app shell is cached. API calls, audio and auth always go to the network.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallbackDenylist: [/^\/auth\//],
        },
      }),
    ],
    server: { port: 5173 },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'], // e2e/ is run by Playwright
    },
  }
})
