import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getRoom } from '../escape/rooms'
import { createTransport, netMode, normalizeCode } from '../net/config'
import { MAX_PLAYERS } from '../net/session'
import { useSession } from '../state/useSession'
import { EscapeGame } from '../ui/escape/EscapeGame'
import { EscapeResult } from '../ui/escape/EscapeResult'
import { ErrorBox, Loading, Toast, TiltCard } from '../ui/kit'
import { NoNetwork } from './Rooms'
import { useAfter } from './Solo'

/** Co-op hub: create a room or join with a code. */
export function CoopHub() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const none = netMode() === 'none'
  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <h1 className="title-gold text-3xl">משחק עם חברים</h1>
      <p className="text-mist">2–4 שחקנים בורחים יחד, כל אחד מהטלפון שלו. כל חפץ ורמז שמישהו מוצא — משותף לכולם.</p>
      {none && <NoNetwork />}
      <TiltCard className="p-5" max={3}>
        <h2 className="mb-2 font-display text-2xl font-bold">פתיחת חדר חדש</h2>
        <p className="mb-3 text-sm text-mist">בוחרים חדר בריחה ומקבלים קוד לשלוח לחברים.</p>
        <Link to="/rooms?mode=coop" className={`btn btn-gold w-full ${none ? 'pointer-events-none opacity-45' : ''}`} aria-disabled={none}>בחירת חדר</Link>
      </TiltCard>
      <TiltCard className="p-5" max={3}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const c = normalizeCode(code)
            if (c.length === 5) nav(`/coop/${c}`)
          }}
        >
          <h2 className="mb-2 font-display text-2xl font-bold">הצטרפות עם קוד</h2>
          <label htmlFor="code" className="mb-2 block text-sm text-mist">הקוד שקיבלתם מהחבר (5 תווים)</label>
          <div className="flex gap-2">
            <input id="code" className="input text-center font-mono text-2xl tracking-[.3em]" dir="ltr" autoComplete="off" autoCapitalize="characters" maxLength={7} value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="ABCDE" />
            <button className="btn btn-gold shrink-0" disabled={none || normalizeCode(code).length !== 5}>הצטרפות</button>
          </div>
        </form>
      </TiltCard>
    </div>
  )
}

/** A co-op room: lobby → game → result, kept in sync for everyone. */
export function CoopRoom() {
  const { code: raw = '' } = useParams()
  const [params] = useSearchParams()
  const code = normalizeCode(raw)
  const roomId = params.get('room') ?? undefined
  const { snap, session, error } = useSession({ code, roomId, transport: () => createTransport() })
  const [toast, setToast] = useState<string | null>(null)
  const showResult = useAfter(snap?.state?.phase === 'escaped', 2600)

  if (error === 'no-network') return <div className="mx-auto max-w-lg py-4"><NoNetwork /></div>
  if (error) return <ErrorBox title="לא הצלחנו להתחבר" text="בדקו את החיבור לאינטרנט ונסו שוב." action={<button className="btn btn-gold" onClick={() => location.reload()}>ניסיון חוזר</button>} />
  if (!snap || !session) return <Loading text="מתחברים…" />
  if (session.isFull()) return <ErrorBox title="החדר מלא" text={`בחדר כבר ${MAX_PLAYERS} שחקנים.`} action={<Link className="btn btn-gold" to="/coop">חזרה</Link>} />
  if (!snap.state)
    return <Loading text={snap.status === 'online' ? `מחכים לשחקנים בחדר ${code}… (אם אף אחד לא בחדר, ודאו שהקוד נכון)` : 'מתחברים…'} />

  const room = getRoom(snap.state.roomId)
  if (!room) return <ErrorBox title="החדר הזה לא קיים בגרסה שלכם" text="ייתכן שצריך לעדכן את המשחק. נסו לרענן את הדף." />
  const s = snap.state

  if (s.phase === 'escaped' && showResult) return <EscapeResult room={room} state={s} code={code} mode="coop" players={snap.players.length} />
  if (s.phase === 'playing' || s.phase === 'escaped') return <div className="py-1"><EscapeGame room={room} snap={snap} session={session} coop /></div>

  const link = `${new URL('.', location.href.split('#')[0]).href}#/coop/${code}`
  async function invite() {
    const text = `בואו לברוח איתי מ״${room!.title}״ בהכספת! קוד החדר: ${code}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'הכספת', text, url: link })
        setToast('ההזמנה נשלחה')
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`)
      setToast('הקישור הועתק — שלחו אותו לחברים')
    } catch {
      setToast(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <TiltCard className="card-hero p-6 text-center" max={3}>
        <p className="text-sm text-dim">{room.emoji} {room.title} · {room.difficulty}</p>
        <h1 className="title-gold mt-1 text-3xl">חדר ההמתנה</h1>
        <p className="mt-3 text-sm text-mist">קוד החדר</p>
        <p className="font-mono text-5xl font-extrabold tracking-[.25em] text-gold-2" dir="ltr" data-testid="room-code">{code}</p>
        <button className="btn btn-gold mt-4 w-full" onClick={invite}>הזמנת חברים</button>
        <input type="hidden" value={link} data-testid="invite-link" />
        <p className="mt-2 text-xs text-dim">{snap.status === 'online' ? '🟢 מחוברים' : '🟡 מתחברים…'}</p>
      </TiltCard>
      <section className="card p-4" aria-labelledby="ppl">
        <h2 id="ppl" className="mb-3 font-bold">שחקנים בחדר ({snap.players.length}/{MAX_PLAYERS})</h2>
        <ul className="space-y-2" data-testid="players">
          {snap.players.slice(0, MAX_PLAYERS).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2">
              <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-gold/60 bg-navy text-xl">{p.avatar}</span>
              <span className="font-bold">{p.nick}</span>
              {p.id === snap.me.id && <span className="text-sm text-dim">(אתם)</span>}
              {p.id === snap.hostId && <span className="mr-auto text-sm text-gold">👑 מארח</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-mist">{room.story}</p>
      </section>
      {snap.isHost ? (
        <button className="btn btn-gold w-full text-lg" onClick={() => session.dispatch({ type: 'START' })}>
          מתחילים! {snap.players.length < 2 && '(אפשר גם לבד)'}
        </button>
      ) : (
        <p className="rounded-xl bg-black/25 p-4 text-center text-mist" role="status">⏳ מחכים שהמארח יתחיל את המשחק…</p>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
