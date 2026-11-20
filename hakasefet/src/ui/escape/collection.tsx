import { useState } from 'react'
import { activePuzzle, currentInteraction, elapsedMs, loopClock, points, puzzleStatus, remainingMs, type GameState } from '../../escape/engine'
import type { Hotspot, Note, RoomDef, SceneDef } from '../../escape/types'
import type { GameSession } from '../../net/session'
import { formatDuration } from '../../engine/date'
import { Modal } from '../kit'
import { ObjectArt, SceneBackground, SceneDefs } from './sceneArt'

/** Has the player not looked at this object yet? (phone "unread" dots, board "new" badges) */
export const isUnseen = (h: Hotspot, flags: string[]) => !flags.includes(`seen:${h.id}`)

// ── catalog illustration ──────────────────────────────────

export function RoomIllustration({ room, className = '' }: { room: RoomDef; className?: string }) {
  const photo = room.photo?.src ?? room.scenes.find((s) => s.photo)?.photo?.src
  if (photo) return <img src={`${import.meta.env.BASE_URL}${photo}`} alt="" loading="lazy" decoding="async" className={`block object-cover ${className}`} />
  const il = room.illustration ?? { art: 'door' as const, theme: room.scenes[0].theme }
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className={`block ${className}`} aria-hidden="true">
      <SceneDefs />
      <SceneBackground theme={il.theme} />
      <g transform="translate(270 140)">
        <ObjectArt art={il.art} w={260} h={320} active={false} variant={il.variant} />
      </g>
    </svg>
  )
}

// ── clock / loop / points bar ─────────────────────────────

export function CollectionClock({ room, state, now, session }: { room: RoomDef; state: GameState; now: number; session: GameSession }) {
  const pts = points(state)
  let main: React.ReactNode
  if (room.loop) {
    const c = loopClock(room, state, now)
    main = (
      <div data-testid="loop-banner">
        <p className="font-mono text-2xl font-extrabold text-gold-2" role="timer" aria-label={`לולאה ${c.loop + 1}, דקה ${c.minute}, עוד ${formatDuration(c.msLeft)} לאיפוס`}>
          ⏳ {c.minute}:{String(Math.floor((c.inLoop % 60_000) / 1000)).padStart(2, '0')} <span className="text-base text-dim">/ {room.loop.minutes}:00</span>
        </p>
        <p className="text-xs text-dim">לולאה {c.loop + 1} · {state.mode === 'practice' ? 'אימון — הזמן זז רק כשממתינים' : `איפוס בעוד ${formatDuration(c.msLeft)}`}</p>
      </div>
    )
  } else if (room.timer && state.mode !== 'practice') {
    const left = remainingMs(room, state, now)
    main = (
      <p className={`font-mono text-2xl font-extrabold ${left < 5 * 60_000 ? 'text-coral' : 'text-gold-2'}`} role="timer" aria-label={`נותרו ${formatDuration(Math.max(0, left))}`} data-testid="timer">
        {formatDuration(Math.max(0, left))}
      </p>
    )
  } else {
    main = (
      <p className="font-mono text-2xl font-extrabold text-gold-2" role="timer" aria-label={`זמן ${formatDuration(elapsedMs(state, now))}`} data-testid="timer">
        {formatDuration(elapsedMs(state, now))}
        {room.timer && <span className="mr-2 align-middle text-xs font-bold text-teal-2">אימון</span>}
      </p>
    )
  }
  return (
    <div className="flex items-center gap-3">
      {main}
      <span className="chip !text-xs" aria-label={`${pts} נקודות`} data-testid="points">🏆 {pts}</span>
      {room.loop && (
        <button
          className="btn btn-ghost !min-h-10 !px-3 !text-sm"
          onClick={() => {
            const c = loopClock(room, state, session.hostNow())
            void session.dispatch({ type: 'WAIT', until: (c.minute + 1) % room.loop!.minutes })
          }}
        >
          ⏭ המתנה לדקה הבאה
        </button>
      )}
    </div>
  )
}

/** Red pressure that builds up as a timed challenge runs out. */
export function Pressure({ room, state, now, reduced }: { room: RoomDef; state: GameState; now: number; reduced: boolean }) {
  if (!room.timer || state.mode === 'practice' || state.phase !== 'playing') return null
  const total = room.timer.minutes * 60_000
  const frac = Math.min(1, Math.max(0, 1 - remainingMs(room, state, now) / total))
  const late = frac > 0.75
  return (
    <div
      aria-hidden="true"
      data-testid="pressure"
      className={`pointer-events-none fixed inset-0 z-20 ${late && !reduced ? 'animate-pulse' : ''}`}
      style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(224,83,63,${(0.06 + 0.5 * frac * frac).toFixed(3)}) 100%)` }}
    />
  )
}

export function TimeoutModal({ open, onRestart, onPractice }: { open: boolean; onRestart?: () => void; onPractice: () => void }) {
  return (
    <Modal open={open} title="⏰ הזמן נגמר" onClose={() => {}}>
      <div data-testid="timeout">
        <p className="mb-2 text-lg font-bold text-coral">הנעילה המלאה הופעלה.</p>
        <p className="mb-4 text-mist">אפשר להתחיל את האתגר מחדש, או להמשיך מאותה נקודה במצב אימון — בלי שעון. תוצאת אימון נשמרת בנפרד מהאתגר המתוזמן.</p>
        <div className="grid gap-2">
          {onRestart && <button className="btn btn-gold" onClick={onRestart} data-autofocus>להתחיל את האתגר מחדש</button>}
          <button className="btn btn-ghost" onClick={onPractice}>להמשיך במצב אימון</button>
        </div>
      </div>
    </Modal>
  )
}

// ── evidence notebook ─────────────────────────────────────

export function NotebookPanel({ room, state }: { room: RoomDef; state: GameState }) {
  const ids = state.notebook ?? []
  if (!ids.length) return <p className="text-mist">המחברת ריקה. כל ממצא שתגלו יירשם כאן אוטומטית — ויישאר גם אחרי איפוס.</p>
  return (
    <ol className="space-y-2" data-testid="notebook">
      {ids.map((id, i) => {
        const e = room.notebookEntries?.find((x) => x.id === id)
        if (!e) return null
        return (
          <li key={id} className="flex gap-2 rounded-xl border border-gold/25 bg-gold/5 p-3 leading-relaxed">
            <span className="font-mono text-sm text-dim">{i + 1}.</span>
            <span>{e.text}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ── per-puzzle hints (3 tiers) ────────────────────────────

export function PuzzleHints({ room, state, session }: { room: RoomDef; state: GameState; session: GameSession }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const list = puzzleStatus(room, state)
  const active = activePuzzle(room, state)
  const shown = list.filter((x) => x.tiers > 0 || x.p.id === active?.p.id)
  async function take(id: string) {
    setBusy(true)
    await session.dispatch({ type: 'PHINT', puzzle: id })
    setBusy(false)
    setConfirm(null)
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-dim">כל רמז חדש מוריד 50 נקודות. לכל שלב יש 3 רמזים: כיוון כללי, צעד מעשי, וכמעט הפתרון.</p>
      {shown.length === 0 && <p className="text-mist">אין כרגע שלב פתוח לרמזים.</p>}
      {shown.map(({ p, tiers, done }) => (
        <section key={p.id} className={`rounded-xl border p-3 ${done ? 'border-white/10 opacity-70' : 'border-gold/40'}`}>
          <h3 className="mb-1 font-bold">{done ? '✓ ' : ''}{p.name}</h3>
          <ol className="space-y-1.5">
            {p.hints.slice(0, tiers).map((h, i) => (
              <li key={i} className="rounded-lg bg-black/25 p-2 text-sm"><b className="text-gold">רמז {i + 1}:</b> {h}</li>
            ))}
          </ol>
          {!done && tiers < 3 && (
            confirm === p.id ? (
              <div className="mt-2 rounded-lg border border-coral/50 bg-coral/10 p-2 text-sm" role="alert">
                <p className="mb-2 font-bold">⚠️ הרמז השלישי כמעט חושף את הפתרון. להציג אותו?</p>
                <div className="flex gap-2">
                  <button className="btn btn-ghost flex-1 !min-h-10" onClick={() => setConfirm(null)}>לא עכשיו</button>
                  <button className="btn btn-danger flex-1 !min-h-10" disabled={busy} onClick={() => take(p.id)}>להציג</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-gold mt-2 w-full !min-h-11" disabled={busy} onClick={() => (tiers === 2 ? setConfirm(p.id) : take(p.id))}>
                רמז {tiers + 1} מתוך 3 (−50 נקודות)
              </button>
            )
          )}
        </section>
      ))}
    </div>
  )
}

// ── a fictional phone ─────────────────────────────────────

export function PhoneView({ room, scenes, sceneId, setSceneId, flags, onOpen }: { room: RoomDef; scenes: SceneDef[]; sceneId: string | null; setSceneId: (id: string | null) => void; flags: string[]; onOpen: (h: Hotspot) => void }) {
  const visible = (sc: string) => room.hotspots.filter((h) => h.scene === sc && (!h.visibleWhen || h.visibleWhen.every((c) => (c.startsWith('!') ? !flags.includes(c.slice(1)) : flags.includes(c)))))
  // a single visible app (the lock screen) is shown full-screen
  const current = scenes.length === 1 ? scenes[0].id : sceneId
  const app = scenes.find((s) => s.id === current)
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative rounded-[2.6rem] border-[10px] border-[#11141c] bg-gradient-to-b from-[#1a2140] to-[#0b1024] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,.9),inset_0_0_0_2px_#2a3150]" data-testid="phone">
        <div className="mx-auto mb-2 h-5 w-28 rounded-full bg-black" aria-hidden="true" />
        <div className="mb-2 flex items-center justify-between px-2 text-xs text-mist" aria-hidden="true">
          <span dir="ltr">18:47</span>
          <span>📶 🔋 23%</span>
        </div>
        <div className="min-h-[28rem] rounded-2xl bg-black/30 p-2">
          {!app ? (
            <ul className="grid grid-cols-3 gap-3 p-2" aria-label="אפליקציות">
              {scenes.map((s) => {
                const unread = visible(s.id).filter((h) => isUnseen(h, flags)).length
                return (
                  <li key={s.id}>
                    <button className="relative flex w-full flex-col items-center gap-1 rounded-2xl p-2 text-xs font-bold text-mist hover:bg-white/5" onClick={() => setSceneId(s.id)} aria-label={`${s.name}${unread ? ` — ${unread} חדשים` : ''}`}>
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-white/15 to-white/5 text-3xl shadow-lg" aria-hidden="true">{s.icon ?? '📱'}</span>
                      {s.name}
                      {unread > 0 && <span className="absolute right-1 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] text-ink" aria-hidden="true">{unread}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div>
              <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
                {scenes.length > 1 && <button className="btn btn-ghost !min-h-9 !px-3 !text-sm" onClick={() => setSceneId(null)} aria-label="חזרה למסך הבית">‹ בית</button>}
                <h2 className="font-bold">{app.icon} {app.name}</h2>
              </div>
              <ul className="space-y-1.5">
                {visible(app.id).map((h) => (
                  <li key={h.id}>
                    <button data-hotspot aria-label={h.name} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-right hover:bg-white/10" onClick={() => onOpen(h)}>
                      <span className="text-2xl" aria-hidden="true">{h.icon ?? '•'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{h.name}</span>
                        {h.subtitle && <span className="block truncate text-xs text-dim">{h.subtitle}</span>}
                      </span>
                      {isUnseen(h, flags) && <span className="h-2.5 w-2.5 rounded-full bg-teal" aria-label="חדש" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mx-auto mt-2 h-1.5 w-24 rounded-full bg-white/30" aria-hidden="true" />
      </div>
    </div>
  )
}

// ── investigation board ───────────────────────────────────

export function BoardView({ room, hotspots, flags, onOpen }: { room: RoomDef; hotspots: Hotspot[]; flags: string[]; onOpen: (h: Hotspot) => void }) {
  const [compare, setCompare] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const noteOf = (h: Hotspot): Note | undefined => {
    const it = currentInteraction(h, flags)
    return it && 'note' in it ? it.note : undefined
  }
  const pair = picked.map((id) => room.hotspots.find((h) => h.id === id)!).filter(Boolean)
  return (
    <div className="rounded-2xl border-4 border-[#5a3a1e] bg-[#a8794a] bg-[radial-gradient(rgba(0,0,0,.12)_1px,transparent_1px)] bg-[length:6px_6px] p-3 shadow-inner" data-testid="board">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#2a1d02]">{compare ? `בחרו שני מסמכים להשוואה (${picked.length}/2)` : 'הקישו על כרטיס כדי לפתוח אותו'}</p>
        <button className={`btn ${compare ? 'btn-gold' : 'btn-ghost'} !min-h-9 !px-3 !text-sm`} aria-pressed={compare} onClick={() => { setCompare(!compare); setPicked([]) }}>🔍 השוואה</button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {hotspots.map((h, i) => {
          const sel = picked.includes(h.id)
          return (
            <li key={h.id} style={{ transform: `rotate(${((i * 37) % 5) - 2}deg)` }}>
              <button
                data-hotspot
                aria-label={h.name}
                aria-pressed={compare ? sel : undefined}
                className={`relative w-full rounded-md bg-[#f4ecd8] p-3 text-right text-[#2a1d02] shadow-[0_6px_14px_-4px_rgba(0,0,0,.6)] transition hover:-translate-y-0.5 ${sel ? 'ring-4 ring-teal' : ''}`}
                onClick={() => {
                  if (!compare) return onOpen(h)
                  setPicked((p) => (sel ? p.filter((x) => x !== h.id) : p.length < 2 ? [...p, h.id] : [p[1], h.id]))
                }}
              >
                <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-coral shadow" aria-hidden="true" />
                <span className="block text-2xl" aria-hidden="true">{h.icon}</span>
                <span className="block font-bold leading-tight">{h.name}</span>
                {h.subtitle && <span className="block text-xs opacity-70">{h.subtitle}</span>}
                {isUnseen(h, flags) && <span className="absolute left-2 top-2 rounded bg-coral px-1.5 text-[10px] font-bold text-ink">חדש</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <Modal open={compare && pair.length === 2} title="השוואה" onClose={() => setPicked([])}>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="compare">
          {pair.map((h) => {
            const n = noteOf(h)
            return (
              <div key={h.id} className="rounded-xl border-2 border-amber-200/40 bg-[#f4ecd8] p-3 text-[#2a1d02]">
                <p className="mb-1 text-sm font-bold opacity-70">{n?.title ?? h.name}</p>
                <p className="whitespace-pre-line leading-relaxed">{n?.text ?? 'פתחו את הכרטיס כדי לראות מה יש בו.'}</p>
              </div>
            )
          })}
        </div>
        <button className="btn btn-ghost mt-3 w-full" onClick={() => setPicked([])}>סגירה</button>
      </Modal>
    </div>
  )
}
