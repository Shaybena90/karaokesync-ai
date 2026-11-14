import { useCallback, useEffect, useState } from 'react'
import { errorKey, useI18n } from '../../i18n/I18nProvider'
import { ApiError, api, downloadTextExport, safeFileName, type TextExportFormat } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { InstrumentalState } from '../../lib/useInstrumental'
import type { ExportJob } from '../../lib/types'
import type { VideoAspect } from '../player/KaraokePlayer'
import { Alert, Button, ProgressBar, Spinner } from '../ui'
import { openingProblem, openingRequest, useOpeningChoice } from '../../lib/opening'
import { OpeningPanel } from './OpeningPanel'
import { Segmented } from './StyleControls'

interface Props {
  projectId: string
  title: string
  aspect: VideoAspect
  onAspectChange: (a: VideoAspect) => void
  canRenderVideo: boolean
  /** Persist pending style edits first, so the export uses what the preview shows. */
  beforeExport: () => Promise<void>
  /** The song's melody-only track (shared with the player on the same page). */
  instrumental: InstrumentalState
}

const TEXT_FORMATS: TextExportFormat[] = ['srt', 'lrc', 'ass']

/** Subtitle downloads + MP4 render queue for one project. */
export function ExportPanel({ projectId, title, aspect, onAspectChange, canRenderVideo, beforeExport, instrumental }: Props) {
  const { t, locale } = useI18n()
  const [resolution, setResolution] = useState<'720' | '1080'>('1080')
  const [noVocals, setNoVocals] = useState(false)
  const [opening, setOpening] = useOpeningChoice(projectId, title)
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The preview video being watched: a short-lived link to it. */
  const [watching, setWatching] = useState<{ id: string; url: string } | null>(null)
  const [waitingFor, setWaitingFor] = useState<string | null>(null)

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

  const watchPreview = useCallback(async (job: ExportJob) => {
    if (!supabase || !job.output_path) return
    const { data } = await supabase.storage.from('exports').createSignedUrl(job.output_path, 600)
    if (data?.signedUrl) setWatching({ id: job.id, url: data.signedUrl })
  }, [])

  // The preview the user just asked for starts playing by itself when it is ready.
  useEffect(() => {
    const job = waitingFor ? jobs.find((j) => j.id === waitingFor) : undefined
    if (job?.status === 'succeeded' && job.output_path) {
      setWaitingFor(null)
      void watchPreview(job)
    } else if (job && job.status !== 'queued' && job.status !== 'running') {
      setWaitingFor(null)
    }
  }, [jobs, waitingFor, watchPreview])

  const makeVideo = (preview: boolean) =>
    run(preview ? 'preview' : 'mp4', async () => {
      await beforeExport()
      const job = await api.createVideoExport(projectId, aspect, Number(resolution), noVocals && instrumental.ready ? 'instrumental' : 'original',
        openingRequest(opening), preview)
      if (preview) {
        setWatching(null)
        setWaitingFor(job.id)
      }
      await load()
    })

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
        <label className={`flex min-h-10 items-center gap-2 text-sm ${instrumental.ready ? '' : 'opacity-50'}`}>
          <input
            type="checkbox"
            checked={noVocals && instrumental.ready}
            disabled={!instrumental.ready}
            onChange={(e) => setNoVocals(e.target.checked)}
            className="size-5 accent-violet-500"
          />
          🎵 {t('export.noVocals')}
        </label>
        {!instrumental.ready && canRenderVideo && <p className="-mt-2 text-xs text-white/40">{t('export.noVocalsHint')}</p>}
        <OpeningPanel choice={opening} onChange={setOpening} aspect={aspect} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="ghost"
            disabled={!canRenderVideo || busy !== null || active || openingProblem(opening) !== null}
            onClick={() => makeVideo(true)}
          >
            {busy === 'preview' ? <Spinner className="size-4" /> : '👁'} {t('export.preview')}
          </Button>
          <Button
            disabled={!canRenderVideo || busy !== null || active || openingProblem(opening) !== null}
            onClick={() => makeVideo(false)}
          >
            {busy === 'mp4' ? <Spinner className="size-4" /> : '🎬'} {t('export.createVideo')}
          </Button>
        </div>
        <p className="text-xs text-white/50">{t('export.previewHint')}</p>
        {watching && (
          <div className="space-y-2 rounded-2xl bg-black/30 p-2" data-testid="video-preview">
            <video
              key={watching.url}
              src={watching.url}
              controls
              autoPlay
              playsInline
              className={`mx-auto w-full rounded-xl ${aspect === '9:16' ? 'max-h-[70vh] max-w-xs' : 'max-h-[60vh]'}`}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-white/60">{t('export.previewWatching')}</p>
              <button type="button" onClick={() => setWatching(null)} className="min-h-9 rounded-lg px-3 text-xs hover:bg-white/10">
                ✕ {t('export.opening.hidePreview')}
              </button>
            </div>
          </div>
        )}
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
                  {job.options.preview ? `👁 ${t('export.previewLabel')} · ` : '🎬 '}
                  <span dir="ltr">{job.options.aspect} · {job.options.resolution}p</span>
                  {job.options.audio === 'instrumental' && ` · 🎵 ${t('vocals.off')}`}
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
                {job.status === 'succeeded' && job.output_path && job.options.preview && (
                  <Button variant="ghost" className="min-h-10 flex-1 text-sm" onClick={() => void watchPreview(job)}>
                    ▶ {t('export.watchPreview')}
                  </Button>
                )}
                {job.status === 'succeeded' && job.output_path && !job.options.preview && (
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
