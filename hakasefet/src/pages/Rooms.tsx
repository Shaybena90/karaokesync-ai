import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ROOMS } from '../escape/rooms'
import { formatDuration } from '../engine/date'
import { netMode, newRoomCode } from '../net/config'
import { listRuns, type Run } from '../storage/repo'
import { TiltCard } from '../ui/kit'

/** Room picker. ?mode=coop creates a co-op room for the chosen escape room. */
export function Rooms() {
  const [params] = useSearchParams()
  const coop = params.get('mode') === 'coop'
  const nav = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  useEffect(() => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }, [])

  return (
    <div className="space-y-3 py-2">
      <h1 className="title-gold text-3xl">{coop ? 'בחרו חדר לצוות' : 'חדרי בריחה'}</h1>
      <p className="text-mist">{coop ? 'בחרו חדר, ותקבלו קוד להזמנת החברים.' : 'בחרו חדר. 30 דקות על השעון — אפשר לשחק לבד או עם חברים.'}</p>
      {coop && netMode() === 'none' && <NoNetwork />}
      <ul className="space-y-3">
        {ROOMS.map((r) => {
          const mine = runs.filter((x) => x.roomId === r.id)
          const best = mine.length ? mine.reduce((a, b) => (b.timeMs < a.timeMs ? b : a)) : undefined
          return (
            <li key={r.id}>
              <TiltCard className="p-5" max={3}>
                <div className="flex items-start gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-gold/30 to-gold/5 text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,.2)]" aria-hidden="true">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-bold">{r.title}</h2>
                    <p className="text-sm text-dim">רמה: {r.difficulty} · {r.minutes} דקות</p>
                    <p className="mt-1 text-sm text-mist">{r.story}</p>
                    <p className="mt-1 text-sm">{best ? <span className="text-teal-2">✓ ברחתם · שיא {formatDuration(best.timeMs)} {'⭐'.repeat(best.stars)}</span> : <span className="text-dim">🔒 עוד לא ברחתם מכאן</span>}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {coop ? (
                    <button className="btn btn-gold flex-1" disabled={netMode() === 'none'} onClick={() => nav(`/coop/${newRoomCode()}?room=${r.id}`)}>
                      פתיחת חדר לצוות
                    </button>
                  ) : (
                    <>
                      <Link to={`/solo/${r.id}`} className="btn btn-gold flex-1">לבד</Link>
                      <Link to={`/rooms?mode=coop`} className="btn btn-ghost flex-1">עם חברים</Link>
                    </>
                  )}
                </div>
              </TiltCard>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function NoNetwork() {
  return (
    <div role="note" className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
      <p className="mb-1 font-bold text-gold">משחק עם חברים עוד לא הופעל באתר הזה</p>
      <p className="text-mist">כדי לשחק ברשת צריך לחבר את המשחק לשרת (Supabase). ההוראות נמצאות בקובץ README של הפרויקט. בינתיים אפשר לשחק לבד.</p>
    </div>
  )
}
