import { useI18n } from '../../i18n/I18nProvider'
import { MAX_SYNC_WINDOW_MS } from '../../lib/lyricsDoc'
import { TimeField } from './WordInspector'

interface Props {
  text: string
  lineNumber: number
  lyricDir: 'rtl' | 'ltr' | 'auto'
  range: { start: number; end: number }
  /** Song position (ms) from the audio, for "set by the playback position". */
  currentTimeMs: () => number
  onChange: (start: number, end: number) => void
  onPlay: () => void
  onLoop: () => void
  onSync: () => void
  onCancel: () => void
}

export const MIN_RANGE_MS = 300

/**
 * Mark where a sentence is sung (start and end on the timeline above, also
 * draggable as the yellow stretch), then sync its words inside that stretch only.
 */
export function LineRangePanel({ text, lineNumber, lyricDir, range, currentTimeMs, onChange, onPlay, onLoop, onSync, onCancel }: Props) {
  const { t } = useI18n()
  const length = range.end - range.start
  const problem = length < MIN_RANGE_MS ? 'editor.range.tooShort' : length > MAX_SYNC_WINDOW_MS ? 'editor.range.tooLong' : null

  return (
    <div className="space-y-3" data-testid="line-range">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">
          ⏱ {t('editor.range.title')} · #{lineNumber}
        </h2>
        <button type="button" onClick={onCancel} className="rounded-xl px-2 py-1 text-sm text-white/60 hover:text-white" aria-label={t('editor.line.cancel')}>
          ✕
        </button>
      </div>
      <p className="rounded-xl bg-white/5 px-3 py-2 text-base font-semibold" dir={lyricDir}>
        {text}
      </p>
      <p className="text-xs text-white/60">{t('editor.range.help')}</p>

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          label={t('editor.range.start')}
          ms={range.start}
          onChange={(v) => onChange(Math.max(0, v), range.end)}
          onNow={() => onChange(Math.round(currentTimeMs()), range.end)}
        />
        <TimeField
          label={t('editor.range.end')}
          ms={range.end}
          onChange={(v) => onChange(range.start, v)}
          onNow={() => onChange(range.start, Math.round(currentTimeMs()))}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPlay} className="min-h-10 rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
          ▶ {t('editor.range.play')}
        </button>
        <button type="button" onClick={onLoop} className="min-h-10 rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
          ⟲ {t('editor.range.loop')}
        </button>
      </div>

      {problem && (
        <p role="alert" className="text-sm text-amber-200">
          {t(problem)}
        </p>
      )}
      <button
        type="button"
        disabled={problem !== null}
        onClick={onSync}
        className="min-h-11 w-full rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-sm font-semibold disabled:opacity-40"
      >
        ✨ {t('editor.range.sync')}
      </button>
    </div>
  )
}
