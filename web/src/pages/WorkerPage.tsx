import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Spinner } from '../components/ui'
import { errorKey, isMessageKey, useI18n } from '../i18n/I18nProvider'
import { ApiError, api } from '../lib/api'
import { useWorkerStatus } from '../lib/useWorkerStatus'

/** The processing server(s): online status for everyone; details and pause/resume for the owner. */
export function WorkerPage() {
  const { t, locale } = useI18n()
  const { status, checkedAt, reload } = useWorkerStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setPaused = async (paused: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await api.setWorkerPaused(paused)
      await reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setBusy(false)
    }
  }

  const activityLabel = (activity: string | null) => {
    const key = `worker.activity.${activity ?? 'idle'}`
    return isMessageKey(key) ? t(key) : (activity ?? '')
  }

  const ago = (iso: string) => {
    const seconds = Math.max(0, Math.round((checkedAt - new Date(iso).getTime()) / 1000))
    return seconds < 90 ? t('worker.secondsAgo', { n: seconds }) : t('worker.minutesAgo', { n: Math.round(seconds / 60) })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-8">
      <Link to="/projects" className="inline-flex min-h-11 items-center gap-1 text-sm text-white/60 hover:text-white">
        <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('nav.projects')}
      </Link>
      <h1 className="font-display text-3xl font-bold">{t('worker.title')}</h1>

      {!status ? (
        <Spinner className="size-7" />
      ) : !status.available ? (
        <Alert>{t('worker.notSetUp')}</Alert>
      ) : (
        <>
          <Card>
            <p className="text-lg font-semibold" role="status">
              {status.paused ? `⏸ ${t('worker.paused')}` : status.online ? `🟢 ${t('worker.online')}` : `⚪ ${t('worker.offline')}`}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {status.paused ? t('worker.pausedHint') : status.online ? t('worker.onlineHint') : t('worker.offlineHint')}
            </p>
            {status.admin && (
              <div className="mt-4">
                <Button disabled={busy} onClick={() => void setPaused(!status.paused)} variant={status.paused ? 'primary' : 'ghost'}>
                  {status.paused ? `▶ ${t('worker.resume')}` : `⏸ ${t('worker.pause')}`}
                </Button>
              </div>
            )}
          </Card>

          {status.admin && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">{t('worker.computers')}</h2>
              {(status.workers ?? []).length === 0 && <p className="text-sm text-white/60">{t('worker.none')}</p>}
              {(status.workers ?? []).map((w) => (
                <Card key={w.id}>
                  <p className="font-semibold" dir="ltr">
                    {w.online ? '🟢' : '⚪'} {w.id.split('-')[0]}
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    {w.device ?? '—'} · {w.online ? activityLabel(w.activity) : t('worker.offline')}
                  </p>
                  <p className="mt-1 text-xs text-white/45">{t('worker.lastSeen')} {ago(w.last_seen)}</p>
                </Card>
              ))}
              <p className="text-xs text-white/45">{t('worker.autostartHint')}</p>
            </section>
          )}
          {error && <Alert>{t(errorKey(error))}</Alert>}
        </>
      )}
    </div>
  )
}
