import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { COLLECTION } from '../escape/rooms'
import { puzzleStatus } from '../escape/engine'
import type { RoomDef } from '../escape/types'
import { PAIR_ROOM } from '../pair/meta'
import { backupFor } from '../state/useSession'
import { listRuns, type Run } from '../storage/repo'
import { RoomIllustration } from '../ui/escape/collection'
import { ObjectArt, SceneBackground, SceneDefs } from '../ui/escape/sceneArt'

function progressOf(room: RoomDef, runs: Run[]) {
  const mine = runs.filter((r) => r.roomId === room.id)
  const best = mine.length ? Math.max(...mine.map((r) => r.points ?? 0)) : undefined
  const saved = backupFor(`solo-${room.id}`).load()
  const playing = saved && saved.phase === 'playing' ? puzzleStatus(room, saved).filter((x) => x.done).length : undefined
  return { done: mine.length > 0, best, playing }
}

/** The escape-room collection: seven rooms, each with its own mechanics. */
export function Escape() {
  const [runs, setRuns] = useState<Run[]>([])
  useEffect(() => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }, [])
  return (
    <div className="space-y-4 py-2">
      <h1 className="title-gold text-3xl">חדרי בריחה</h1>
      <p className="text-mist">שבעה חדרים, כל אחד עם עולם וחוקים משלו. בכל חדר שישה שלבים מחוברים. ההתקדמות נשמרת — אפשר לצאת ולחזור.</p>
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="catalog">
        {COLLECTION.map((r) => {
          const p = progressOf(r, runs)
          return (
            <li key={r.id} className="card overflow-hidden p-0" data-room={r.id}>
              <RoomIllustration room={r} className="h-36 w-full" />
              <div className="p-4">
                <h2 className="font-display text-2xl font-bold">{r.emoji} {r.title}</h2>
                <p className="mt-1 text-sm text-mist">{r.blurb}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <li className="chip">קושי: {r.difficultyLabel}</li>
                  <li className="chip">⏱ {r.length}</li>
                  <li className="chip">👤 שחקן אחד</li>
                </ul>
                <p className="mt-2 text-sm" aria-label="התקדמות">
                  {p.playing !== undefined ? <span className="text-gold">▶ בתהליך — {p.playing}/6 שלבים</span> : p.done ? <span className="text-teal-2">✓ הושלם · שיא {p.best} נקודות</span> : <span className="text-dim">עוד לא שוחק</span>}
                </p>
                <Link to={`/solo/${r.id}`} className="btn btn-gold mt-3 w-full">{p.playing !== undefined ? 'המשך' : p.done ? 'לשחק שוב' : 'התחלה'}</Link>
              </div>
            </li>
          )
        })}
        <li className="card overflow-hidden p-0" data-room="pair">
          <svg viewBox="0 0 800 600" className="block h-36 w-full" aria-hidden="true">
            <SceneDefs />
            <SceneBackground theme="hotel" />
            <g transform="translate(150 140)"><ObjectArt art="door" w={200} h={320} active={false} /></g>
            <g transform="translate(450 140)"><ObjectArt art="door" w={200} h={320} active={false} /></g>
          </svg>
          <div className="p-4">
            <h2 className="font-display text-2xl font-bold">{PAIR_ROOM.emoji} {PAIR_ROOM.title}</h2>
            <p className="mt-1 text-sm text-mist">{PAIR_ROOM.blurb}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <li className="chip">קושי: {PAIR_ROOM.difficultyLabel}</li>
              <li className="chip">⏱ {PAIR_ROOM.length}</li>
              <li className="chip">👥 2 שחקנים, 2 מכשירים</li>
            </ul>
            <p className="mt-2 text-sm" aria-label="התקדמות">{runs.some((r) => r.roomId === 'pair') ? <span className="text-teal-2">✓ הושלם</span> : <span className="text-dim">עוד לא שוחק</span>}</p>
            <Link to="/pair" className="btn btn-gold mt-3 w-full">לחדר הזוגי</Link>
          </div>
        </li>
      </ul>
      <section className="card p-4">
        <h2 className="font-bold">🏛️ חדרים נוספים</h2>
        <p className="text-sm text-mist">החדרים ההיסטוריים — מחתרות, מלחמות ישראל, מלחמת העולם השנייה — עם רמות קושי ומשחק צוותי.</p>
        <Link to="/rooms" className="btn btn-ghost mt-2 w-full">לחדרים הנוספים</Link>
      </section>
    </div>
  )
}
