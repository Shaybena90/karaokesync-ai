import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRoom } from '../escape/rooms'
import { backupFor, useSession } from '../state/useSession'
import { EscapeGame } from '../ui/escape/EscapeGame'
import { EscapeResult } from '../ui/escape/EscapeResult'
import { ErrorBox, Loading, Modal, TiltCard } from '../ui/kit'
import { Vault3D } from '../ui/Vault3D'
import { LevelPicker } from '../ui/escape/LevelPicker'
import { levelOf } from '../escape/engine'
import type { RoomDef } from '../escape/types'
import type { GameSession } from '../net/session'
import type { GameState } from '../escape/engine'
import { RoomIllustration } from '../ui/escape/collection'

/** Solo play. Progress is kept on this device, so a refresh continues the same game. */
export function Solo() {
  const { roomId = '' } = useParams()
  const room = getRoom(roomId)
  const [round, setRound] = useState(0)
  if (!room) return <ErrorBox title="החדר לא נמצא" text="אולי הקישור שגוי." action={<Link className="btn btn-gold" to="/escape">לחדרי הבריחה</Link>} />
  return <SoloGame key={round} roomId={room.id} onRestart={() => setRound((r) => r + 1)} />
}

function SoloGame({ roomId, onRestart }: { roomId: string; onRestart: () => void }) {
  const room = getRoom(roomId)!
  const code = `solo-${room.id}`
  const { snap, session } = useSession({ code, roomId: room.id, transport: () => null, solo: true })
  const [confirm, setConfirm] = useState(false)

  const restart = () => {
    backupFor(code).clear()
    setConfirm(false)
    onRestart()
  }

  const escaped = snap?.state?.phase === 'escaped'
  const showResult = useAfter(escaped, 2600)
  if (!snap?.state || !session) return <Loading text="מכינים את החדר…" />
  const s = snap.state
  if (s.phase === 'escaped' && showResult) return <EscapeResult room={room} state={s} code={code} mode="solo" players={1} onAgain={restart} />
  if (s.phase === 'lobby' && room.puzzles) return <CollectionLobby room={room} state={s} session={session} />
  if (s.phase === 'lobby')
    return (
      <div className="mx-auto max-w-lg py-2">
        <TiltCard className="card-hero p-6 text-center" max={3}>
          <Vault3D className="-my-2 h-52 w-full" />
          <h1 className="title-gold text-4xl">{room.emoji} {room.title}</h1>
          <p className="mt-1 text-sm text-dim">{room.category} · בערך {room.length}</p>
          <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed text-mist">{room.story}</p>
          {room.history && <p className="mx-auto mt-3 max-w-md rounded-xl border border-gold/25 bg-gold/5 p-3 text-right text-sm text-mist">📜 {room.history}</p>}
          <div className="mx-auto mt-4 max-w-md"><LevelPicker value={levelOf(s)} onChange={(level) => session.dispatch({ type: 'SET_LEVEL', level })} /></div>
          <ul className="mx-auto mt-4 max-w-md space-y-1 text-right text-sm text-mist">
            <li>👆 לוחצים על חפצים בחדר כדי לבחון אותם.</li>
            <li>🎒 חפצים שמוצאים נכנסים לתיק — משתמשים בהם על חפצים אחרים.</li>
            <li>🔐 פותחים מנעולים בעזרת רמזים שמסתתרים בחדר.</li>
            <li>💡 נתקעתם? רמז מוסיף דקה לזמן.</li>
          </ul>
          <button className="btn btn-gold mt-5 w-full text-lg" onClick={() => session.dispatch({ type: 'START' })}>מתחילים — השעון רץ!</button>
        </TiltCard>
      </div>
    )
  return (
    <div className="py-1">
      <EscapeGame room={room} snap={snap} session={session} coop={false} onRestart={restart} />
      <div className="mt-4 flex justify-center gap-2">
        <Link to={room.puzzles ? '/escape' : '/rooms'} className="btn btn-ghost !min-h-10 !text-sm">🚪 יציאה (ההתקדמות נשמרת)</Link>
        <button className="btn btn-ghost !min-h-10 !text-sm" onClick={() => setConfirm(true)}>להתחיל את החדר מחדש</button>
      </div>
      <Modal open={confirm} title="להתחיל מחדש?" onClose={() => setConfirm(false)}>
        <p className="mb-4 text-mist">כל ההתקדמות בחדר הזה תימחק והשעון יתאפס.</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirm(false)} data-autofocus>ביטול</button>
          <button className="btn btn-danger flex-1" onClick={restart}>להתחיל מחדש</button>
        </div>
      </Modal>
    </div>
  )
}

/** Before an escape-collection room: the story, the goal and (for timed / loop rooms) the mode. */
function CollectionLobby({ room, state, session }: { room: RoomDef; state: GameState; session: GameSession }) {
  const modal = !!(room.timer || room.loop)
  const mode = state.mode ?? 'timed'
  return (
    <div className="mx-auto max-w-lg py-2">
      <section className="card card-hero overflow-hidden p-0 text-center" aria-labelledby="lobby-title">
        <RoomIllustration room={room} className="h-48 w-full object-cover" />
        <div className="p-6 pt-4">
          <h1 id="lobby-title" className="title-gold text-4xl">{room.emoji} {room.title}</h1>
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs" aria-label="פרטי החדר">
            <li className="chip">קושי: {room.difficultyLabel}</li>
            <li className="chip">⏱ {room.length}</li>
            <li className="chip">{room.players === 2 ? '👥 2 שחקנים' : '👤 שחקן אחד'}</li>
          </ul>
          <p className="mx-auto mt-4 max-w-md text-right text-lg leading-relaxed text-mist">{room.story}</p>
          {room.goal && <p className="mx-auto mt-3 max-w-md rounded-xl border border-gold/30 bg-gold/5 p-3 text-right"><b className="text-gold">🎯 המטרה:</b> {room.goal}</p>}
          {modal && (
            <fieldset className="mx-auto mt-4 max-w-md text-right">
              <legend className="mb-2 font-bold">איך משחקים?</legend>
              <div className="grid gap-2" role="radiogroup">
                {(['timed', 'practice'] as const).map((m) => (
                  <button key={m} role="radio" aria-checked={mode === m} className={`rounded-xl border-2 p-3 text-right ${mode === m ? 'border-gold bg-gold/10' : 'border-white/15'}`} onClick={() => session.dispatch({ type: 'SET_MODE', mode: m })}>
                    <b>{m === 'timed' ? (room.timer ? `⏱ אתגר מתוזמן — ${room.timer.minutes} דקות` : '⏳ לולאה אמיתית — 7 דקות בזמן אמת') : '🧘 מצב אימון'}</b>
                    <span className="block text-sm text-mist">{m === 'timed' ? (room.timer ? 'השעון לא עוצר, גם ברענון או במעבר לשונית. התוצאה נכנסת לטבלת האתגר.' : 'הזמן רץ גם כשלא נוגעים. בכל 7 דקות — איפוס.') : room.timer ? 'בלי שעון. התוצאה נשמרת בנפרד מהאתגר.' : 'הזמן בלולאה זז רק כשלוחצים ״המתנה״. התוצאה נשמרת בנפרד.'}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <ul className="mx-auto mt-4 max-w-md space-y-1 text-right text-sm text-mist">
            <li>👆 לוחצים על דברים כדי לבחון אותם. מסמך נפתח בחלון, ו״סגירה״ מחזירה לחדר.</li>
            <li>📓 כל ממצא נרשם במחברת הראיות.</li>
            <li>💡 לכל שלב 3 רמזים; כל רמז מוריד 50 נקודות, וכל תשובה שגויה 25.</li>
            <li>🚪 אפשר לצאת בכל רגע — ההתקדמות נשמרת.</li>
          </ul>
          <button className="btn btn-gold mt-5 w-full text-lg" onClick={() => session.dispatch({ type: 'START' })}>מתחילים</button>
        </div>
      </section>
    </div>
  )
}

/** True once `cond` has held for `ms` (lets the escape cinematic play). */
export function useAfter(cond: boolean, ms: number): boolean {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!cond) return setDone(false)
    const reduced = document.documentElement.dataset.reducedMotion === 'true'
    const t = window.setTimeout(() => setDone(true), reduced ? 0 : ms)
    return () => window.clearTimeout(t)
  }, [cond, ms])
  return done
}
