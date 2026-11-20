import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, ROOMS } from '../escape/rooms'
import { LEVEL_IDS, LEVELS } from '../escape/engine'
import type { Category } from '../escape/types'
import { formatDuration } from '../engine/date'
import { netMode, newRoomCode } from '../net/config'
import { listRuns, type Run } from '../storage/repo'
import { TiltCard } from '../ui/kit'

const CATEGORY_ICON: Record<Category, string> = { 'חדרי בריחה': '🔐', 'מחתרות': '🕯️', 'מלחמות ישראל': '🇮🇱', 'מלחמת העולם השנייה': '📻', 'מדע ודמיון': '🧪' }

/** Room picker, grouped by theme. ?mode=coop creates a co-op room for the chosen escape room. */
export function Rooms() {
  const [params] = useSearchParams()
  const coop = params.get('mode') === 'coop'
  const nav = useNavigate()
  const [runs, setRuns] = useState<Run[]>([])
  const [filter, setFilter] = useState<Category | 'all'>('all')
  useEffect(() => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }, [])

  const cats = CATEGORIES.filter((c) => filter === 'all' || c === filter)
  return (
    <div className="space-y-4 py-2">
      <h1 className="title-gold text-3xl">{coop ? 'בחרו חדר לצוות' : 'חדרי בריחה'}</h1>
      <p className="text-mist">{coop ? 'בחרו חדר, ותקבלו קוד להזמנת החברים. את רמת הקושי בוחרים בחדר ההמתנה.' : 'בחרו נושא וחדר. את רמת הקושי — קל, בינוני או קשה — בוחרים לפני שמתחילים.'}</p>
      {coop && netMode() === 'none' && <NoNetwork />}

      <div role="tablist" aria-label="נושאים" className="flex flex-wrap gap-2">
        <button role="tab" aria-selected={filter === 'all'} className={`btn ${filter === 'all' ? 'btn-gold' : 'btn-ghost'} !min-h-10 !px-4 !text-sm`} onClick={() => setFilter('all')}>הכול</button>
        {CATEGORIES.map((c) => (
          <button key={c} role="tab" aria-selected={filter === c} className={`btn ${filter === c ? 'btn-gold' : 'btn-ghost'} !min-h-10 !px-4 !text-sm`} onClick={() => setFilter(c)}>
            {CATEGORY_ICON[c]} {c}
          </button>
        ))}
      </div>

      {cats.map((cat) => (
        <section key={cat} aria-labelledby={`cat-${cat}`}>
          <h2 id={`cat-${cat}`} className="mb-2 font-display text-2xl font-bold">{CATEGORY_ICON[cat]} {cat}</h2>
          <ul className="space-y-3">
            {ROOMS.filter((r) => r.category === cat).map((r) => {
              const best = (lv: string) => {
                const mine = runs.filter((x) => x.roomId === r.id && (x.level ?? 'medium') === lv)
                return mine.length ? mine.reduce((a, b) => (b.timeMs < a.timeMs ? b : a)) : undefined
              }
              return (
                <li key={r.id}>
                  <TiltCard className="p-5" max={3}>
                    <div className="flex items-start gap-4">
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-gold/30 to-gold/5 text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,.2)]" aria-hidden="true">{r.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-2xl font-bold">{r.title}</h3>
                        <p className="text-sm text-dim">בערך {r.length} · {r.scenes.length} אזורים</p>
                        <p className="mt-1 text-sm text-mist">{r.story}</p>
                        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="שיאים לפי רמה">
                          {LEVEL_IDS.map((lv) => {
                            const b = best(lv)
                            return (
                              <li key={lv} className={`chip !text-xs ${b ? 'border-teal/50 text-teal-2' : 'text-dim'}`}>
                                {LEVELS[lv].label}: {b ? `${'⭐'.repeat(b.stars) || '✓'} ${formatDuration(b.timeMs)}` : '—'}
                              </li>
                            )
                          })}
                        </ul>
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
        </section>
      ))}
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
