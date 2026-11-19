import { useEffect, useMemo, useRef, useState } from 'react'
import { currentInteraction, hintsLeft, isActive, levelOf, LEVELS, nextHintIndex, remainingMs, shownHints, type GameState, type Level } from '../../escape/engine'
import { createContext, useContext } from 'react'
import type { Hotspot, ItemDef, Note, RoomDef } from '../../escape/types'
import type { GameSession, SessionSnapshot } from '../../net/session'
import { formatDuration } from '../../engine/date'
import { play } from '../audio'
import { Modal } from '../kit'
import { LockPanel } from './LockPanel'
import { ObjectArt, SceneBackground, SceneDefs } from './sceneArt'
import { Scene3D } from './Scene3D'
import { useApp } from '../../state/AppState'

/** The playing screen: scenes, objects, inventory, hints, timer and the team feed. */
export function EscapeGame({ room, snap, session, coop }: { room: RoomDef; snap: SessionSnapshot; session: GameSession; coop: boolean }) {
  const state = snap.state as GameState
  const [sceneId, setSceneId] = useState(room.scenes[0].id)
  const [open, setOpen] = useState<Hotspot | null>(null)
  const [item, setItem] = useState<ItemDef | null>(null)
  const [using, setUsing] = useState<ItemDef | null>(null)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string; kind: string } | null>(null)
  const [now, setNow] = useState(() => session.hostNow())
  const lastLog = useRef(state.log.at(-1)?.id ?? 0)
  const { prefs } = useApp()
  const [use2D, setUse2D] = useState(prefs.graphics === '2d')
  useEffect(() => setUse2D(prefs.graphics === '2d'), [prefs.graphics])
  // fly-in animation when a new item lands in the bag
  const [flying, setFlying] = useState<{ key: number; icon: string } | null>(null)
  const prevInv = useRef(state.inventory)
  useEffect(() => {
    const added = state.inventory.find((i) => !prevInv.current.includes(i))
    prevInv.current = state.inventory
    if (!added) return
    const it = room.items.find((x) => x.id === added)
    if (it) setFlying({ key: Date.now(), icon: it.icon })
  }, [state.inventory, room.items])

  useEffect(() => {
    const id = window.setInterval(() => setNow(session.hostNow()), 500)
    return () => window.clearInterval(id)
  }, [session])

  useEffect(() => {
    session.setScene(sceneId)
  }, [sceneId, session])

  useEffect(() => {
    const onToast = (e: Event) => setToast({ id: -2, text: (e as CustomEvent<string>).detail, kind: 'wrong' })
    window.addEventListener('hakasefet:toast', onToast)
    return () => window.removeEventListener('hakasefet:toast', onToast)
  }, [])

  // Team feed: show new log entries as toasts (with a sound for progress).
  useEffect(() => {
    const fresh = state.log.filter((l) => l.id > lastLog.current)
    if (!fresh.length) return
    lastLog.current = fresh[fresh.length - 1].id
    const l = fresh[fresh.length - 1]
    setToast({ id: l.id, text: `${l.who.avatar} ${l.who.nick}: ${l.text}`, kind: l.kind })
    if (l.kind === 'good') play('clue')
    const t = window.setTimeout(() => setToast((x) => (x?.id === l.id ? null : x)), 3800)
    return () => window.clearTimeout(t)
  }, [state.log])

  const scene = room.scenes.find((s) => s.id === sceneId)!
  const hotspots = room.hotspots.filter((h) => h.scene === sceneId)
  const left = remainingMs(room, state, now)
  const items = state.inventory.map((id) => room.items.find((i) => i.id === id)!).filter(Boolean)
  const level = levelOf(state)
  const canHint = nextHintIndex(room, state) !== -1 && hintsLeft(state) > 0

  // Objects in the open dialog follow live state (another player may change them).
  const openInteraction = open ? currentInteraction(open, state.flags) : undefined

  function tapHotspot(h: Hotspot) {
    play('tap')
    if (using) {
      const it = using
      setUsing(null)
      void session.dispatch({ type: 'USE', hotspot: h.id, item: it.id }).then((r) => {
        if (r === 'wrong') play('wrong')
        if (r === 'timeout') setToast({ id: -1, text: 'אין חיבור לשאר השחקנים כרגע.', kind: 'wrong' })
      })
      return
    }
    setOpen(h)
  }

  return (
    <LevelCtx.Provider value={level}>
    <div className="mx-auto max-w-3xl">
      {/* top bar */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-dim">{room.emoji} {room.title} · {LEVELS[level].label}</p>
          <p className={`font-mono text-2xl font-extrabold ${left < 0 ? 'text-coral' : left < 5 * 60_000 ? 'text-coral' : 'text-gold-2'}`} role="timer" aria-label={left >= 0 ? `נותרו ${formatDuration(left)}` : `זמן נוסף ${formatDuration(-left)}`} data-testid="timer">
            {left >= 0 ? formatDuration(left) : `+${formatDuration(-left)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {coop && <Players snap={snap} />}
          <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => setHintsOpen(true)}>💡 רמזים {state.hintsShown.length > 0 && `(${state.hintsShown.length})`}</button>
        </div>
      </div>
      {left < 0 && <p className="mb-2 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm">⏰ הזמן נגמר — אפשר להמשיך ולברוח, אבל בלי כוכבים.</p>}

      {/* scene tabs */}
      <div role="tablist" aria-label="אזורים בחדר" className="mb-2 grid grid-cols-2 gap-2">
        {room.scenes.map((s) => {
          const here = snap.players.filter((p) => p.id !== snap.me.id && (p.scene ?? room.scenes[0].id) === s.id)
          return (
            <button key={s.id} role="tab" aria-selected={s.id === sceneId} onClick={() => setSceneId(s.id)} className={`btn ${s.id === sceneId ? 'btn-gold' : 'btn-ghost'} !min-h-11`}>
              {s.name}
              {coop && here.length > 0 && <span aria-label={`כאן: ${here.map((p) => p.nick).join(', ')}`}>{here.map((p) => p.avatar).join('')}</span>}
            </button>
          )
        })}
      </div>

      {/* the scene */}
      <div className="card relative overflow-hidden p-1.5">
        {use2D ? (
          <Scene2D room={room} sceneId={sceneId} flags={state.flags} using={!!using} onTap={(id) => tapHotspot(room.hotspots.find((h) => h.id === id)!)} />
        ) : (
          <Scene3D
            room={room}
            sceneId={sceneId}
            flags={state.flags}
            escaped={state.phase === 'escaped'}
            focusId={open?.id ?? null}
            using={!!using}
            quality={prefs.graphics === '2d' ? 'normal' : prefs.graphics}
            reducedMotion={prefs.reducedMotion}
            onTap={(id) => tapHotspot(room.hotspots.find((h) => h.id === id)!)}
            onFail={() => setUse2D(true)}
          />
        )}
        {flying && <span key={flying.key} className="item-fly" aria-hidden="true" onAnimationEnd={() => setFlying(null)}>{flying.icon}</span>}
      </div>

      {using && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-teal/50 bg-teal/10 px-3 py-2" role="status">
          <span>
            {using.icon} בחרו חפץ בחדר כדי להשתמש עליו ב<b>{using.name}</b>
          </span>
          <button className="btn btn-ghost !min-h-9 !px-3 !text-sm" onClick={() => setUsing(null)}>ביטול</button>
        </div>
      )}

      {/* objects list — also the accessible way to reach every object */}
      <details className="mt-2 rounded-xl bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-mist">רשימת החפצים ב{scene.name}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {hotspots.map((h) => (
            <button key={h.id} className="btn btn-ghost !min-h-10 !px-3 !text-sm" onClick={() => tapHotspot(h)}>
              {h.name}
            </button>
          ))}
        </div>
      </details>

      {/* inventory */}
      <section className="card mt-3 p-3" aria-label="התיק">
        <h2 className="mb-2 text-sm font-bold text-mist">🎒 התיק {coop && <span className="text-dim">(משותף לכל הצוות)</span>}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-dim">עדיין ריק. חפשו חפצים בחדר.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((it) => (
              <button key={it.id} className={`tile flex min-h-14 items-center gap-2 rounded-xl border px-3 font-bold ${using?.id === it.id ? 'border-teal bg-teal/15' : 'border-gold/25'}`} onClick={() => setItem(it)}>
                <span className="text-2xl" aria-hidden="true">{it.icon}</span>
                {it.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <Toast toast={toast} />

      {/* object dialog */}
      <Modal open={!!open} title={open?.name ?? ''} onClose={() => setOpen(null)}>
        {open && openInteraction && (
          <ObjectPanel
            key={open.id}
            hotspot={open}
            interaction={openInteraction}
            room={room}
            inventory={items}
            session={session}
            onClose={() => setOpen(null)}
          />
        )}
      </Modal>

      {/* item dialog */}
      <Modal open={!!item} title={item?.name ?? ''} onClose={() => setItem(null)}>
        {item && (
          <div>
            <NoteCard note={item.note} />
            <button
              className="btn btn-gold mt-3 w-full"
              onClick={() => {
                setUsing(item)
                setItem(null)
              }}
            >
              {item.icon} להשתמש על חפץ בחדר
            </button>
          </div>
        )}
      </Modal>

      {/* hints */}
      <Modal open={hintsOpen} title="💡 רמזים" onClose={() => setHintsOpen(false)}>
        <HintsPanel room={room} state={state} canHint={canHint} onHint={() => session.dispatch({ type: 'HINT' })} />
      </Modal>
    </div>
    </LevelCtx.Provider>
  )
}

/** The current difficulty, so notes can show their easy / hard wording. */
const LevelCtx = createContext<Level>('medium')

function Players({ snap }: { snap: SessionSnapshot }) {
  return (
    <ul className="flex -space-x-2 space-x-reverse" aria-label="שחקנים">
      {snap.players.slice(0, 4).map((p) => (
        <li key={p.id} title={p.nick} className={`grid h-9 w-9 place-items-center rounded-full border-2 bg-navy text-lg ${p.id === snap.hostId ? 'border-gold' : 'border-teal/60'}`} aria-label={`${p.nick}${p.id === snap.me.id ? ' (אתם)' : ''}`}>
          {p.avatar}
        </li>
      ))}
      {snap.status !== 'online' && <li className="chip !text-xs text-coral">מתחבר…</li>}
    </ul>
  )
}

function Toast({ toast }: { toast: { text: string; kind: string } | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      {toast && (
        <div className={`anim-pop max-w-md rounded-2xl px-4 py-3 text-center font-bold shadow-xl ${toast.kind === 'good' ? 'bg-teal text-ink' : toast.kind === 'wrong' ? 'bg-coral text-ink' : 'bg-gold text-ink'}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}

export function NoteCard({ note }: { note: Note }) {
  const level = useContext(LevelCtx)
  const text = (level === 'easy' && note.easy) || (level === 'hard' && note.hard) || note.text
  const style =
    note.style === 'screen'
      ? 'border-teal/50 bg-[#03140f] font-mono text-teal-2'
      : note.style === 'paper'
        ? 'border-amber-200/40 bg-[#f4ecd8] text-[#2a1d02] rotate-[-1deg]'
        : note.style === 'book'
          ? 'border-[#8d7a5a] bg-[#efe3c8] text-[#2a1d02]'
          : note.style === 'plaque'
            ? 'border-gold/60 bg-gradient-to-b from-[#3a2a0a] to-[#1f1605] text-gold-2'
            : 'border-white/15 bg-black/30'
  return (
    <div className={`rounded-xl border-2 p-4 text-lg leading-relaxed whitespace-pre-line ${style}`}>
      <p className="mb-1 text-sm font-bold opacity-70">{note.title}</p>
      <p>{text}</p>
    </div>
  )
}

function ObjectPanel({ hotspot, interaction, room, inventory, session, onClose }: { hotspot: Hotspot; interaction: NonNullable<ReturnType<typeof currentInteraction>>; room: RoomDef; inventory: ItemDef[]; session: GameSession; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null)
  if (msg)
    return (
      <div className="anim-pop text-center" role="status">
        <p className="mb-3 text-4xl">✨</p>
        <p className="mb-4 text-lg font-bold text-teal-2">{msg}</p>
        <button className="btn btn-gold w-full" onClick={onClose} autoFocus>ממשיכים</button>
      </div>
    )
  if (interaction.type === 'note' || interaction.type === 'blocked')
    return (
      <div>
        <NoteCard note={interaction.note} />
        <button className="btn btn-ghost mt-3 w-full" onClick={onClose}>סגירה</button>
      </div>
    )
  if (interaction.type === 'take') {
    const it = room.items.find((i) => i.id === interaction.item)!
    return (
      <div>
        <NoteCard note={interaction.note} />
        <button
          className="btn btn-gold mt-3 w-full"
          onClick={async () => {
            const r = await session.dispatch({ type: 'TAKE', hotspot: hotspot.id })
            if (r === 'ok') {
              play('coin')
              setMsg(`${it.icon} ${it.name} נכנס לתיק!`)
            } else onClose()
          }}
        >
          {it.icon} לקחת: {it.name}
        </button>
      </div>
    )
  }
  if (interaction.type === 'needItem')
    return (
      <div>
        <NoteCard note={interaction.note} />
        {inventory.length ? (
          <>
            <p className="mb-2 mt-3 font-bold">להשתמש בחפץ מהתיק:</p>
            <div className="flex flex-wrap gap-2">
              {inventory.map((it) => (
                <button
                  key={it.id}
                  className="tile flex min-h-12 items-center gap-2 rounded-xl border border-gold/25 px-3 font-bold"
                  onClick={async () => {
                    const r = await session.dispatch({ type: 'USE', hotspot: hotspot.id, item: it.id })
                    if (r === 'ok') {
                      play('unlock')
                      setMsg(interaction.onUse.message)
                    } else if (r === 'wrong') {
                      play('wrong')
                      setMsg(null)
                      alertShake(`${it.name} לא עוזר כאן.`)
                    }
                  }}
                >
                  <span className="text-xl">{it.icon}</span> {it.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-dim">נראה שצריך כאן חפץ. התיק שלכם עדיין ריק.</p>
        )}
      </div>
    )
  // lock
  return (
    <div>
      <p className="mb-3 text-mist">{interaction.prompt}</p>
      <LockPanel
        lock={interaction.lock}
        onSubmit={async (input) => {
          const r = await session.dispatch({ type: 'SOLVE', hotspot: hotspot.id, input })
          if (r === 'ok') {
            play('unlock')
            setMsg(interaction.onSolve.message)
          }
          return r
        }}
      />
    </div>
  )
}

function alertShake(text: string) {
  window.dispatchEvent(new CustomEvent('hakasefet:toast', { detail: text }))
}

function HintsPanel({ room, state, canHint, onHint }: { room: RoomDef; state: GameState; canHint: boolean; onHint: () => Promise<unknown> }) {
  const list = useMemo(() => shownHints(room, state), [room, state])
  const [busy, setBusy] = useState(false)
  return (
    <div>
      {list.length === 0 ? (
        <p className="mb-3 text-mist">עדיין לא השתמשתם ברמזים.</p>
      ) : (
        <ol className="mb-3 space-y-2">
          {list.map((h, i) => (
            <li key={i} className={`rounded-xl border p-3 ${h.done ? 'border-white/10 text-dim line-through' : 'border-gold/40 bg-gold/10'}`}>
              {h.text}
            </li>
          ))}
        </ol>
      )}
      <p className="mb-2 text-sm text-dim">
        ברמה {LEVELS[levelOf(state)].label} כל רמז מוסיף {LEVELS[levelOf(state)].hintPenaltyMs / 1000} שניות לזמן
        {Number.isFinite(LEVELS[levelOf(state)].maxHints) && ` · נשארו ${Math.max(0, hintsLeft(state))} מתוך ${LEVELS[levelOf(state)].maxHints} רמזים`}.
      </p>
      <button
        className="btn btn-gold w-full"
        disabled={!canHint || busy}
        onClick={async () => {
          setBusy(true)
          await onHint()
          setBusy(false)
        }}
      >
        {canHint ? `רמז חדש (+${LEVELS[levelOf(state)].hintPenaltyMs / 1000} שניות)` : hintsLeft(state) <= 0 ? 'נגמרו הרמזים ברמה הזאת' : 'אין כרגע רמז חדש — המשיכו לחקור'}
      </button>
    </div>
  )
}

function Scene2D({ room, sceneId, flags, using, onTap }: { room: RoomDef; sceneId: string; flags: string[]; using: boolean; onTap: (id: string) => void }) {
  const scene = room.scenes.find((s) => s.id === sceneId)!
  const hotspots = room.hotspots.filter((h) => h.scene === sceneId)
  return (
    <svg viewBox="0 0 800 600" className="block w-full rounded-xl" role="group" aria-label={scene.name}>
      <SceneDefs />
      <SceneBackground theme={scene.theme} />
      {hotspots.map((h) => (
        <g
          key={h.id}
          transform={`translate(${h.x} ${h.y})`}
          role="button"
          tabIndex={0}
          data-hotspot
          aria-label={h.name}
          className={`hotspot cursor-pointer outline-none ${using ? 'hotspot-using' : ''}`}
          onClick={() => onTap(h.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onTap(h.id)
            }
          }}
        >
          <rect className="hotspot-ring" x="-6" y="-6" width={h.w + 12} height={h.h + 12} rx="10" />
          <ObjectArt art={h.art} w={h.w} h={h.h} active={isActive(h, flags)} variant={h.variant} />
        </g>
      ))}
    </svg>
  )
}
