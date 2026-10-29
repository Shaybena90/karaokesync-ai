import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { KaraokePlayer, type VideoAspect } from '../components/player/KaraokePlayer'
import { ExportPanel } from '../components/style/ExportPanel'
import { StyleControls } from '../components/style/StyleControls'
import { Alert, Spinner } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import { ApiError } from '../lib/api'
import { normalizeStyle, type SubtitleStyle } from '../lib/subtitleStyle'
import { supabase } from '../lib/supabase'
import { useProjectLive } from '../lib/useProjectLive'

type SaveState = 'saved' | 'saving' | 'error'

/** Subtitle design (with live preview in the video's aspect ratio) and export. */
export function StylePage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const { project, audio, loading, notFound } = useProjectLive(id)
  const [style, setStyle] = useState<SubtitleStyle | null>(null)
  const [aspect, setAspect] = useState<VideoAspect>('16:9')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialise once from the stored style (later realtime reloads do not overwrite edits).
  useEffect(() => {
    if (project && !style) {
      const initial = normalizeStyle(project.style)
      setStyle(initial)
      if (initial.preset === 'tiktok') setAspect('9:16')
    }
  }, [project, style])

  const pending = useRef<SubtitleStyle | null>(null)

  const save = async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    if (!supabase || !next) return
    pending.current = null
    // RLS: only the owner may update, and only the title/style columns.
    const { error } = await supabase.from('projects').update({ style: next }).eq('id', id)
    setSaveState(error ? 'error' : 'saved')
    if (error) throw new ApiError('style_not_saved')
  }

  const change = (next: SubtitleStyle) => {
    setStyle(next)
    if (next.preset === 'tiktok') setAspect('9:16')
    setSaveState('saving')
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save().catch(() => undefined), 600)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  if (loading || (!style && !notFound)) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-white/60">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (notFound || !project || !style) {
    return (
      <div className="mx-auto max-w-xl pt-12">
        <Alert>{t('error.project_not_found')}</Alert>
      </div>
    )
  }
  if (project.status !== 'ready' && project.status !== 'expired') return <Navigate to={`/projects/${id}`} replace />

  const storagePath = audio?.status === 'verified' ? audio.storage_path : null

  return (
    <div className="pt-4 pb-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link to={`/projects/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-white/60 hover:text-white">
          <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('project.back')}
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold sm:text-xl" dir="auto">
          {t('style.title')} · {project.title}
        </h1>
        <span
          role="status"
          className={`text-xs font-medium ${saveState === 'saved' ? 'text-emerald-300' : saveState === 'error' ? 'text-red-300' : 'text-white/60'}`}
        >
          {saveState === 'saved' ? t('editor.status.saved') : saveState === 'saving' ? t('editor.status.saving') : t('style.saveError')}
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <KaraokePlayer
            projectId={project.id}
            title={project.title}
            storagePath={storagePath}
            language={project.language}
            style={style}
            videoFrame={aspect}
          />
          <p className="text-center text-xs text-white/40">{t('style.previewNote')}</p>
        </div>

        <div className="space-y-5">
          <div className="glass rounded-3xl p-4">
            <StyleControls style={style} onChange={change} />
          </div>
          <div className="glass rounded-3xl p-4">
            <h2 className="mb-4 font-display text-lg font-semibold">{t('export.title')}</h2>
            <ExportPanel
              projectId={project.id}
              title={project.title}
              aspect={aspect}
              onAspectChange={setAspect}
              canRenderVideo={Boolean(storagePath)}
              beforeExport={save}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
