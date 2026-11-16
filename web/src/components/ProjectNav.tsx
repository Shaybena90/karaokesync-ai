import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/he'

export type ProjectArea = 'edit' | 'style' | 'play' | 'export'

const AREAS: { id: ProjectArea; path: string; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { id: 'edit', path: 'edit', icon: '✏️', label: 'nav.edit', hint: 'nav.editHint' },
  { id: 'style', path: 'style', icon: '🎨', label: 'nav.style', hint: 'nav.styleHint' },
  { id: 'play', path: 'play', icon: '▶️', label: 'nav.play', hint: 'nav.playHint' },
  { id: 'export', path: 'export', icon: '⬇️', label: 'nav.export', hint: 'nav.exportHint' },
]

/**
 * The four work areas of a song, always in the same place: big, clear tabs
 * (icon + name) that say which one is open. On the project page they are cards
 * with a short explanation.
 */
export function ProjectTabs({ projectId, active, cards = false }: { projectId: string; active?: ProjectArea; cards?: boolean }) {
  const { t } = useI18n()
  if (cards) {
    return (
      <nav aria-label={t('nav.label')} className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="project-areas">
        {AREAS.map((a) => (
          <Link
            key={a.id}
            to={`/projects/${projectId}/${a.path}`}
            className="group flex min-h-24 flex-col items-start gap-1 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-3 transition hover:border-violet-300/50 hover:from-violet-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-white/10 text-lg transition group-hover:scale-110">
              {a.icon}
            </span>
            <span className="font-semibold">{t(a.label)}</span>
            <span className="text-xs leading-snug text-white/50">{t(a.hint)}</span>
          </Link>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label={t('nav.label')} className="mt-3" data-testid="project-tabs">
      <ul className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        {AREAS.map((a) => {
          const current = a.id === active
          return (
            <li key={a.id}>
              <Link
                to={`/projects/${projectId}/${a.path}`}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-xs font-semibold transition sm:flex-row sm:gap-2 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 ${
                  current
                    ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-900/40'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span aria-hidden="true" className="text-base">
                  {a.icon}
                </span>
                <span className="leading-tight">{t(a.label)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Back link, the song's name and the area's own tools, then the tabs. */
export function ProjectHeader({
  projectId,
  title,
  active,
  children,
}: {
  projectId: string
  title: string
  active: ProjectArea
  children?: ReactNode
}) {
  const { t, locale } = useI18n()
  return (
    <header>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link to={`/projects/${projectId}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-white/60 hover:text-white">
          <span aria-hidden="true">{locale === 'he' ? '→' : '←'}</span> {t('project.back')}
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold sm:text-xl" dir="auto">
          {title}
        </h1>
        {children}
      </div>
      <ProjectTabs projectId={projectId} active={active} />
    </header>
  )
}
