import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n/I18nProvider'
import { Logo } from './Logo'

export function Layout() {
  const { t, locale, setLocale } = useI18n()
  const { session, signOut } = useAuth()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'}`

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav className="flex items-center gap-1">
            {session && (
              <NavLink to="/projects" className={navClass}>
                <span className="hidden sm:inline">{t('nav.projects')}</span>
                <svg viewBox="0 0 24 24" className="size-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label={t('nav.projects')}>
                  <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                </svg>
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
              className="rounded-xl px-3 py-2 text-sm text-white/70 hover:text-white"
              lang={locale === 'he' ? 'en' : 'he'}
            >
              {t('nav.language')}
            </button>
            {session ? (
              <button type="button" onClick={signOut} className="rounded-xl px-3 py-2 text-sm text-white/70 hover:text-white">
                {t('nav.logout')}
              </button>
            ) : (
              <NavLink to="/login" className={navClass}>
                {t('nav.login')}
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <footer className="border-t border-white/5 py-6 text-center text-xs text-white/40">{t('footer.note')}</footer>
    </div>
  )
}
