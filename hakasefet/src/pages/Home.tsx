import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentPack, getPack } from '../content'
import { CATEGORY_LABEL, LEVEL_LABEL, TAGLINE } from '../content/labels'
import type { Attempt } from '../engine/attempt'
import { formatHebDate, hebrewWeekdayShort, lastNDates, weekStart } from '../engine/date'
import { activeDaysInWeek, daysPlayedLast7, rankInfo, WEEKLY_COINS, WEEKLY_REQUIRED_DAYS } from '../engine/rewards'
import { mysteryForDate } from '../engine/selection'
import { getActiveAttempt, listHistory, listLedger, type HistoryEntry, type LedgerEntry } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Coin } from '../ui/art'
import { ErrorBox, Loading, ProgressBar, TiltCard } from '../ui/kit'
import { Vault3D } from '../ui/Vault3D'

export function Home() {
  const { profile, today } = useApp()
  const [data, setData] = useState<{ active?: Attempt; history: HistoryEntry[]; ledger: LedgerEntry[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getActiveAttempt(), listHistory(), listLedger()])
      .then(([active, history, ledger]) => alive && setData({ active, history, ledger }))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [today])

  if (error) return <ErrorBox title="לא הצלחנו לטעון את הנתונים" text="נסו לרענן את הדף." action={<button className="btn btn-gold" onClick={() => location.reload()}>רענון</button>} />
  if (!data || !profile) return <Loading />

  const pack = currentPack()
  const mystery = mysteryForDate(pack, today)
  const todayDone = data.history.filter((h) => h.vaultDate === today && h.mysteryId === mystery.id)
  const rewarded = data.ledger.some((l) => l.key === `daily:${today}`)
  const best = todayDone.reduce((m, h) => Math.max(m, h.score), -1)
  const active = data.active
  const activeIsToday = active && active.vaultDate === today && active.mode === 'daily'
  const activeMystery = active ? getPack(active.contentVersion)?.mysteries.find((m) => m.id === active.mysteryId) : undefined
  const activityDates = data.ledger.filter((l) => l.kind === 'daily').map((l) => l.date)
  const last7 = lastNDates(today, 7)
  const weekCount = activeDaysInWeek(activityDates, today)
  const weeklyGot = data.ledger.some((l) => l.key === `weekly:${weekStart(today)}`)
  const r = rankInfo(profile.xp)

  return (
    <div className="space-y-4 py-2">
      <p className="text-mist">
        שלום, <b className="text-white">{profile.nickname}</b> {profile.avatar} · {TAGLINE}
      </p>

      {/* today's vault */}
      <TiltCard className="card-hero overflow-hidden p-5 sm:p-6" aria-labelledby="today-title" role="region" max={4}>
        <div className="relative flex flex-col items-center text-center">
          <p className="engraved text-xs font-bold uppercase tracking-[.25em] text-gold">הכספת של היום · {formatHebDate(today)}</p>
          <Vault3D showcase className="-my-2 h-64 w-full sm:h-72" />
          <div className="min-w-0">
            <h1 id="today-title" className="title-gold text-3xl sm:text-4xl">{mystery.emoji} {mystery.title}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mist">{mystery.teaser}</p>
            <p className="mt-2 text-sm">
              {rewarded ? (
                <span className="text-teal-2">✓ נפתחה היום{best >= 0 && ` · שיא: ${best}`}</span>
              ) : activeIsToday ? (
                <span className="text-gold-2">⏳ בתהליך</span>
              ) : (
                <span className="text-dim">🔒 עדיין נעולה</span>
              )}
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2">
          {activeIsToday ? (
            <Link to="/play" className="btn btn-gold flex-1">המשך משחק</Link>
          ) : (
            <Link to={`/vault?d=${today}`} className="btn btn-gold flex-1 text-lg">{rewarded ? 'לשחק שוב (אימון)' : 'לכספת של היום'}</Link>
          )}
        </div>
      </TiltCard>

      {/* saved game from another vault */}
      {active && !activeIsToday && (
        <section className="card flex items-center justify-between gap-3 p-4" aria-label="משחק שמור">
          <div>
            <p className="text-sm text-dim">משחק שמור · {formatHebDate(active.vaultDate)}{active.level && ` · ${LEVEL_LABEL[active.level]}`}</p>
            <p className="font-bold">{activeMystery ? `${activeMystery.emoji} ${activeMystery.title}` : 'כספת'}</p>
            <p className="text-sm text-mist">{active.roomOrder.length}/3 חדרים{active.roomOrder.length > 0 && ` (${active.roomOrder.map((c) => CATEGORY_LABEL[c]).join(', ')})`}</p>
          </div>
          <Link to="/play" className="btn btn-ghost">המשך</Link>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* rank */}
        <section className="card p-4" aria-label="דרגה">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-extrabold">⭐ דרגה {r.rank}</h2>
            <span className="text-sm text-mist">{r.into}/{r.needed} XP</span>
          </div>
          <ProgressBar value={r.progress} label="התקדמות לדרגה הבאה" />
          <p className="mt-2 flex items-center gap-1 text-sm text-mist">
            <Coin /> {profile.coins} מטבעות עיצוב · <Link to="/room" className="text-gold underline">לחדר שלי</Link>
          </p>
        </section>

        {/* week */}
        <section className="card p-4" aria-label="פעילות השבוע">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-extrabold">📅 7 הימים האחרונים</h2>
            <span className="text-sm text-mist">{daysPlayedLast7(activityDates, today)}/7 ימי משחק</span>
          </div>
          <ul className="flex justify-between gap-1">
            {last7.map((d) => {
              const on = activityDates.includes(d)
              return (
                <li key={d} className="flex flex-col items-center gap-1 text-xs">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-full border-2 font-bold ${on ? 'border-teal bg-teal/20 text-teal-2' : 'border-white/15 text-dim'} ${d === today ? 'ring-2 ring-gold/60' : ''}`}
                    aria-label={`${hebrewWeekdayShort(d)} ${formatHebDate(d)}: ${on ? 'שוחק' : 'לא שוחק'}`}
                  >
                    {on ? '✓' : '·'}
                  </span>
                  <span className="text-dim">{hebrewWeekdayShort(d)}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-sm text-mist">
            {weeklyGot ? `✓ קיבלתם השבוע בונוס של ${WEEKLY_COINS} מטבעות` : `בונוס שבועי: ${Math.min(weekCount, WEEKLY_REQUIRED_DAYS)}/${WEEKLY_REQUIRED_DAYS} ימים השבוע (א׳–ש׳) → ${WEEKLY_COINS} מטבעות`}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/archive" className="card tilt p-4">
          <p className="text-2xl" aria-hidden="true">🗂️</p>
          <p className="font-bold">ארכיון</p>
          <p className="text-sm text-dim">כספות מהשבוע האחרון</p>
        </Link>
        <Link to="/fix" className="card tilt p-4">
          <p className="text-2xl" aria-hidden="true">🔁</p>
          <p className="font-bold">ההזדמנות לתקן</p>
          <p className="text-sm text-dim">שאלות שטעיתם בהן</p>
        </Link>
      </div>
    </div>
  )
}
