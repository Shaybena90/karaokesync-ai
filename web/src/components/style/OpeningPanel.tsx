import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/he'
import { TRANSITIONS, openingProblem, type OpeningChoice, type Transition } from '../../lib/opening'
import type { VideoAspect } from '../player/KaraokePlayer'

const ICONS: Record<Transition, string> = {
  fade: '🌫', fadeblack: '⬛', fadewhite: '⚡', dissolve: '✨', circleopen: '⭕', circleclose: '🎯', radial: '🕐',
  pixelize: '👾', zoomin: '🔍', slideleft: '⬅', smoothleft: '🌊', hblur: '💨', diagtl: '◩', squeezeh: '↔', horzopen: '🎭',
  none: '✂',
}

/**
 * Before a video is made: the KaraokeSync opening clip, a luxurious 3D title
 * with the song and the singer, and the transition into the karaoke.
 */
export function OpeningPanel({ choice, onChange, aspect }: { choice: OpeningChoice; onChange: (c: OpeningChoice) => void; aspect: VideoAspect }) {
  const { t } = useI18n()
  const [preview, setPreview] = useState(false)
  const set = <K extends keyof OpeningChoice>(k: K, v: OpeningChoice[K]) => onChange({ ...choice, [k]: v })
  const introSrc = aspect === '9:16' ? '/intro/intro-9x16.mp4' : aspect === '1:1' ? '/intro/intro-1x1.mp4' : '/intro/intro.mp4'
  const problem = openingProblem(choice)
  const input = 'min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-base focus:border-violet-400 focus:outline-none'

  return (
    <fieldset className="space-y-3 rounded-2xl border border-white/10 p-3" data-testid="opening">
      <legend className="px-1 text-sm font-semibold text-white/80">🎬 {t('export.opening.title')}</legend>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-white/60">{t('export.opening.song')}</span>
          <input value={choice.song} maxLength={120} dir="auto" onChange={(e) => set('song', e.target.value)} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-white/60">{t('export.opening.artist')}</span>
          <input value={choice.artist} maxLength={120} dir="auto" onChange={(e) => set('artist', e.target.value)} className={input} />
        </label>
      </div>

      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={choice.titleCard} onChange={(e) => set('titleCard', e.target.checked)} className="size-5 accent-violet-500" />
        ✨ {t('export.opening.titleCard')}
      </label>
      {problem && <p className="-mt-2 text-xs text-amber-200">{t(problem as MessageKey)}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 text-sm">
          <input type="checkbox" checked={choice.intro} onChange={(e) => set('intro', e.target.checked)} className="size-5 accent-violet-500" />
          🎞 {t('export.opening.intro')}
        </label>
        <button type="button" onClick={() => setPreview(!preview)} className="min-h-9 rounded-lg bg-white/5 px-3 text-xs hover:bg-white/10">
          {preview ? t('export.opening.hidePreview') : `▶ ${t('export.opening.preview')}`}
        </button>
      </div>
      {preview && (
        <video key={introSrc} src={introSrc} controls autoPlay playsInline className="mx-auto max-h-64 rounded-xl" data-testid="intro-preview" />
      )}

      {(choice.intro || choice.titleCard) && (
        <div className="space-y-1.5">
          <span className="text-xs text-white/60">{t('export.opening.transition')}</span>
          <div role="radiogroup" aria-label={t('export.opening.transition')} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TRANSITIONS.map((tr) => (
              <button
                key={tr}
                type="button"
                role="radio"
                aria-checked={choice.transition === tr}
                onClick={() => set('transition', tr)}
                className={`min-h-10 rounded-xl px-2 text-xs transition ${
                  choice.transition === tr ? 'bg-violet-500/30 font-semibold ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <span aria-hidden="true">{ICONS[tr]}</span> {t(`export.transition.${tr}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-white/45">{t('export.opening.hint')}</p>
    </fieldset>
  )
}
