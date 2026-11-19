import { formatDuration } from './date'

/** The share text — every number comes from the real result. */
export function shareText(p: { durationMs: number; score: number }): string {
  return `פתחתי את הכספת ב־${formatDuration(p.durationMs)} עם ${p.score} נקודות. נראה אותך עוקף אותי 🔐`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Native share sheet when available, otherwise copy text + link.
 * Only 'shared' / 'copied' should show a success message.
 */
export async function shareChallenge(text: string, url: string, nav: Navigator = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'הכספת', text, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // fall through to copy
    }
  }
  try {
    await nav.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
