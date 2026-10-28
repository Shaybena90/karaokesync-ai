export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`
}

/** 83_500 ms -> "1:23" ; 3_725_000 -> "1:02:05" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '–:––'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const RTL_LANGUAGES = new Set(['he', 'yi', 'ar', 'fa', 'ur', 'ps', 'sd', 'ug'])

/** Text direction of a lyric language (independent of the UI language). */
export function directionOf(language: string | null | undefined): 'rtl' | 'ltr' | 'auto' {
  if (!language) return 'auto'
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
}
