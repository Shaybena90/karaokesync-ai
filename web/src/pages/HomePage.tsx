import { useNavigate } from 'react-router-dom'
import { Dropzone } from '../components/Dropzone'
import { SetupNotice } from '../components/SetupNotice'
import { ButtonLink } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n/I18nProvider'
import { isSupabaseConfigured } from '../lib/supabase'
import { usePendingFile } from '../lib/pendingFile'
import { useLimits } from '../lib/useLimits'

const steps = [
  {
    title: 'home.step1.title',
    body: 'home.step1.body',
    icon: 'M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  },
  {
    title: 'home.step2.title',
    body: 'home.step2.body',
    icon: 'M3 12h2m3-5v10m4-13v16m4-11v6m4-4h1',
  },
  {
    title: 'home.step3.title',
    body: 'home.step3.body',
    icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  },
] as const

const features = [
  { icon: '🎯', title: 'home.f.sync.title', body: 'home.f.sync.body' },
  { icon: '🎬', title: 'home.f.uhd.title', body: 'home.f.uhd.body' },
  { icon: '✨', title: 'home.f.design.title', body: 'home.f.design.body' },
  { icon: '🎚️', title: 'home.f.timeline.title', body: 'home.f.timeline.body' },
] as const

/** A few of the built-in 3D scenes, shown as a moving gallery (their real preview pictures). */
const GALLERY = ['aurora-night', 'vinyl-spin', 'galaxy-spiral', 'mic-spotlight', 'golden-bokeh', 'stage-lights', 'neon-tunnel', 'city-fireworks']

export function HomePage() {
  const { t } = useI18n()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [, setPending] = usePendingFile()
  const limits = useLimits()

  const onFile = (file: File) => {
    setPending(file)
    navigate('/upload')
  }

  return (
    <div className="pb-12">
      {!isSupabaseConfigured && (
        <div className="pt-6">
          <SetupNotice />
        </div>
      )}

      {/* Hero: a real 3D background of the app moving behind, the upload right there */}
      <section className="relative isolate mt-4 overflow-hidden rounded-[2.5rem] border border-white/10 sm:mt-6">
        <video
          aria-hidden="true"
          className="absolute inset-0 -z-20 size-full object-cover opacity-60 motion-reduce:hidden"
          src="/backgrounds/aurora-night.mp4"
          poster="/backgrounds/aurora-night.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-l from-ink-950/95 via-ink-950/80 to-ink-950/40" />
        <div aria-hidden="true" className="absolute -top-32 start-1/3 -z-10 size-96 rounded-full bg-violet-600/30 blur-3xl" />

        <div className="grid items-center gap-10 px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div className="min-w-0 text-center lg:text-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-200/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-amber-100">
              <span aria-hidden="true">✦</span>
              {t('home.badge')}
            </span>
            <h1 className="mt-5 font-display text-4xl leading-[1.1] font-extrabold sm:text-6xl">
              <span className="text-gradient">{t('home.title')}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg lg:mx-0">{t('home.subtitle')}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <ButtonLink to="/upload" className="min-h-14 px-8 text-lg shadow-xl shadow-violet-900/50">
                <span aria-hidden="true">🎤</span>
                {t('home.cta')}
              </ButtonLink>
              {session && (
                <ButtonLink to="/projects" variant="ghost" className="min-h-14 px-7">
                  <span aria-hidden="true">📁</span>
                  {t('home.secondary')}
                </ButtonLink>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm text-white/75 lg:justify-start">
              {(['home.trust.languages', 'home.trust.uhd', 'home.trust.privacy'] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 backdrop-blur">
                  <span aria-hidden="true">{['🌍', '💎', '🔒'][i]}</span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-w-0">
            <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-violet-600/35 to-blue-600/25 blur-3xl" />
            <div className="rounded-[2rem] border border-white/15 bg-ink-950/60 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
              <KaraokeTeaser />
              <div className="mt-3">
                <Dropzone
                  onFile={onFile}
                  maxMb={Math.round(limits.max_upload_bytes / 1024 / 1024)}
                  maxMinutes={Math.round(limits.max_audio_duration_seconds / 60)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="pt-16" aria-labelledby="features">
        <h2 id="features" className="text-center font-display text-2xl font-bold sm:text-3xl">
          {t('home.features.title')}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-white/60">{t('home.features.subtitle')}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <li
              key={f.title}
              className="group rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 transition hover:-translate-y-1 hover:border-violet-300/40"
            >
              <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-2xl shadow-lg shadow-violet-900/40 transition group-hover:scale-110">
                {f.icon}
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{t(f.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{t(f.body)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* A glimpse of the 3D scenes */}
      <section className="pt-16" aria-labelledby="gallery">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="gallery" className="font-display text-2xl font-bold sm:text-3xl">
              {t('home.gallery.title')}
            </h2>
            <p className="mt-1 text-white/60">{t('home.gallery.subtitle')}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GALLERY.map((id) => (
            <figure key={id} className="group relative overflow-hidden rounded-2xl border border-white/10 shadow-lg">
              <img src={`/backgrounds/${id}.jpg`} alt="" loading="lazy" className="aspect-video w-full object-cover transition duration-500 group-hover:scale-110" />
              <span aria-hidden="true" className="absolute end-2 top-2 rounded-md bg-black/60 px-1.5 text-[10px] font-bold leading-5 text-amber-200">
                3D
              </span>
            </figure>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="pt-16" aria-labelledby="how">
        <h2 id="how" className="text-center font-display text-2xl font-bold sm:text-3xl">
          {t('home.steps.title')}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-900/40">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="font-display text-sm font-bold text-violet-200">
                  {t('home.stepLabel')} {i + 1}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{t(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{t(s.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Final invitation */}
      <section className="relative mt-16 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-violet-700/40 via-ink-900 to-blue-700/30 px-6 py-10 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">{t('home.final.title')}</h2>
        <p className="mx-auto mt-2 max-w-xl text-white/70">{t('home.final.body')}</p>
        <div className="mt-6 flex justify-center">
          <ButtonLink to="/upload" className="min-h-14 px-8 text-lg">
            <span aria-hidden="true">🎤</span>
            {t('home.final.cta')}
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}

/** Purely decorative illustration of the karaoke highlight (no fake data). */
function KaraokeTeaser() {
  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-800 to-ink-900 px-5 py-6 ring-1 ring-white/5"
    >
      <div className="flex h-10 items-end justify-center gap-1 overflow-hidden opacity-70">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-sky-400"
            style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%`, opacity: i < 20 ? 1 : 0.35 }}
          />
        ))}
      </div>
      <p className="mt-4 text-center font-display text-xl font-bold sm:text-2xl">
        {['♪ לָה', 'לָה', 'לָה ♪'].map((w, i) => (
          <span key={i} className="ks-teaser-word" style={{ animationDelay: `${i * 0.8}s` }}>
            {w}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}
