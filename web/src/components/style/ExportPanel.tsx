import { useCallback, useEffect, useState } from 'react'
import { errorKey, useI18n } from '../../i18n/I18nProvider'
import { ApiError, api, downloadTextExport, safeFileName, type TextExportFormat } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { ExportJob } from '../../lib/types'
import type { VideoAspect } from '../player/KaraokePlayer'
import { Alert, Button, ProgressBar, Spinner } from '../ui'
import { Segmented } from './StyleControls'

interface Props {
  projectId: string
  title: string
  aspect: VideoAspect
  onAspectChange: (a: VideoAspect) => void
  canRenderVideo: boolean
  /** Persist pending style edits first, so the export uses what the preview shows. */
  beforeExport: () => Promise<void>
}

const TEXT_FORMATS: TextExportFormat[] = ['srt', 'lrc', 'ass']

/** Subtitle downloads + MP4 render queue for one project. */
export function ExportPanel({ projectId, title, aspect, onAspectChange, canRenderVideo, beforeExport }: Props) {
  const { t, locale } = useI18n()
  const [resolution, setResolution] = useState<'720' | '1080'>('1080')
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(10)
    setJobs((data as ExportJob[]) ?? [])
  }, [projectId])

  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running')

  useEffect(() => {
    void load()
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel(`exports-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'export_jobs', filter: `project_id=eq.${projectId}` }, () => void load())
      .subscribe()
    return () => void client.removeChannel(channel)
  }, [projectId, load])

  // Poll as a fallback while a render is in progress (realtime can be blocked on some networks).
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [active, load])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setBusy(null)
    }
  }

  const downloadVideo = async (job: ExportJob) => {
    if (!supabase || !job.output_path) return
    const { data, error: signError } = await supabase.storage.from('exports').createSignedUrl(job.output_path, 600)
    if (signError || !data?.signedUrl) return setError('generic')
    // The file name is appended here instead of via the `download` option, which
    // double-encodes non-ASCII (e.g. Hebrew) names in supabase-js.
    const name = encodeURIComponent(`${safeFileName(title)}.mp4`)
    window.location.assign(`${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}download=${name}`)
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80">{t('export.subtitles')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {TEXT_FORMATS.map((fmt) => (
            <Button
              key={fmt}
              variant="ghost"
              disabled={busy !== null}
              onClick={() => run(fmt, async () => {
                await beforeExport()
                await downloadTextExport(projectId, fmt, title, aspect)
              })}
              className="min-h-11 px-2 text-sm"
            >
              {busy === fmt ? <Spinner className="size-4" /> : '⬇'} {fmt.toUpperCase()}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-white/50">{t('export.formatsHint')}</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80">{t('export.video')}</h3>
        <Segmented
          value={aspect}
          options={[
            ['9:16', t('export.aspect.vertical')],
            ['16:9', t('export.aspect.wide')],
            ['1:1', t('export.aspect.square')],
          ]}
          onChange={onAspectChange}
        />
        <Segmented value={resolution} options={[['720', '720p'], ['1080', '1080p']]} onChange={setResolution} />
        <Button
          className="w-full"
          disabled={!canRenderVideo || busy !== null || active}
          onClick={() => run('mp4', async () => {
            await beforeExport()
            await api.createVideoExport(projectId, aspect, Number(resolution))
            await load()
          })}
        >
          {busy === 'mp4' ? <Spinner className="size-4" /> : '🎬'} {t('export.createVideo')}
        </Button>
        {!canRenderVideo && <p className="text-xs text-white/50">{t('project.audioGone')}</p>}
        <p className="text-xs text-white/50">{t('export.videoHint')}</p>
      </section>

      {error && <Alert>{t(errorKey(error))}</Alert>}

      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-2xl bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  🎬 <span dir="ltr">{job.options.aspect} · {job.options.resolution}p</span>
                </span>
                <span className="text-xs text-white/50">{new Date(job.created_at).toLocaleString(locale)}</span>
              </div>
              {(job.status === 'queued' || job.status === 'running') && (
                <div className="mt-2 space-y-1">
                  <ProgressBar value={job.progress / 100} />
                  <p className="text-xs text-white/60">
                    {job.status === 'queued' ? t('export.queued') : `${t('export.rendering')} ${job.progress}%`}
                  </p>
                </div>
              )}
              {job.status === 'failed' && <p className="mt-2 text-xs text-red-200">{t(errorKey(job.error_code))}</p>}
              <div className="mt-2 flex gap-2">
                {job.status === 'succeeded' && job.output_path && (
                  <Button className="min-h-10 flex-1 text-sm" onClick={() => downloadVideo(job)}>
                    ⬇ {t('export.download')}
                  </Button>
                )}
                {job.status === 'succeeded' && !job.output_path && (
                  <p className="flex-1 text-xs text-white/50">{t('export.expired')}</p>
                )}
                {job.status !== 'queued' && job.status !== 'running' && (
                  <button
                    type="button"
                    onClick={() => run(job.id, async () => {
                      await api.deleteExport(job.id)
                      await load()
                    })}
                    className="min-h-10 rounded-xl px-3 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    {t('projects.delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
