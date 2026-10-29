import { memo } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { KaraokeView } from '../../lib/karaoke'
import type { LyricLine } from '../../lib/types'

interface Props {
  lines: LyricLine[]
  view: KaraokeView
  dir: 'rtl' | 'ltr' | 'auto'
  language: string | null
  /** Video preview: show exactly what the exported video shows (no previous line). */
  videoFrame: boolean
  showNext: boolean
  textBox: boolean
  /** Word spans of the main line register here; the player animates them per frame. */
  registerWord: (id: string, el: HTMLSpanElement | null) => void
  onSeekToLine: (line: LyricLine) => void
}

/**
 * Renders previous / current / next lines. It re-renders only when the visible
 * lines change; the per-word fill is animated by the player directly on the
 * DOM (CSS variable --p) to keep 60 fps on phones. Sizes come from CSS
 * variables set by the player (--k-base × --k-scale).
 */
export const LyricsStage = memo(function LyricsStage({
  lines,
  view,
  dir,
  language,
  videoFrame,
  showNext,
  textBox,
  registerWord,
  onSeekToLine,
}: Props) {
  const { t } = useI18n()
  const main = lines[view.main]
  const prev = !videoFrame && view.prev >= 0 ? lines[view.prev] : null
  const next = showNext && view.next >= 0 ? lines[view.next] : null

  const sideLine = (line: LyricLine | null, kind: 'prev' | 'next') => {
    const style = { fontSize: `calc(var(--k-base) * var(--k-scale) * ${videoFrame ? 0.8 : 0.6})` }
    const tone = line ? (kind === 'prev' ? 'text-[var(--k-active)] opacity-35' : 'text-[var(--k-idle)] opacity-45') : 'invisible'
    const text = line ? line.words.map((w) => w.text).join(' ') : '\u00a0'
    // Inside the video preview the next line is display-only, exactly like in the video.
    if (videoFrame) {
      return (
        <p style={style} className={`ks-lyric w-full leading-snug ${tone}`}>
          {text}
        </p>
      )
    }
    return (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => line && onSeekToLine(line)}
        style={style}
        className={`ks-lyric block min-h-8 w-full leading-snug transition-opacity duration-300 ${tone}`}
      >
        {text}
      </button>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-[0.35em] text-center" dir={dir} lang={language ?? undefined}>
      {!videoFrame && sideLine(prev, 'prev')}

      <div className="relative w-full">
        {!videoFrame && (
          <div className="flex h-6 items-center justify-center gap-2" aria-hidden="true">
            {view.countdown !== null &&
              [3, 2, 1].map((n) => (
                <span
                  key={n}
                  className={`size-3 rounded-full transition-all duration-300 ${
                    n <= view.countdown! ? 'scale-100 bg-[var(--k-active)] shadow-[0_0_14px_var(--k-active)]' : 'scale-50 bg-white/15'
                  }`}
                />
              ))}
            {view.instrumental && <span className="animate-pulse text-sm tracking-[0.4em] text-white/50">♪ ♪ ♪</span>}
          </div>
        )}
        {view.instrumental && <span className="sr-only">{t('player.instrumental')}</span>}

        {main && (
          <p
            key={main.id}
            onClick={() => onSeekToLine(main)}
            style={{ fontSize: 'calc(var(--k-base) * var(--k-scale))' }}
            className={`ks-lyric animate-[ks-line-in_.35s_ease-out] cursor-pointer leading-tight [text-wrap:balance] ${
              textBox ? 'inline-block rounded-[0.15em] bg-black/40 px-[0.3em] py-[0.08em]' : ''
            }`}
          >
            {main.words.map((w, i) => (
              <span key={w.id}>
                <span ref={(el) => registerWord(w.id, el)} className="karaoke-word" data-state="upcoming">
                  {/* Outline layer underneath; the fill layer is positioned on top of it. */}
                  <span className="kw-outline" aria-hidden="true">
                    {w.text}
                  </span>
                  <span className="kw-fill">{w.text}</span>
                </span>
                {i < main.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>

      {next && sideLine(next, 'next')}
    </div>
  )
})
