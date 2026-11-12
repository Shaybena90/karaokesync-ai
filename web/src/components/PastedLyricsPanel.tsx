import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Button } from './ui'

export const MAX_LYRICS_CHARS = 20000

interface Props {
  initial: string | null
  busy: boolean
  /** Save the text (null = forget it) and process the song again with it. */
  onSubmit: (text: string | null) => void
}

/** "Paste the exact lyrics": the song is processed again, keeping these words and lines. */
export function PastedLyricsPanel({ initial, busy, onSubmit }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initial ?? '')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-2xl border border-dashed border-white/20 px-4 text-start text-sm hover:border-violet-400 hover:bg-white/5"
      >
        📝 <span className="font-semibold">{t('lyrics.paste.open')}</span>
        <span className="block text-xs text-white/50">{t('lyrics.paste.why')}</span>
      </button>
    )
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-4" data-testid="pasted-lyrics">
      <h2 className="font-display text-lg font-semibold">📝 {t('lyrics.paste.title')}</h2>
      <p className="text-xs text-white/60">{t('lyrics.paste.help')}</p>
      <LyricsTextarea value={text} onChange={setText} />
      <p className="text-xs text-amber-200/80">{t('lyrics.paste.replaces')}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !text.trim()} onClick={() => onSubmit(text)}>
          {t('lyrics.paste.submit')}
        </Button>
        {initial && (
          <Button variant="ghost" disabled={busy} onClick={() => onSubmit(null)}>
            {t('lyrics.paste.useAi')}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          {t('lyrics.paste.cancel')}
        </Button>
      </div>
    </div>
  )
}

export function LyricsTextarea({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { t } = useI18n()
  return (
    <label className="block">
      <span className="sr-only">{t('lyrics.paste.label')}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LYRICS_CHARS))}
        dir="auto"
        rows={10}
        placeholder={t('lyrics.paste.placeholder')}
        className="block w-full resize-y rounded-2xl border border-white/10 bg-white/5 p-3 text-base leading-relaxed focus:border-violet-400 focus:outline-none"
      />
      <span className="mt-1 block text-end text-xs text-white/40" dir="ltr">
        {value.length.toLocaleString()} / {MAX_LYRICS_CHARS.toLocaleString()}
      </span>
    </label>
  )
}
