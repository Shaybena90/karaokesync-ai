import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../state/AppState'
import { rankInfo } from '../engine/rewards'
import { Coin } from './art'
import { UpdateBanner } from './UpdateBanner'

const NAV = [
  { to: '/', label: 'בית', icon: '🏠' },
  { to: '/archive', label: 'ארכיון', icon: '🗂️' },
  { to: '/fix', label: 'לתקן', icon: '🔁' },
  { to: '/room', label: 'החדר שלי', icon: '🛋️' },
  { to: '/profile', label: 'פרופיל', icon: '👤' },
]

export function Layout() {
  const { profile } = useApp()
  const { pathname } = useLocation()
  const inGame = pathname.startsWith('/play')
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">דילוג לתוכן</a>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 text-xl font-extrabold" aria-label="הכספת — לדף הבית">
          <span aria-hidden="true">🔐</span>
          <span className="title-gold">הכספת</span>
        </NavLink>
        {profile && (
          <div className="flex items-center gap-2">
            <span className="chip" aria-label={`דרגה ${rankInfo(profile.xp).rank}`}>⭐ {rankInfo(profile.xp).rank}</span>
            <span className="chip" aria-label={`${profile.coins} מטבעות`}>
              <Coin /> {profile.coins}
            </span>
            <NavLink to="/profile" className="grid h-10 w-10 place-items-center rounded-full border-2 border-gold/60 bg-navy text-xl" aria-label="פרופיל">
              {profile.avatar}
            </NavLink>
          </div>
        )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl pt-2"><UpdateBanner /></div>
      <main id="main" className={`mx-auto w-full max-w-3xl flex-1 px-4 ${inGame ? 'pb-8' : 'pb-28'}`}>
        <Outlet />
      </main>
      {profile && !inGame && (
        <nav aria-label="ניווט ראשי" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="mx-auto grid max-w-3xl grid-cols-5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${isActive ? 'text-gold' : 'text-dim hover:text-mist'}`}
                >
                  <span className="text-xl" aria-hidden="true">{n.icon}</span>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
