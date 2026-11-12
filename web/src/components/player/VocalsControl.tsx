import { errorKey, useI18n } from '../../i18n/I18nProvider'
import type { InstrumentalJob } from '../../lib/types'
import { ProgressBar, Spinner } from '../ui'

interface Props {
  job: InstrumentalJob | null
  ready: boolean
  requesting: boolean
  error: string | null
  vocalsOff: boolean
  onRequest: () => void
  onCancel: () => void
  onToggle: (vocalsOff: boolean) => void
}

/** "With the singer / melody only" switch, or the button that creates the melody-only track. */
export function VocalsControl({ job, ready, requesting, error, vocalsOff, onRequest, onCancel, onToggle }: Props) {
  const { t } = useI18n()

  if (ready) {
    return (
      <div role="radiogroup" aria-label={t('vocals.label')} className="mx-auto mt-3 grid max-w-sm grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
        {([false, true] as const).map((off) => (
          <button
            key={String(off)}
            type="button"
            role="radio"
            aria-checked={vocalsOff === off}
            onClick={() => onToggle(off)}
            className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
              vocalsOff === off ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            {off ? `🎵 ${t('vocals.off')}` : `🎤 ${t('vocals.on')}`}
          </button>
        ))}
      </div>
    )
  }

  if (job?.status === 'queued' || job?.status === 'running') {
    return (
      <div className="mx-auto mt-3 max-w-sm space-y-1.5 text-center" role="status">
        <p className="flex items-center justify-center gap-2 text-sm text-violet-200">
          <Spinner className="size-4" />
          {job.status === 'running' ? `${t('vocals.running')} ${job.progress}%` : t('vocals.queued')}
        </p>
        {job.status === 'running' ? <ProgressBar value={job.progress / 100} label={t('vocals.running')} /> : (
          <p className="text-xs text-white/50">{t('vocals.queuedHint')}</p>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={requesting}
          className="min-h-10 rounded-xl px-4 text-sm font-medium text-white/70 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
        >
          ✕ {t('vocals.cancel')}
        </button>
      </div>
    )
  }

  const failed = job?.status === 'failed'
  return (
    <div className="mx-auto mt-3 max-w-sm text-center">
      <button
        type="button"
        onClick={onRequest}
        disabled={requesting}
        className="min-h-11 w-full rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
      >
        🎵 {failed ? t('vocals.retry') : t('vocals.create')}
      </button>
      {!failed && !error && <p className="mt-1.5 text-xs text-white/50">{t('vocals.createHint')}</p>}
      {(error || failed) && (
        <p role="alert" className="mt-1.5 text-xs text-red-200">
          {t(errorKey(error ?? job?.error_code))}
        </p>
      )}
    </div>
  )
}
