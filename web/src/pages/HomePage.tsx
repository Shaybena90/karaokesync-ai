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
    <div className="pb-8">
      {!isSupabaseConfigured && (
        <div className="pt-6">
          <SetupNotice />
        </div>
      )}

      <section className="grid items-center gap-10 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="text-center lg:text-start">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-violet-200">
            <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_2px] shadow-violet-500/60" />
            {t('home.badge')}
          </span>
          <h1 className="mt-5 font-display text-4xl leading-tight font-extrabold sm:text-6xl">
            <span className="text-gradient">{t('home.title')}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg lg:mx-0">
            {t('home.subtitle')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <ButtonLink to="/upload" className="text-lg">
              {t('home.cta')}
            </ButtonLink>
            {session && (
              <ButtonLink to="/projects" variant="ghost">
                {t('home.secondary')}
              </ButtonLink>
            )}
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/60 lg:justify-start">
            <li className="flex items-center gap-2">
              <span aria-hidden="true">🌍</span>
              {t('home.languages')}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true">🔒</span>
              {t('home.privacy')}
            </li>
          </ul>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-violet-600/30 to-blue-600/20 blur-3xl" />
          <div className="glass rounded-[2rem] p-3 sm:p-4">
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
      </section>

      <section className="pt-20" aria-labelledby="how">
        <h2 id="how" className="text-center font-display text-2xl font-bold sm:text-3xl">
          {t('home.steps.title')}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="glass relative rounded-3xl p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-900/40">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="font-display text-4xl font-extrabold text-white/10">{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{t(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{t(s.body)}</p>
            </li>
          ))}
        </ol>
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
      <div className="flex h-10 items-end justify-center gap-1 opacity-70">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-sky-400"
            style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%`, opacity: i < 20 ? 1 : 0.35 }}
          />
        ))}
      </div>
      <p className="mt-4 text-center font-display text-xl font-bold sm:text-2xl">
        <span className="text-fuchsia-300 drop-shadow-[0_0_12px_rgba(232,121,249,0.6)]">♪ לָה </span>
        <span className="text-fuchsia-300 drop-shadow-[0_0_12px_rgba(232,121,249,0.6)]">לָה </span>
        <span className="text-white/45">לָה ♪</span>
      </p>
    </div>
  )
}
