import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getRoom } from '../escape/rooms'
import { backupFor, useSession } from '../state/useSession'
import { EscapeGame } from '../ui/escape/EscapeGame'
import { EscapeResult } from '../ui/escape/EscapeResult'
import { ErrorBox, Loading, Modal, TiltCard } from '../ui/kit'
import { Vault3D } from '../ui/Vault3D'

/** Solo play. Progress is kept on this device, so a refresh continues the same game. */
export function Solo() {
  const { roomId = '' } = useParams()
  const room = getRoom(roomId)
  const [round, setRound] = useState(0)
  if (!room) return <ErrorBox title="החדר לא נמצא" text="אולי הקישור שגוי." action={<Link className="btn btn-gold" to="/rooms">לחדרים</Link>} />
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

  if (!snap?.state || !session) return <Loading text="מכינים את החדר…" />
  const s = snap.state
  if (s.phase === 'escaped') return <EscapeResult room={room} state={s} code={code} mode="solo" players={1} onAgain={restart} />
  if (s.phase === 'lobby')
    return (
      <div className="mx-auto max-w-lg py-2">
        <TiltCard className="card-hero p-6 text-center" max={3}>
          <Vault3D className="-my-2 h-52 w-full" />
          <h1 className="title-gold text-4xl">{room.emoji} {room.title}</h1>
          <p className="mt-1 text-sm text-dim">רמה: {room.difficulty} · {room.minutes} דקות</p>
          <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed text-mist">{room.story}</p>
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
      <EscapeGame room={room} snap={snap} session={session} coop={false} />
      <div className="mt-4 flex justify-center">
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
