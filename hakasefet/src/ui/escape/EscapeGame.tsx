import { useEffect, useMemo, useRef, useState } from 'react'
import { currentInteraction, flagsAt, hintsLeft, holds, isActive, isVisible, levelOf, LEVELS, nextHintIndex, remainingMs, shownHints, syncLoop, type GameState, type Level } from '../../escape/engine'
import { createContext, useContext } from 'react'
import type { Hotspot, ItemDef, Note, RoomDef } from '../../escape/types'
import type { GameSession, SessionSnapshot } from '../../net/session'
import { formatDuration } from '../../engine/date'
import { play } from '../audio'
import { Modal } from '../kit'
import { LockPanel } from './LockPanel'
import { ObjectArt, SceneBackground, SceneDefs } from './sceneArt'
import { Scene3D } from './Scene3D'
import { TourView } from './TourView'
import { useApp } from '../../state/AppState'
import { RevealViewer } from './RevealViewer'
import { VoicePlayer } from './VoicePlayer'
import { Music } from '../music'
import { BoardView, CollectionClock, NotebookPanel, PhoneView, Pressure, PuzzleHints, TimeoutModal } from './collection'

/** The playing screen: scenes, objects, inventory, hints, timer and the team feed. */
export function EscapeGame({ room, snap, session, coop, onRestart }: { room: RoomDef; snap: SessionSnapshot; session: GameSession; coop: boolean; onRestart?: () => void }) {
  const raw = snap.state as GameState
  const [sceneId, setSceneId] = useState(room.scenes[0].id)
  const [open, setOpen] = useState<Hotspot | null>(null)
  const [item, setItem] = useState<ItemDef | null>(null)
  const [using, setUsing] = useState<ItemDef | null>(null)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [notebookOpen, setNotebookOpen] = useState(false)
  const [phoneApp, setPhoneApp] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string; kind: string } | null>(null)
  const [now, setNow] = useState(() => session.hostNow())
  // loop rooms: show the loop that is running now, even before the next action syncs it
  const state = useMemo(() => syncLoop(room, raw, now), [room, raw, now])
  const flags = useMemo(() => flagsAt(room, state, now), [room, state, now])
  const collection = !!room.puzzles
  const lastLog = useRef(raw.log.at(-1)?.id ?? 0)
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
    const fresh = raw.log.filter((l) => l.id > lastLog.current)
    if (!fresh.length) return
    lastLog.current = fresh[fresh.length - 1].id
    const l = fresh[fresh.length - 1]
    setToast({ id: l.id, text: `${l.who.avatar} ${l.who.nick}: ${l.text}`, kind: l.kind })
    if (l.kind === 'good') play('clue')
    const t = window.setTimeout(() => setToast((x) => (x?.id === l.id ? null : x)), 3800)
    return () => window.clearTimeout(t)
  }, [raw.log])

  const scenes = room.scenes.filter((sc) => !sc.visibleWhen || holds(flags, sc.visibleWhen))
  const flagKey = flags.join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleRoom = useMemo(() => ({ ...room, hotspots: room.hotspots.filter((h) => isVisible(h, flags)) }), [room, flagKey])
  useEffect(() => {
    if (!scenes.some((sc) => sc.id === sceneId)) setSceneId(scenes[0]?.id ?? room.scenes[0].id)
  }, [scenes, sceneId, room])
  const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0] ?? room.scenes[0]
  const hotspots = visibleRoom.hotspots.filter((h) => h.scene === scene.id)

  // realistic rooms: a virtual tour of the room's image, every visible area's objects in it
  const [inside, setInside] = useState(false)
  const tourSrc = scene.photo?.src ?? room.photo?.src
  const sceneIds = new Set(scenes.map((sc) => sc.id))
  const srcOf = (sid: string) => room.scenes.find((sc) => sc.id === sid)?.photo?.src ?? room.photo?.src
  const tour = tourSrc
    ? {
        src: tourSrc,
        size: (scene.photo?.size ?? room.photo!.size) as [number, number],
        view: scene.photo?.crop ?? room.photo?.views?.[scene.id],
        spots: [
          ...visibleRoom.hotspots.filter((h) => h.photo && sceneIds.has(h.scene) && srcOf(h.scene) === tourSrc).map((h) => ({ id: h.id, name: h.name, rect: h.photo!, hotspot: h, done: isActive(h, flags) })),
          ...(room.photo?.enter ? [{ id: '__enter', name: room.photo.enter.label, rect: room.photo.enter.rect }] : []),
        ],
      }
    : null
  const unplaced = tour ? hotspots.filter((h) => !h.photo) : []
  const left = remainingMs(room, state, now)
  const items = state.inventory.map((id) => room.items.find((i) => i.id === id)!).filter(Boolean)
  const level = levelOf(state)

  // background music for the room (generated live); tension rises in the last 5 minutes
  const music = useRef<Music | null>(null)
  const [musicBlocked, setMusicBlocked] = useState(false)
  useEffect(() => {
    if (!prefs.music) return
    const m = new Music(room.scenes[0].theme)
    music.current = m
    m.start()
    const t = window.setTimeout(() => setMusicBlocked(!m.isRunning()), 600)
    return () => {
      window.clearTimeout(t)
      m.stop(0.8)
      music.current = null
    }
  }, [prefs.music, room])
  useEffect(() => {
    music.current?.setTension(Number.isFinite(left) && left < 5 * 60_000 ? 1 - Math.max(0, left) / (5 * 60_000) : 0)
  }, [left])
  const timedOut = !!room.timer && state.mode !== 'practice' && state.phase === 'playing' && left <= 0
  useEffect(() => {
    if (state.phase === 'escaped') music.current?.stop(2)
  }, [state.phase])
  const canHint = nextHintIndex(room, state) !== -1 && hintsLeft(state) > 0

  // Objects in the open dialog follow live state (another player may change them).
  const openInteraction = open ? currentInteraction(open, flags) : undefined
  // looking at something is free; it marks it as seen and records any notebook entry
  useEffect(() => {
    if (!open || !openInteraction) return
    const entry = 'note' in openInteraction ? openInteraction.note.notebook : undefined
    if (!flags.includes(`seen:${open.id}`) || (entry && !(state.notebook ?? []).includes(entry))) void session.dispatch({ type: 'READ', hotspot: open.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, openInteraction])

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
          <p className="truncate text-sm text-dim">{room.emoji} {room.title}{!collection && ` · ${LEVELS[level].label}`}</p>
          {collection ? <CollectionClock room={room} state={state} now={now} session={session} /> : <p className={`font-mono text-2xl font-extrabold ${left < 0 ? 'text-coral' : left < 5 * 60_000 ? 'text-coral' : 'text-gold-2'}`} role="timer" aria-label={left >= 0 ? `נותרו ${formatDuration(left)}` : `זמן נוסף ${formatDuration(-left)}`} data-testid="timer">
            {left >= 0 ? formatDuration(left) : `+${formatDuration(-left)}`}
          </p>}
        </div>
        <div className="flex items-center gap-2">
          {coop && <Players snap={snap} />}
          {musicBlocked && (
            <button className="btn btn-ghost !min-h-11 !px-3" onClick={() => { music.current?.start(); setMusicBlocked(!(music.current?.isRunning() ?? true)) }} aria-label="הפעלת מוזיקה">🎵</button>
          )}
          {collection && <button className="btn btn-ghost !min-h-11 !px-3" onClick={() => setNotebookOpen(true)} aria-label={`מחברת ראיות, ${(state.notebook ?? []).length} רשומות`}>📓 {(state.notebook ?? []).length}</button>}
          <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => setHintsOpen(true)}>💡 רמזים {!collection && state.hintsShown.length > 0 && `(${state.hintsShown.length})`}</button>
        </div>
      </div>
      {!collection && left < 0 && <p className="mb-2 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm">⏰ הזמן נגמר — אפשר להמשיך ולברוח, אבל בלי כוכבים.</p>}

      <Pressure room={room} state={state} now={now} reduced={prefs.reducedMotion} />

      {/* scene tabs */}
      {room.presentation !== 'phone' && <div role="tablist" aria-label="אזורים בחדר" className={`mb-2 grid gap-2 ${scenes.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {scenes.map((s) => {
          const here = snap.players.filter((p) => p.id !== snap.me.id && (p.scene ?? room.scenes[0].id) === s.id)
          return (
            <button key={s.id} role="tab" aria-selected={s.id === scene.id} onClick={() => setSceneId(s.id)} className={`btn ${s.id === scene.id ? 'btn-gold' : 'btn-ghost'} !min-h-11`}>
              {s.icon && <span aria-hidden="true">{s.icon}</span>} {s.name}
              {coop && here.length > 0 && <span aria-label={`כאן: ${here.map((p) => p.nick).join(', ')}`}>{here.map((p) => p.avatar).join('')}</span>}
            </button>
          )
        })}
      </div>}

      {/* the scene */}
      {tour && !inside ? (
        <div className="card relative overflow-hidden p-1.5">
          {room.presentation === 'board' && <button className="btn btn-ghost mb-1.5 w-full !min-h-10 !text-sm" onClick={() => setInside(true)}>📌 לוח הראיות — פתיחה והשוואה זה לצד זה</button>}
          <TourView
            src={tour.src}
            size={tour.size}
            view={tour.view}
            spots={tour.spots}
            flags={flags}
            label={scene.name}
            using={!!using}
            dark={!!room.darkUntil && !flags.includes(room.darkUntil)}
            reducedMotion={prefs.reducedMotion}
            focusId={open?.id ?? null}
            onTap={(id) => (id === '__enter' ? setInside(true) : tapHotspot(room.hotspots.find((h) => h.id === id)!))}
          />
          {unplaced.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 pb-1">
              <span className="text-xs font-bold text-dim">עוד כאן:</span>
              {unplaced.map((h) => (
                <button key={h.id} data-hotspot aria-label={h.name} className="chip !min-h-9 !text-xs hover:border-gold" onClick={() => tapHotspot(h)}>{h.icon ?? '🔎'} {h.name}</button>
              ))}
            </div>
          )}
          {flying && <span key={flying.key} className="item-fly" aria-hidden="true" onAnimationEnd={() => setFlying(null)}>{flying.icon}</span>}
        </div>
      ) : room.presentation === 'phone' ? (
        <div>
          {room.photo && <button className="btn btn-ghost mb-2 w-full !min-h-10 !text-sm" onClick={() => setInside(false)}>⬅ להניח את הטלפון ולחזור לחדר</button>}
          <PhoneView room={room} scenes={scenes} sceneId={phoneApp} setSceneId={setPhoneApp} flags={flags} onOpen={tapHotspot} />
        </div>
      ) : room.presentation === 'board' ? (
        <div>
          {room.photo && <button className="btn btn-ghost mb-2 w-full !min-h-10 !text-sm" onClick={() => setInside(false)}>⬅ חזרה לחדר החקירות</button>}
          <BoardView room={room} hotspots={hotspots} flags={flags} onOpen={tapHotspot} />
        </div>
      ) : (
      <div className="card relative overflow-hidden p-1.5">
        {use2D ? (
          <Scene2D room={visibleRoom} sceneId={scene.id} flags={flags} using={!!using} onTap={(id) => tapHotspot(room.hotspots.find((h) => h.id === id)!)} />
        ) : (
          <Scene3D
            room={room}
            sceneId={scene.id}
            flags={flags}
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
      )}

      {using && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-teal/50 bg-teal/10 px-3 py-2" role="status">
          <span>
            {using.icon} בחרו חפץ בחדר כדי להשתמש עליו ב<b>{using.name}</b>
          </span>
          <button className="btn btn-ghost !min-h-9 !px-3 !text-sm" onClick={() => setUsing(null)}>ביטול</button>
        </div>
      )}

      {/* objects list — also the accessible way to reach every object */}
      {!room.presentation || room.presentation === 'scene' ? <details className="mt-2 rounded-xl bg-black/20 px-3 py-2">
        <summary className="cursor-pointer text-sm font-bold text-mist">רשימת החפצים ב{scene.name}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {hotspots.map((h) => (
            <button key={h.id} className="btn btn-ghost !min-h-10 !px-3 !text-sm" onClick={() => tapHotspot(h)}>
              {h.name}
            </button>
          ))}
        </div>
      </details> : null}

      {/* inventory */}
      {room.items.length > 0 && <section className="card mt-3 p-3" aria-label="התיק">
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
      </section>}

      <Toast toast={toast} />

      {/* object dialog */}
      <Modal open={!!open} title={open?.name ?? ''} onClose={() => setOpen(null)}>
        {open && openInteraction && (
          <ObjectPanel
            key={open.id}
            hotspot={open}
            interaction={openInteraction}
            room={room}
            flags={flags}
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
            {(room.combos?.length ?? 0) > 0 && items.length > 1 && (
              <div className="mt-3">
                <p className="mb-2 text-sm font-bold text-mist">לשלב עם:</p>
                <div className="flex flex-wrap gap-2">
                  {items.filter((x) => x.id !== item.id).map((other) => (
                    <button
                      key={other.id}
                      className="tile flex min-h-12 items-center gap-2 rounded-xl border border-teal/40 px-3 font-bold"
                      onClick={async () => {
                        const r = await session.dispatch({ type: 'COMBINE', a: item.id, b: other.id })
                        if (r === 'wrong') {
                          play('wrong')
                          alertShake(`${item.name} ו${other.name} לא מתחברים.`)
                        } else if (r === 'ok') play('unlock')
                        setItem(null)
                      }}
                    >
                      <span aria-hidden="true">{other.icon}</span> {other.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
        {collection ? <PuzzleHints room={room} state={state} session={session} /> : <HintsPanel room={room} state={state} canHint={canHint} onHint={() => session.dispatch({ type: 'HINT' })} />}
      </Modal>

      <Modal open={notebookOpen} title="📓 מחברת הראיות" onClose={() => setNotebookOpen(false)}>
        <NotebookPanel room={room} state={state} />
        <button className="btn btn-ghost mt-3 w-full" onClick={() => setNotebookOpen(false)}>חזרה לחדר</button>
      </Modal>

      <TimeoutModal open={timedOut} onRestart={onRestart} onPractice={() => void session.dispatch({ type: 'SET_MODE', mode: 'practice' })} />
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
  const [straight, setStraight] = useState(false)
  const [big, setBig] = useState(false)
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
    <div className={`rounded-xl border-2 p-4 leading-relaxed whitespace-pre-line ${big ? 'text-2xl' : 'text-lg'} ${style}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-bold opacity-70">{note.title}</p>
        <span className="flex gap-1">
          {note.mirror && <button type="button" className="rounded-lg border border-current/30 px-2 py-1 text-xs font-bold" aria-pressed={straight} onClick={() => setStraight(!straight)}>{straight ? '🪞 כמו במראה' : '↔ קריאה ישרה'}</button>}
          {note.zoom && <button type="button" className="rounded-lg border border-current/30 px-2 py-1 text-xs font-bold" aria-pressed={big} onClick={() => setBig(!big)}>{big ? '➖ הקטנה' : '🔍 הגדלה'}</button>}
        </span>
      </div>
      {note.voice ? (
        <VoicePlayer voice={note.voice} transcript={text} />
      ) : note.mirror && !straight ? (
        <>
          <p aria-hidden="true" className="select-none bg-gradient-to-b from-[#bcd0df] to-[#8fa8bb] p-3 text-center text-[#1d2c3a] rounded-lg" style={{ transform: 'scaleX(-1)' }} data-testid="mirror-text">{text}</p>
          <p className="sr-only">{text}</p>
        </>
      ) : (
        <p>{text}</p>
      )}
    </div>
  )
}

function ObjectPanel({ hotspot, interaction, room, flags, inventory, session, onClose }: { hotspot: Hotspot; interaction: NonNullable<ReturnType<typeof currentInteraction>>; room: RoomDef; flags: string[]; inventory: ItemDef[]; session: GameSession; onClose: () => void }) {
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
  if (interaction.type === 'reveal') {
    const tool = interaction.item ? inventory.find((i) => i.id === interaction.item) : undefined
    if (interaction.item && !tool)
      return (
        <div>
          <NoteCard note={interaction.note} />
          <p className="mt-3 text-sm text-dim">משהו כאן לא נראה בעין רגילה. אולי כלי מתאים יעזור.</p>
          <button className="btn btn-ghost mt-3 w-full" onClick={onClose}>סגירה</button>
        </div>
      )
    return (
      <div>
        <p className="mb-2 text-mist">{interaction.note.text}</p>
        <RevealViewer
          hotspot={hotspot}
          tool={interaction.tool}
          hidden={interaction.hidden}
          at={interaction.at}
          onFound={() => {
            void session.dispatch({ type: 'REVEAL', hotspot: hotspot.id }).then((r) => {
              if (r === 'ok') window.setTimeout(() => setMsg(interaction.onReveal.message), 900)
            })
          }}
        />
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
  if (interaction.type === 'action')
    return (
      <div>
        <NoteCard note={interaction.note} />
        <button
          className="btn btn-gold mt-3 w-full"
          disabled={!interaction.repeatable && flags.includes(`acted:${hotspot.id}`)}
          onClick={async () => {
            const r = await session.dispatch({ type: 'ACT', hotspot: hotspot.id })
            if (r === 'ok') {
              play('unlock')
              setMsg(interaction.onAct.message)
            } else onClose()
          }}
        >
          {interaction.label}
        </button>
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
