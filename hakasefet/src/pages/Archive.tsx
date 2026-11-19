import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentPack } from '../content'
import { addDays, formatHebDate, hebrewWeekdayShort } from '../engine/date'
import { mysteryForDate } from '../engine/selection'
import { listHistory, type HistoryEntry } from '../storage/repo'
import { useApp } from '../state/AppState'
import { ErrorBox, Loading } from '../ui/kit'
import { ARCHIVE_DAYS } from './VaultIntro'

export function Archive() {
  const { today } = useApp()
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    listHistory().then(setHistory).catch(() => setError(true))
  }, [])
  if (error) return <ErrorBox title="לא הצלחנו לטעון את הארכיון" text="נסו לרענן את הדף." />
  if (!history) return <Loading />
  const pack = currentPack()
  const dates = Array.from({ length: ARCHIVE_DAYS }, (_, i) => addDays(today, -(i + 1)))

  return (
    <div className="space-y-3 py-2">
      <h1 className="text-2xl font-extrabold">🗂️ ארכיון הכספות</h1>
      <p className="text-mist">הכספות של שבעת הימים האחרונים. משחק בארכיון הוא אימון: הוא יכול לשבור שיא אישי, אבל לא נותן פרס יומי ולא נספר כיום פעילות.</p>
      <ul className="space-y-2">
        {dates.map((d) => {
          const m = mysteryForDate(pack, d)
          const plays = history.filter((h) => h.vaultDate === d && h.mysteryId === m.id)
          const best = plays.reduce((x, h) => Math.max(x, h.score), -1)
          return (
            <li key={d} className="card flex items-center gap-3 p-4">
              <span className="text-3xl" aria-hidden="true">{m.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-dim">יום {hebrewWeekdayShort(d)} · {formatHebDate(d)}</p>
                <p className="truncate font-bold">{m.title}</p>
                <p className="text-sm">{plays.length ? <span className="text-teal-2">✓ נפתחה · שיא {best}</span> : <span className="text-dim">🔒 לא נפתחה</span>}</p>
              </div>
              <Link to={`/vault?d=${d}`} className="btn btn-ghost shrink-0" aria-label={`${plays.length ? 'לשחק שוב' : 'לשחק'}: ${m.title}`}>
                {plays.length ? 'שוב' : 'לשחק'}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
