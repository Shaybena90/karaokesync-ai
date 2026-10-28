import { memo } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { KaraokeView } from '../../lib/karaoke'
import type { LyricLine } from '../../lib/types'

interface Props {
  lines: LyricLine[]
  view: KaraokeView
  dir: 'rtl' | 'ltr' | 'auto'
  language: string | null
  large: boolean
  /** Word spans of the main line register here; the player animates them per frame. */
  registerWord: (id: string, el: HTMLSpanElement | null) => void
  onSeekToLine: (line: LyricLine) => void
}

/**
 * Renders previous / current / next lines. It re-renders only when the visible
 * lines change; the per-word fill is animated by the player directly on the
 * DOM (CSS variable --p) to keep 60 fps on phones.
 */
export const LyricsStage = memo(function LyricsStage({
  lines,
  view,
  dir,
  language,
  large,
  registerWord,
  onSeekToLine,
}: Props) {
  const { t } = useI18n()
  const main = lines[view.main]
  const prev = view.prev >= 0 ? lines[view.prev] : null
  const next = view.next >= 0 ? lines[view.next] : null

  const sideLine = (line: LyricLine | null, kind: 'prev' | 'next') => (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => line && onSeekToLine(line)}
      className={`block w-full font-display font-bold leading-snug transition-opacity duration-300 ${
        large ? 'text-[clamp(1.1rem,3.6vw,2.4rem)]' : 'text-[clamp(1rem,3.2vw,1.6rem)]'
      } ${line ? (kind === 'prev' ? 'text-[var(--k-active)] opacity-35' : 'text-white/40') : 'invisible'}`}
    >
      {line ? line.words.map((w) => w.text).join(' ') : ' '}
    </button>
  )

  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-[0.6em] text-center"
      dir={dir}
      lang={language ?? undefined}
    >
      {sideLine(prev, 'prev')}

      <div className="relative w-full">
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
          {view.instrumental && (
            <span className="animate-pulse text-sm tracking-[0.4em] text-white/50">♪ ♪ ♪</span>
          )}
        </div>
        {view.instrumental && <span className="sr-only">{t('player.instrumental')}</span>}

        {main && (
          <p
            key={main.id}
            onClick={() => onSeekToLine(main)}
            className={`animate-[ks-line-in_.35s_ease-out] cursor-pointer font-display font-extrabold leading-tight [text-wrap:balance] ${
              large ? 'text-[clamp(2rem,7vw,5.5rem)]' : 'text-[clamp(1.6rem,6vw,3.25rem)]'
            }`}
          >
            {main.words.map((w, i) => (
              <span key={w.id}>
                <span ref={(el) => registerWord(w.id, el)} className="karaoke-word" data-state="upcoming">
                  {w.text}
                </span>
                {i < main.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        )}
      </div>

      {sideLine(next, 'next')}
    </div>
  )
})
