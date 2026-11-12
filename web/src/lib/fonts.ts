import { FONTS, type FontName } from './subtitleStyle'

const requested = new Set<string>()

/**
 * Load subtitle fonts from Google Fonts on demand (the same files and weights
 * the video uses). The CSS is tiny; the browser then downloads only the
 * Hebrew/Latin parts it actually draws.
 */
export function ensureFonts(families: FontName[]) {
  const missing = families.filter((f) => !requested.has(f))
  if (missing.length === 0 || typeof document === 'undefined') return
  for (const f of missing) requested.add(f)
  const params = missing.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${FONTS[f]}`).join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`
  document.head.appendChild(link)
}
