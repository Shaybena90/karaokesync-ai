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
      <div className="stage" aria-hidden="true"><div className="stage-floor" /></div>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">דילוג לתוכן</a>
      <header className="sticky top-0 z-30 border-b border-gold/15 bg-ink/70 shadow-[0_10px_30px_-15px_rgba(0,0,0,.9)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <NavLink to="/" className="flex items-center gap-2 text-xl font-extrabold" aria-label="הכספת — לדף הבית">
          <span aria-hidden="true">🔐</span>
          <span className="title-gold text-2xl">הכספת</span>
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
        <nav aria-label="ניווט ראשי" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))]">
          <ul className="dock mx-auto grid max-w-xl grid-cols-5 rounded-3xl p-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold transition ${isActive ? 'bg-gradient-to-b from-gold/25 to-gold/5 text-gold-2 shadow-[inset_0_1px_0_rgba(255,233,168,.35),0_0_18px_-4px_rgba(242,193,78,.6)]' : 'text-dim hover:text-mist'}`}
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
