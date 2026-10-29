import { useRef, useState, type DragEvent } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { ACCEPT_ATTR } from '../lib/audioFile'

interface Props {
  onFile: (file: File) => void
  maxMb: number
  maxMinutes: number
  disabled?: boolean
}

export function Dropzone({ onFile, maxMb, maxMinutes, disabled }: Props) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && !disabled) onFile(file)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition sm:py-14 ${
        over ? 'border-violet-400 bg-violet-500/10' : 'border-white/15 bg-white/[0.03] hover:border-violet-400/60'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="size-8 text-violet-200" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="font-display text-lg font-semibold">{over ? t('drop.active') : t('drop.title')}</p>
        <p className="mt-1 text-sm text-white/50">{t('drop.or')}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="min-h-12 rounded-2xl bg-white px-6 font-semibold text-ink-950 transition hover:bg-violet-100 active:scale-[0.98]"
      >
        {t('drop.browse')}
      </button>
      <p className="text-xs text-white/50">
        {t('drop.hint', { mb: maxMb, min: maxMinutes })}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-label={t('drop.browse')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </div>
  )
}
