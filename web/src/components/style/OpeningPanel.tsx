import { useRef, useState } from 'react'
import { errorKey, useI18n } from '../../i18n/I18nProvider'
import { ApiError } from '../../lib/api'
import { OWN_INTRO_ACCEPT, type useOwnIntro } from '../../lib/ownIntro'
import { ProgressBar } from '../ui'
import type { MessageKey } from '../../i18n/he'
import { TITLE_SIZE, TITLE_THEMES, TRANSITIONS, openingProblem, titleSample, type OpeningChoice, type Transition } from '../../lib/opening'
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
interface Props {
  choice: OpeningChoice
  onChange: (c: OpeningChoice) => void
  aspect: VideoAspect
  projectId: string
  /** The user's own opening clip (kept in their account). */
  own: ReturnType<typeof useOwnIntro>
}

export function OpeningPanel({ choice, onChange, aspect, projectId, own }: Props) {
  const { t, locale } = useI18n()
  const [preview, setPreview] = useState(false)
  const [ownUrl, setOwnUrl] = useState<string | null>(null)
  const [ownMissing, setOwnMissing] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const useOwn = choice.introSource === 'own'

  const togglePreview = async () => {
    if (preview) return setPreview(false)
    if (useOwn) {
      const url = await own.watchUrl()
      setOwnMissing(!url)
      setOwnUrl(url)
      if (!url) return
    }
    setPreview(true)
  }

  const uploadOwn = async (file: File) => {
    setUploadError(null)
    setOwnMissing(false)
    setPreview(false)
    setProgress(0)
    try {
      await own.upload(projectId, file, setProgress)
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setProgress(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  const set = <K extends keyof OpeningChoice>(k: K, v: OpeningChoice[K]) => onChange({ ...choice, [k]: v })
  const introSrc = aspect === '9:16' ? '/intro/intro-9x16.mp4' : aspect === '1:1' ? '/intro/intro-1x1.mp4' : '/intro/intro.mp4'
  const problem = openingProblem(choice, Boolean(own.intro))
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
      {choice.titleCard && (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="title-sizes">
          {(
            [
              ['artistSize', 'export.opening.artistSize'],
              ['songSize', 'export.opening.songSize'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block space-y-1">
              <span className="flex justify-between text-xs text-white/60">
                <span>{t(label)}</span>
                <span dir="ltr">{choice[k]}%</span>
              </span>
              <input
                type="range"
                min={TITLE_SIZE.min}
                max={TITLE_SIZE.max}
                step={TITLE_SIZE.step}
                value={choice[k]}
                onChange={(e) => set(k, Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </label>
          ))}
          <p className="text-xs text-white/50 sm:col-span-2">{t('export.opening.sizeHint')}</p>
        </div>
      )}
      {choice.titleCard && (
        <div className="space-y-1.5">
          <span className="text-xs text-white/60">{t('export.opening.theme')}</span>
          <div role="radiogroup" aria-label={t('export.opening.theme')} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="title-themes">
            {TITLE_THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                role="radio"
                aria-checked={choice.titleTheme === th.id}
                onClick={() => set('titleTheme', th.id)}
                className={`overflow-hidden rounded-xl text-start text-xs transition ${
                  choice.titleTheme === th.id ? 'bg-violet-500/30 font-semibold ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <img src={titleSample(th.id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <span className="block truncate px-1.5 py-1">{locale === 'he' ? th.he : th.en}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-10 flex-1 items-center gap-2 text-sm">
          <input type="checkbox" checked={choice.intro} onChange={(e) => set('intro', e.target.checked)} className="size-5 accent-violet-500" />
          🎞 {t('export.opening.intro')}
        </label>
        {(!useOwn || own.intro) && (
          <button type="button" onClick={() => void togglePreview()} className="min-h-9 rounded-lg bg-white/5 px-3 text-xs hover:bg-white/10">
            {preview ? t('export.opening.hidePreview') : `▶ ${t('export.opening.preview')}`}
          </button>
        )}
      </div>
      {choice.intro && (
        <div role="radiogroup" aria-label={t('export.opening.introSource')} className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
          {(['builtin', 'own'] as const).map((src) => (
            <button
              key={src}
              type="button"
              role="radio"
              aria-checked={choice.introSource === src}
              onClick={() => {
                setPreview(false)
                set('introSource', src)
              }}
              className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition ${
                choice.introSource === src ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              {t(src === 'builtin' ? 'export.opening.introBuiltin' : 'export.opening.introOwn')}
            </button>
          ))}
        </div>
      )}
      {choice.intro && useOwn && (
        <div className="space-y-2 rounded-xl bg-white/5 p-3 text-sm" data-testid="own-intro">
          {own.intro ? (
            <p className="truncate" dir="auto">
              🎞 {own.intro.name || t('export.opening.introOwn')}
              {own.intro.kind === 'image' && <span className="text-xs text-white/50"> · {t('export.opening.ownStill')}</span>}
            </p>
          ) : (
            <p className="text-xs text-white/60">{t('export.opening.ownNone')}</p>
          )}
          {ownMissing && <p className="text-xs text-amber-200">{t('error.intro_missing')}</p>}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-violet-500/25 px-3 text-xs font-semibold hover:bg-violet-500/35">
              ⬆ {t(own.intro ? 'export.opening.ownReplace' : 'export.opening.ownUpload')}
              <input
                ref={fileInput}
                type="file"
                accept={OWN_INTRO_ACCEPT}
                className="sr-only"
                aria-label={t(own.intro ? 'export.opening.ownReplace' : 'export.opening.ownUpload')}
                disabled={progress !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadOwn(f)
                }}
              />
            </label>
            {own.intro && (
              <button type="button" onClick={() => void own.remove().then(() => setPreview(false))}
                className="min-h-10 rounded-lg px-3 text-xs text-red-300 hover:bg-red-500/10">
                {t('export.opening.ownRemove')}
              </button>
            )}
          </div>
          {progress !== null && <ProgressBar value={progress} />}
          {uploadError && <p className="text-xs text-red-200">{t(errorKey(uploadError))}</p>}
          <p className="text-xs text-white/45">{t('export.opening.ownHint')}</p>
        </div>
      )}
      {preview && (
        <video key={useOwn ? ownUrl ?? '' : introSrc} src={useOwn ? ownUrl ?? '' : introSrc} controls autoPlay playsInline
          className="mx-auto max-h-64 rounded-xl" data-testid="intro-preview" />
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
