import { useI18n } from '../i18n/I18nProvider'
import type { ProjectStatus } from '../lib/types'

const styles: Record<ProjectStatus, string> = {
  awaiting_upload: 'bg-white/10 text-white/70',
  queued: 'bg-sky-500/15 text-sky-200',
  processing: 'bg-violet-500/20 text-violet-200',
  ready: 'bg-emerald-500/15 text-emerald-200',
  failed: 'bg-red-500/15 text-red-200',
  expired: 'bg-white/10 text-white/50',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useI18n()
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {status === 'processing' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {t(`status.${status}`)}
    </span>
  )
}
