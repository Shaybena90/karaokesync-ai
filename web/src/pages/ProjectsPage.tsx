import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { Alert, ButtonLink, Spinner } from '../components/ui'
import { useWorkerStatus } from '../lib/useWorkerStatus'
import { errorKey, useI18n } from '../i18n/I18nProvider'
import { ApiError, api } from '../lib/api'
import { formatDuration } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'

type Row = Project & { audio_files: { original_name: string; duration_ms: number | null }[] }

export function ProjectsPage() {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('projects')
      .select('*, audio_files(original_name, duration_ms)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) setError('generic')
    else setRows(data as Row[])
  }, [])

  useEffect(() => {
    void load()
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel('my-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => void load())
      .subscribe()
    return () => void client.removeChannel(channel)
  }, [load])

  const remove = async (p: Row) => {
    if (!window.confirm(t('projects.deleteConfirm', { title: p.title }))) return
    try {
      await api.deleteProject(p.id)
      setRows((r) => r?.filter((x) => x.id !== p.id) ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic')
    }
  }

  return (
    <div className="pt-8 sm:pt-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('projects.title')}</h1>
        <ButtonLink to="/upload">+ {t('projects.new')}</ButtonLink>
      </div>
      <div className="mt-2">
        <WorkerPill />
      </div>

      {error && (
        <div className="mt-6">
          <Alert>{t(errorKey(error))}</Alert>
        </div>
      )}

      {rows === null ? (
        <div className="grid min-h-[30vh] place-items-center text-white/60">
          <Spinner className="size-8" />
        </div>
      ) : rows.length === 0 ? (
        <p className="glass mt-8 rounded-3xl p-10 text-center text-white/60">{t('projects.empty')}</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id} className="glass flex flex-col rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-semibold" dir="auto">
                    {p.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-white/50" dir="auto">
                    {p.audio_files[0]?.original_name}
                  </p>
                </Link>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-white/50">
                <span dir="ltr">{formatDuration(p.audio_files[0]?.duration_ms)}</span>
                <span>{new Date(p.created_at).toLocaleDateString(locale)}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <ButtonLink to={`/projects/${p.id}`} variant="ghost" className="min-h-10 flex-1 text-sm">
                  {t('projects.open')}
                </ButtonLink>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="min-h-10 rounded-2xl px-4 text-sm text-red-300 hover:bg-red-500/10"
                >
                  {t('projects.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Processing server: on / off / paused" - a link to the processing server page. */
function WorkerPill() {
  const { t } = useI18n()
  const { status } = useWorkerStatus()
  if (!status?.available) return null
  const label = status.paused ? `⏸ ${t('worker.paused')}` : status.online ? `🟢 ${t('worker.online')}` : `⚪ ${t('worker.offline')}`
  return (
    <Link to="/worker" className="inline-flex min-h-9 items-center rounded-full bg-white/5 px-3 text-xs text-white/70 hover:bg-white/10">
      {t('worker.label')}: {label}
    </Link>
  )
}
