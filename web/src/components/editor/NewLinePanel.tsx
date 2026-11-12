import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { formatDuration } from '../../lib/format'

interface Props {
  lyricDir: 'rtl' | 'ltr' | 'auto'
  /** Song position (ms), read from the audio when the panel opens or on request. */
  currentTimeMs: () => number
  onAdd: (atMs: number, text: string) => void
  onCancel: () => void
}

/**
 * Type a whole missing sentence where the song is now; it is then timed to the
 * singer automatically, word by word.
 */
export function NewLinePanel({ lyricDir, currentTimeMs, onAdd, onCancel }: Props) {
  const { t } = useI18n()
  const [atMs, setAtMs] = useState(() => Math.round(currentTimeMs()))
  const [text, setText] = useState('')
  const add = () => text.trim() && onAdd(atMs, text)

  return (
    <div className="space-y-3" data-testid="new-line">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">➕ {t('editor.newLine.title')}</h2>
        <button type="button" onClick={onCancel} className="rounded-xl px-2 py-1 text-sm text-white/60 hover:text-white" aria-label={t('editor.line.cancel')}>
          ✕
        </button>
      </div>
      <p className="text-xs text-white/60">{t('editor.newLine.help')}</p>
      <input
        autoFocus
        value={text}
        dir={lyricDir}
        maxLength={2000}
        aria-label={t('editor.newLine.placeholder')}
        placeholder={t('editor.newLine.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          } else if (e.key === 'Escape') onCancel()
        }}
        className="block min-h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-lg font-semibold focus:border-violet-400 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/60">{t('editor.newLine.at')}</span>
        <span dir="ltr" className="font-mono tabular-nums" data-testid="new-line-at">
          {formatDuration(atMs)}.{Math.floor((atMs % 1000) / 100)}
        </span>
        <button type="button" onClick={() => setAtMs(Math.round(currentTimeMs()))}
          className="min-h-9 rounded-lg bg-violet-500/20 px-2 text-xs font-semibold text-violet-100">
          ◉ {t('editor.setNow')}
        </button>
      </div>
      <button type="button" disabled={!text.trim()} onClick={add}
        className="min-h-11 w-full rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-sm font-semibold disabled:opacity-40">
        ✨ {t('editor.newLine.add')}
      </button>
    </div>
  )
}
