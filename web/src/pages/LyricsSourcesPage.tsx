import { SourcesManager } from '../components/LyricsSearchPanel'
import { ButtonLink } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import { useLyricsSources } from '../lib/lyricsSources'

/** A page of its own for "My lyrics websites" (also reachable inside every lyrics search). */
export function LyricsSourcesPage() {
  const { t } = useI18n()
  const { sources, loaded, add, remove } = useLyricsSources()
  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-8 sm:pt-12">
      <div>
        <h1 className="font-display text-3xl font-bold">📚 {t('lyrics.sources.title')}</h1>
        <p className="mt-2 text-white/60">{t('lyrics.sources.pageIntro')}</p>
      </div>
      <ol className="glass list-decimal space-y-1.5 rounded-3xl p-5 ps-9 text-sm text-white/80">
        <li>{t('lyrics.sources.step1')}</li>
        <li>{t('lyrics.sources.step2')}</li>
        <li>{t('lyrics.sources.step3')}</li>
      </ol>
      {loaded && <SourcesManager sources={sources} add={add} remove={remove} defaultOpen />}
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink to="/upload">{t('lyrics.sources.tryIt')}</ButtonLink>
        <p className="text-xs text-white/50">{t('lyrics.sources.whereUsed')}</p>
      </div>
    </div>
  )
}
