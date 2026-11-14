import { useI18n } from '../../i18n/I18nProvider'
import { ANIMATED_BACKGROUNDS, animatedThumbUrl } from '../../lib/animatedBackgrounds'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
}

/**
 * Built-in moving backgrounds that loop for the whole song (in the preview and
 * in the exported video): 3D scenes first, then the classic ones. The colour
 * gradient shows when none is chosen.
 */
export function AnimatedBackgroundPicker({ value, onChange }: Props) {
  const { t, locale } = useI18n()
  const card = (selected: boolean) =>
    `group overflow-hidden rounded-xl text-start text-xs transition ${
      selected ? 'bg-violet-500/30 font-semibold ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'
    }`
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-white/60">{t('style.animatedBg')}</span>
      <div
        role="radiogroup"
        aria-label={t('style.animatedBg')}
        className="grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto p-0.5"
        data-testid="animated-backgrounds"
      >
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={card(value === null)}>
          <span className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-800 to-violet-900 text-lg">🚫</span>
          <span className="block truncate px-1.5 py-1">{t('style.animatedBg.none')}</span>
        </button>
        {[...ANIMATED_BACKGROUNDS.filter((b) => b.kind === '3d'), ...ANIMATED_BACKGROUNDS.filter((b) => b.kind !== '3d')].map((bg) => (
          <button
            key={bg.id}
            type="button"
            role="radio"
            aria-checked={value === bg.id}
            onClick={() => onChange(bg.id)}
            className={card(value === bg.id)}
            data-bg-id={bg.id}
          >
            <span className="relative block">
              <img src={animatedThumbUrl(bg.id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              {bg.kind === '3d' && (
                <span className="absolute end-1 top-1 rounded-md bg-black/60 px-1 text-[10px] font-bold leading-4 text-amber-200">3D</span>
              )}
            </span>
            <span className="block truncate px-1.5 py-1">
              {bg.kind === '3d' && <span className="sr-only">3D </span>}
              {locale === 'he' ? bg.he : bg.en}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-white/45">{t('style.animatedBgHint')}</p>
    </div>
  )
}
