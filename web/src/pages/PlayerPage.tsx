import { Link, Navigate, useParams } from 'react-router-dom'
import { KaraokePlayer } from '../components/player/KaraokePlayer'
import { Alert, Spinner } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import { normalizeStyle } from '../lib/subtitleStyle'
import { useProjectLive } from '../lib/useProjectLive'

/** Dedicated, distraction-free karaoke player for one project. */
export function PlayerPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const { project, audio, loading, notFound } = useProjectLive(id)

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
  // Lyrics exist only for finished projects; otherwise show the status page.
  if (project.status !== 'ready' && project.status !== 'expired') return <Navigate to={`/projects/${id}`} replace />

  return (
    <div className="pt-4 pb-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Link to={`/projects/${id}`} className="inline-flex min-h-11 items-center gap-1 shrink-0 text-sm text-white/60 hover:text-white">
          <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('project.back')}
        </Link>
        {/* On narrow phones the title gets its own line instead of being squeezed. */}
        <h1 className="order-last w-full truncate font-display text-base font-semibold sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:text-lg" dir="auto">
          {project.title}
        </h1>
        <Link to={`/projects/${id}/edit`} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
          {t('editor.open')}
        </Link>
        <Link to={`/projects/${id}/style`} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
          {t('style.open')}
        </Link>
      </div>
      <KaraokePlayer
        variant="page"
        projectId={project.id}
        title={project.title}
        storagePath={audio?.status === 'verified' ? audio.storage_path : null}
        language={project.language}
        style={normalizeStyle(project.style)}
      />
      <p className="mt-3 hidden text-center text-xs text-white/40 sm:block">{t('player.shortcuts')}</p>
    </div>
  )
}
