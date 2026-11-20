import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TAGLINE } from '../content/labels'
import { CLASSIC, COLLECTION, ROOMS } from '../escape/rooms'
import { formatDuration, hebrewWeekdayShort, formatHebDate, lastNDates } from '../engine/date'
import { daysPlayedLast7, rankInfo } from '../engine/rewards'
import { backupFor } from '../state/useSession'
import { listLedger, listRuns, type LedgerEntry, type Run } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Coin } from '../ui/art'
import { ErrorBox, Loading, ProgressBar, TiltCard } from '../ui/kit'
import { Vault3D } from '../ui/Vault3D'

export function Home() {
  const { profile, today } = useApp()
  const [data, setData] = useState<{ runs: Run[]; ledger: LedgerEntry[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([listRuns(), listLedger()])
      .then(([runs, ledger]) => setData({ runs, ledger }))
      .catch(() => setError(true))
  }, [today])

  if (error) return <ErrorBox title="לא הצלחנו לטעון את הנתונים" text="נסו לרענן את הדף." action={<button className="btn btn-gold" onClick={() => location.reload()}>רענון</button>} />
  if (!data || !profile) return <Loading />

  const r = rankInfo(profile.xp)
  const activity = data.runs.map((x) => x.date)
  const last7 = lastNDates(today, 7)
  const inProgress = ROOMS.map((room) => ({ room, s: backupFor(`solo-${room.id}`).load() })).filter((x) => x.s && x.s.phase === 'playing')

  return (
    <div className="space-y-4 py-2">
      <p className="text-mist">
        שלום, <b className="text-white">{profile.nickname}</b> {profile.avatar} · {TAGLINE}
      </p>

      <TiltCard className="card-hero overflow-hidden p-5 sm:p-6" max={4} role="region" aria-labelledby="hero-title">
        <div className="relative flex flex-col items-center text-center">
          <p className="engraved text-xs font-bold tracking-[.25em] text-gold">חדרי בריחה ממוחשבים</p>
          <Vault3D showcase className="-my-2 h-60 w-full sm:h-72" />
          <h1 id="hero-title" className="title-gold text-4xl sm:text-5xl">הכספת</h1>
          <p className="mx-auto mt-2 max-w-md text-mist">30 דקות. חפצים נסתרים, מנעולים ומחשבים נעולים. בורחים לבד — או עם עד 3 חברים, כל אחד מהטלפון שלו.</p>
        </div>
        <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
          <Link to="/escape" className="btn btn-gold text-lg">🗝️ חדרי בריחה</Link>
          <Link to="/coop" className="btn btn-ghost text-lg">👥 משחק עם חברים</Link>
        </div>
      </TiltCard>

      {inProgress.map(({ room }) => (
        <section key={room.id} className="card flex items-center justify-between gap-3 p-4" aria-label="משחק שמור">
          <div>
            <p className="text-sm text-dim">משחק שמור</p>
            <p className="font-bold">{room.emoji} {room.title}</p>
          </div>
          <Link to={`/solo/${room.id}`} className="btn btn-gold">המשך</Link>
        </section>
      ))}

      <section aria-labelledby="collection-title" className="card card-hero p-5">
        <h2 id="collection-title" className="font-display text-2xl font-bold">🗝️ חדרי בריחה — 7 חדרים חדשים</h2>
        <p className="mt-1 text-sm text-mist">טלפון נטוש, כספת מתוזמנת, לולאת זמן, מלון שמשתנה, תחנת חלל, חדר לשני שחקנים ולוח חקירה.</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
          {COLLECTION.map((r) => <li key={r.id} className="chip">{r.emoji} {r.title}</li>)}
          <li className="chip">🚪 שני צדדים של הדלת</li>
        </ul>
        <Link to="/escape" className="btn btn-gold mt-3 w-full text-lg">לחדרי הבריחה</Link>
      </section>

      <section aria-labelledby="rooms-title">
        <h2 id="rooms-title" className="mb-2 font-display text-2xl font-bold">חדרים נוספים</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CLASSIC.map((room) => {
            const mine = data.runs.filter((x) => x.roomId === room.id)
            const best = mine.length ? mine.reduce((a, b) => (b.timeMs < a.timeMs ? b : a)) : undefined
            return (
              <Link key={room.id} to={`/solo/${room.id}`} className="card tilt block p-4">
                <span className="text-3xl" aria-hidden="true">{room.emoji}</span>
                <p className="font-display text-xl font-bold">{room.title}</p>
                <p className="text-sm text-dim">{room.category} · {room.length}</p>
                <p className="mt-1 text-sm">{best ? <span className="text-teal-2">{'⭐'.repeat(best.stars)} {formatDuration(best.timeMs)}</span> : <span className="text-dim">🔒 עוד לא ברחתם</span>}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-4" aria-label="דרגה">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-extrabold">⭐ דרגה {r.rank}</h2>
            <span className="text-sm text-mist">{r.into}/{r.needed} XP</span>
          </div>
          <ProgressBar value={r.progress} label="התקדמות לדרגה הבאה" />
          <p className="mt-2 flex items-center gap-1 text-sm text-mist">
            <Coin /> {profile.coins} מטבעות · <Link to="/room" className="text-gold underline">לחדר שלי</Link>
          </p>
        </section>
        <section className="card p-4" aria-label="פעילות">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-extrabold">📅 7 הימים האחרונים</h2>
            <span className="text-sm text-mist">{daysPlayedLast7(activity, today)}/7</span>
          </div>
          <ul className="flex justify-between gap-1">
            {last7.map((d) => {
              const on = activity.includes(d)
              return (
                <li key={d} className="flex flex-col items-center gap-1 text-xs">
                  <span className={`grid h-9 w-9 place-items-center rounded-full border-2 font-bold ${on ? 'border-teal bg-teal/20 text-teal-2' : 'border-white/15 text-dim'} ${d === today ? 'ring-2 ring-gold/60' : ''}`} aria-label={`${hebrewWeekdayShort(d)} ${formatHebDate(d)}: ${on ? 'ברחתם' : 'לא שיחקתם'}`}>
                    {on ? '✓' : '·'}
                  </span>
                  <span className="text-dim">{hebrewWeekdayShort(d)}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-sm text-mist">בריחה ראשונה בכל יום: +50 XP ו־20 מטבעות.</p>
        </section>
      </div>
    </div>
  )
}
