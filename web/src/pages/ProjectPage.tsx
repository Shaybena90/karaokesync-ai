import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { KaraokePlayer } from '../components/player/KaraokePlayer'
import { StatusBadge } from '../components/StatusBadge'
import { Alert, Button, ButtonLink, Card, ProgressBar, Spinner } from '../components/ui'
import { errorKey, isMessageKey, useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/he'
import { ApiError, api } from '../lib/api'
import { formatBytes, formatDuration } from '../lib/format'
import type { ProcessingJob, Project } from '../lib/types'
import { normalizeStyle } from '../lib/subtitleStyle'
import { useProjectLive } from '../lib/useProjectLive'

const FLOW: MessageKey[] = ['flow.upload', 'flow.ai', 'flow.words', 'flow.sync', 'flow.preview']

/** Which step of the main flow the project is at (0..4); 5 = all done. */
function flowStep(project: Project, job: ProcessingJob | null): number {
  if (project.status === 'awaiting_upload') return 0
  if (project.status === 'ready' || project.status === 'expired') return 5
  const stage = job?.stage ?? 'queued'
  if (stage === 'transcribing') return 2
  if (stage === 'aligning' || stage === 'building_lines') return 3
  return 1
}

function stageKey(stage: string): MessageKey {
  const key = `stage.${stage}`
  return isMessageKey(key) ? key : 'stage.queued'
}

export function ProjectPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { project, audio, job, loading, notFound, reload } = useProjectLive(id)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-white/60">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-xl pt-12">
        <Alert>{t('error.project_not_found')}</Alert>
      </div>
    )
  }

  const step = flowStep(project, job)
  const failed = project.status === 'failed'
  const active = project.status === 'queued' || project.status === 'processing'
  const canRetry = failed && audio?.status === 'verified'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setBusy(false)
    }
  }

  const remove = () =>
    window.confirm(t('projects.deleteConfirm', { title: project.title })) &&
    run(async () => {
      await api.deleteProject(project.id)
      navigate('/projects', { replace: true })
    })

  return (
    <div className="mx-auto max-w-3xl pt-6 sm:pt-10">
      <Link to="/projects" className="text-sm text-white/60 hover:text-white">
        <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('project.back')}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold sm:text-4xl" dir="auto">
            {project.title}
          </h1>
          {audio && (
            <p className="mt-1 text-sm text-white/50">
              <span dir="auto">{audio.original_name}</span> · <span dir="ltr">{formatBytes(audio.size_bytes, locale)}</span> ·{' '}
              <span dir="ltr">{formatDuration(audio.duration_ms)}</span>
              {project.language && (
                <>
                  {' '}
                  · {t('project.language')}: <span dir="ltr">{project.language.toUpperCase()}</span>
                </>
              )}
            </p>
          )}
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Main flow: upload → AI → words → sync → preview */}
      <ol className="mt-6 grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="progress">
        {FLOW.map((key, i) => {
          const done = i < step
          const current = i === step
          return (
            <li key={key} className="flex flex-col items-center gap-2 text-center">
              <span
                className={`grid size-9 place-items-center rounded-full text-sm font-bold transition ${
                  done
                    ? 'bg-gradient-to-br from-violet-500 to-blue-500'
                    : current && failed
                      ? 'bg-red-500/80'
                      : current
                        ? 'animate-pulse bg-violet-500/40 ring-2 ring-violet-400'
                        : 'bg-white/10 text-white/40'
                }`}
              >
                {done ? '✓' : current && failed ? '!' : i + 1}
              </span>
              <span className={`text-[11px] leading-tight sm:text-xs ${done || current ? 'text-white' : 'text-white/40'}`}>{t(key)}</span>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 space-y-4">
        {active && job && (
          <Card>
            <div className="flex items-center gap-3">
              <Spinner />
              <p className="font-medium">{t(stageKey(job.stage))}</p>
              <span dir="ltr" className="ms-auto text-sm tabular-nums text-white/60">
                {job.progress}%
              </span>
            </div>
            <div className="mt-4">
              <ProgressBar value={job.progress / 100} />
            </div>
            {project.status === 'queued' && <p className="mt-4 text-xs text-white/50">{t('project.waitingWorker')}</p>}
          </Card>
        )}

        {failed && (
          <Card>
            <p className="font-display text-lg font-semibold text-red-200">{t('error.title')}</p>
            <p className="mt-1 text-white/70">{t(errorKey(project.error_code))}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {canRetry ? (
                <Button disabled={busy} onClick={() => run(() => api.retry(project.id))}>
                  {t('project.retry')}
                </Button>
              ) : (
                <ButtonLink to="/upload">{t('project.reupload')}</ButtonLink>
              )}
            </div>
          </Card>
        )}

        {(project.status === 'ready' || project.status === 'expired') && (
          <div className="space-y-3">
            <KaraokePlayer
              projectId={project.id}
              title={project.title}
              storagePath={audio?.status === 'verified' ? audio.storage_path : null}
              language={project.language}
              style={normalizeStyle(project.style)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <ButtonLink to={`/projects/${project.id}/play`} variant="ghost">
                  {t('player.open')}
                </ButtonLink>
                <ButtonLink to={`/projects/${project.id}/edit`} variant="ghost">
                  {t('editor.open')}
                </ButtonLink>
                <ButtonLink to={`/projects/${project.id}/style`} variant="ghost">
                  {t('style.open')}
                </ButtonLink>
              </div>
              <p className="hidden text-xs text-white/40 sm:block">{t('player.shortcuts')}</p>
            </div>
          </div>
        )}

        {actionError && <Alert>{t(errorKey(actionError))}</Alert>}

        <div className="pt-4">
          <Button variant="danger" disabled={busy} onClick={remove}>
            {t('project.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}
