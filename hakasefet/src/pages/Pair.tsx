import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatDuration } from '../engine/date'
import type { LockDef } from '../escape/types'
import { newPairState, PAIR_PUZZLES, pairReduce, roleName, viewFor, type PairState, type PairView, type Role } from '../pair/logic'
import { PAIR_ROOM } from '../pair/meta'
import { pairServerUrl, usePair } from '../pair/client'
import type { PeerInfo } from '../pair/protocol'
import { normalizeCode } from '../net/config'
import { completePairRun, type RunResult } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Coin } from '../ui/art'
import { LockPanel } from '../ui/escape/LockPanel'
import { play } from '../ui/audio'
import { Toast } from '../ui/kit'
import { TourView } from '../ui/escape/TourView'
import { useApp as usePrefs } from '../state/AppState'

// ── hub ───────────────────────────────────────────────────

/** Entry to the two-player room: create a session, join by code, or practise on one device. */
export function PairHub() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [server, setServer] = useState<'checking' | 'up' | 'down'>('checking')
  useEffect(() => {
    const url = pairServerUrl().replace(/^ws/, 'http') + '/health'
    fetch(url).then((r) => setServer(r.ok ? 'up' : 'down')).catch(() => setServer('down'))
  }, [])
  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <section className="card card-hero p-6">
        <h1 className="title-gold text-4xl">{PAIR_ROOM.emoji} {PAIR_ROOM.title}</h1>
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <li className="chip">קושי: {PAIR_ROOM.difficultyLabel}</li>
          <li className="chip">⏱ {PAIR_ROOM.length}</li>
          <li className="chip">👥 2 שחקנים, 2 מכשירים</li>
        </ul>
        <p className="mt-3 text-lg leading-relaxed text-mist">{PAIR_ROOM.story}</p>
        <p className="mt-3 rounded-xl border border-gold/30 bg-gold/5 p-3"><b className="text-gold">🎯 המטרה:</b> {PAIR_ROOM.goal}</p>
      </section>
      {server === 'down' && (
        <div role="note" className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="mb-1 font-bold text-gold">שרת החדר הזוגי לא זמין כרגע</p>
          <p className="text-mist">כדי לשחק בשני מכשירים צריך שרת קטן שרץ ברקע (ההוראות ב־README). בינתיים אפשר לנסות את מצב האימון במכשיר אחד. שאר החדרים עובדים כרגיל.</p>
        </div>
      )}
      <section className="card space-y-3 p-5">
        <button className="btn btn-gold w-full text-lg" onClick={() => nav('/pair/new')} disabled={server === 'down'}>➕ פתיחת חדר חדש</button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const c = normalizeCode(code)
            if (c.length === 5) nav(`/pair/${c}`)
          }}
        >
          <label htmlFor="pair-code" className="sr-only">קוד הצטרפות</label>
          <input id="pair-code" className="min-h-12 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 text-center font-mono text-xl tracking-[.3em]" placeholder="קוד" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} autoComplete="off" autoCapitalize="characters" dir="ltr" />
          <button className="btn btn-ghost shrink-0" disabled={normalizeCode(code).length !== 5 || server === 'down'}>הצטרפות</button>
        </form>
      </section>
      <section className="card p-5">
        <h2 className="font-bold">🧪 אימון במכשיר אחד</h2>
        <p className="mt-1 text-sm text-mist">רוצים להכיר את החדר? במצב אימון עוברים בין צד א׳ לצד ב׳ באותו מכשיר. זה לא המשחק הזוגי האמיתי, והוא לא מעניק את פרס הסיום.</p>
        <Link to="/pair-practice" className="btn btn-ghost mt-2 w-full">אימון</Link>
      </section>
    </div>
  )
}

// ── online game ───────────────────────────────────────────

const ERRORS: Record<string, { title: string; text: string }> = {
  'not-found': { title: 'הקוד לא נמצא', text: 'בדקו שהקלדתם נכון את חמשת התווים, או בקשו מהשותף קישור חדש.' },
  full: { title: 'החדר מלא', text: 'כבר יש שני שחקנים בחדר הזה. אפשר לפתוח חדר חדש.' },
  expired: { title: 'פג תוקף החדר', text: 'החדר נסגר כי עבר זמן רב מדי. פתחו חדר חדש.' },
  'bad-token': { title: 'לא הצלחנו לחזור לחדר', text: 'המקום שלכם בחדר כבר לא שמור. אפשר להצטרף מחדש עם הקוד.' },
}

export function PairGame() {
  const { code = '' } = useParams()
  return <PairOnline key={code} code={code} />
}

function PairOnline({ code }: { code: string }) {
  const nav = useNavigate()
  const pair = usePair(code === 'new' ? { create: true } : { code: normalizeCode(code) })
  const [now, setNow] = useState(() => pair.serverNow())
  useEffect(() => {
    const t = window.setInterval(() => setNow(pair.serverNow()), 500)
    return () => window.clearInterval(t)
  }, [pair])
  // a new session gets its own address, so a refresh or the invite link comes back to it
  useEffect(() => {
    if (code === 'new' && pair.code) nav(`/pair/${pair.code}`, { replace: true })
  }, [code, pair.code, nav])

  if (pair.error && ERRORS[pair.error]) {
    const e = ERRORS[pair.error]
    return (
      <div className="mx-auto max-w-md py-6 text-center" role="alert" data-testid="pair-error">
        <h1 className="title-gold text-3xl">{e.title}</h1>
        <p className="mt-2 text-mist">{e.text}</p>
        <Link to="/pair" className="btn btn-gold mt-4">לחדר הזוגי</Link>
      </div>
    )
  }
  const s = pair.state
  if (!s) return <p className="py-10 text-center text-mist" role="status">{pair.status === 'reconnecting' ? 'מנסים להתחבר לשרת…' : 'מתחברים…'}</p>
  const other: Role = s.role === 'A' ? 'B' : 'A'
  return (
    <div className="mx-auto max-w-2xl py-1">
      {pair.status !== 'online' && <p className="mb-2 rounded-xl border border-coral/50 bg-coral/10 p-2 text-sm" role="status">החיבור נקטע — מתחברים מחדש. התפקיד שלכם שמור.</p>}
      {s.phase !== 'waiting' && s.peers[other].taken && !s.peers[other].connected && (
        <p className="mb-2 rounded-xl border border-gold/50 bg-gold/10 p-2 text-sm" role="status" data-testid="peer-gone">⚠️ השותף ({roleName(other)}) התנתק. ההתקדמות נשמרת — מחכים שיחזור.</p>
      )}
      {s.phase === 'waiting' ? (
        <Waiting code={s.code} role={s.role} peers={s.peers} onReady={pair.ready} />
      ) : s.phase === 'done' ? (
        <PairResult view={s.view} practice={false} runId={`pair:${s.code}:${s.view.startedAt}`} />
      ) : (
        <PairBoard view={s.view} role={s.role} now={now} act={pair.act} />
      )}
    </div>
  )
}

function Waiting({ code, role, peers, onReady }: { code: string; role: Role; peers: Record<Role, PeerInfo>; onReady: (r: boolean) => void }) {
  const link = `${location.href.split('#')[0]}#/pair/${code}`
  const [toast, setToast] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const other: Role = role === 'A' ? 'B' : 'A'
  async function copy() {
    try {
      if (navigator.share) {
        await navigator.share({ title: PAIR_ROOM.title, text: 'בואו לשחק איתי בחדר הבריחה הזוגי', url: link })
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(link)
      setToast('הקישור הועתק')
    } catch {
      setManual(true)
    }
  }
  return (
    <section className="card card-hero p-6 text-center" aria-labelledby="wait-title" data-testid="waiting">
      <h1 id="wait-title" className="title-gold text-3xl">חדר ההמתנה</h1>
      <p className="mt-1 text-mist">אתם <b className="text-gold" data-testid="my-role">{roleName(role)}</b></p>
      <p className="mt-4 text-sm text-dim">קוד ההצטרפות</p>
      <p className="font-mono text-5xl font-extrabold tracking-[.3em] text-gold-2" dir="ltr" data-testid="pair-code">{code}</p>
      <button className="btn btn-ghost mt-3" onClick={copy}>🔗 שליחת קישור הזמנה</button>
      {manual && <input readOnly className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 p-2 text-sm" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="קישור הזמנה להעתקה" dir="ltr" />}
      <ul className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2" aria-label="שחקנים">
        {(['A', 'B'] as const).map((r) => (
          <li key={r} className={`rounded-xl border-2 p-3 ${peers[r].ready ? 'border-teal bg-teal/10' : 'border-white/15'}`}>
            <p className="font-bold">{roleName(r)}{r === role && ' (אתם)'}</p>
            <p className="text-sm text-mist">{!peers[r].taken ? 'מחכים לשחקן…' : !peers[r].connected ? 'התנתק' : peers[r].ready ? '✓ מוכן' : 'מחובר'}</p>
          </li>
        ))}
      </ul>
      <button className={`btn mt-5 w-full text-lg ${peers[role].ready ? 'btn-ghost' : 'btn-gold'}`} onClick={() => onReady(!peers[role].ready)} aria-pressed={peers[role].ready}>
        {peers[role].ready ? 'ביטול ״מוכן״' : '✋ אני מוכן'}
      </button>
      <p className="mt-2 text-sm text-dim">{!peers[other].taken ? 'שלחו לשותף את הקוד או את הקישור.' : 'המשחק מתחיל כששניכם מוכנים. כל אחד רואה מידע אחר — תצטרכו לדבר!'}</p>
      <Toast message={toast} onDone={() => setToast(null)} />
    </section>
  )
}

// ── the board one player sees ─────────────────────────────

function toLock(view: PairView): LockDef | null {
  const i = view.input
  if (!i) return null
  if (i.kind === 'choice') return { kind: 'choice', options: i.options, answer: '' }
  if (i.kind === 'digits') return { kind: 'digits', length: i.length, answer: '' }
  if (i.kind === 'switches') return { kind: 'switches', count: i.count, answer: [] }
  return { kind: 'terminal', answers: [] }
}

type Act = (type: 'answer' | 'hint' | 'exit', stage: number, value?: string) => Promise<'ok' | 'wrong' | 'invalid' | 'timeout'>

export function PairBoard({ view, role, now, act }: { view: PairView; role: Role; now: number; act: Act }) {
  const [confirmHint, setConfirmHint] = useState(false)
  const lock = toLock(view)
  const elapsed = view.startedAt ? (view.finishedAt ?? now) - view.startedAt : 0
  return (
    <div className="space-y-3" data-testid="pair-board" data-role={role}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-dim">{PAIR_ROOM.emoji} {PAIR_ROOM.title} · <b className="text-gold">{roleName(role)}</b></p>
          <p className="font-mono text-2xl font-extrabold text-gold-2" role="timer" aria-label={`זמן ${formatDuration(elapsed)}`}>{formatDuration(elapsed)}</p>
        </div>
        <span className="chip" data-testid="points">🏆 {view.points}</span>
      </div>
      <PairRoomView role={role} />
      <ol className="flex gap-1" aria-label={`שלב ${Math.min(view.stage + 1, 6)} מתוך 6`}>
        {PAIR_PUZZLES.map((p, i) => <li key={p.id} className={`h-2 flex-1 rounded-full ${i < view.stage ? 'bg-teal' : i === view.stage ? 'bg-gold' : 'bg-white/15'}`} />)}
      </ol>
      <section className="card p-4" aria-labelledby="stage-title">
        <h2 id="stage-title" className="font-display text-2xl font-bold">{view.stage < 6 ? `שלב ${view.stage + 1}: ` : ''}{view.name}</h2>
        <p className="mt-1 text-mist" data-testid="task">{view.task}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {view.docs.map((d) => (
            <div key={d.title} className="rounded-xl border-2 border-amber-200/40 bg-[#f4ecd8] p-3 text-[#2a1d02]" data-testid="doc">
              <p className="mb-1 text-sm font-bold opacity-70">{d.title}</p>
              <p className="whitespace-pre-line text-lg leading-relaxed">{d.text}</p>
            </div>
          ))}
        </div>
        {lock && (
          <div className="mt-4">
            <LockPanel key={`${view.stage}`} lock={lock} onSubmit={async (v) => { const r = await act('answer', view.stage, v); if (r === 'ok') play('unlock'); return r }} />
          </div>
        )}
        {view.stage === 6 && !view.finished && (
          <button className="btn btn-gold mt-4 w-full text-lg" disabled={view.exitConfirmed} onClick={() => act('exit', 6)}>
            {view.exitConfirmed ? 'מחכים שהשותף יאשר…' : '🚪 יוצאים'}
          </button>
        )}
      </section>
      {view.stage < 6 && (
        <section className="card p-4" aria-label="רמזים">
          {view.hints.map((h, i) => <p key={i} className="mb-1.5 rounded-lg bg-black/25 p-2 text-sm"><b className="text-gold">רמז {i + 1}:</b> {h}</p>)}
          {view.hintTier < 3 && (confirmHint ? (
            <div className="rounded-lg border border-coral/50 bg-coral/10 p-2 text-sm" role="alert">
              <p className="mb-2 font-bold">⚠️ הרמז השלישי כמעט חושף את הפתרון — לשניכם. להציג?</p>
              <div className="flex gap-2">
                <button className="btn btn-ghost flex-1 !min-h-10" onClick={() => setConfirmHint(false)}>לא</button>
                <button className="btn btn-danger flex-1 !min-h-10" onClick={() => { setConfirmHint(false); void act('hint', view.stage) }}>להציג</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost w-full !min-h-11" onClick={() => (view.hintTier === 2 ? setConfirmHint(true) : void act('hint', view.stage))}>💡 רמז {view.hintTier + 1} מתוך 3 (−50, משותף לשניכם)</button>
          ))}
        </section>
      )}
      <ul className="space-y-1 text-sm" aria-live="polite" aria-label="מה קרה">
        {view.log.slice(-4).reverse().map((l, i) => <li key={`${l.at}-${i}`} className={l.kind === 'wrong' ? 'text-coral' : l.kind === 'good' ? 'text-teal-2' : 'text-mist'}>{l.text}</li>)}
      </ul>
    </div>
  )
}

/** The room itself: side A looks at the cipher desk, side B through the glass at the control room. */
function PairRoomView({ role }: { role: Role }) {
  const { prefs } = usePrefs()
  return (
    <div className="card overflow-hidden p-1.5">
      <TourView src="rooms/pair.webp" size={[1672, 941]} view={role === 'A' ? [0, 120, 1200, 821] : [560, 40, 760, 560]} spots={[]} flags={[]} label={role === 'A' ? 'צד א׳ — שולחן הצפנים' : 'צד ב׳ — חדר הבקרה שמעבר לזכוכית'} reducedMotion={prefs.reducedMotion} onTap={() => {}} />
    </div>
  )
}

// ── result ────────────────────────────────────────────────

function PairResult({ view, practice, runId }: { view: PairView; practice: boolean; runId: string }) {
  const { reload } = useApp()
  const [res, setRes] = useState<RunResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  useEffect(() => {
    if (!view.startedAt || !view.finishedAt) return
    completePairRun({ runId, points: view.points, timeMs: view.finishedAt - view.startedAt, hints: view.hintsUsed, wrong: view.wrong, practice, finishedAt: view.finishedAt })
      .then(async (r) => {
        setRes(r)
        await reload()
        play('unlock')
      })
      .catch(() => {})
    // record once per play-through (the view object is rebuilt on every update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, view.finishedAt, practice])
  const text = `יצאנו יחד מ״${PAIR_ROOM.title}״ עם ${view.points} נקודות${practice ? ' (אימון)' : ''} 🚪 בלי ספוילרים — נסו עם חבר!`
  const xp = res?.grants.reduce((a, g) => a + g.xp, 0) ?? 0
  const coins = res?.grants.reduce((a, g) => a + g.coins, 0) ?? 0
  return (
    <div className="space-y-3">
      <section className="card card-hero p-6 text-center" data-testid="pair-result">
        <p className="anim-pop text-6xl" aria-hidden="true">🚪✨</p>
        <h1 className="title-gold text-4xl">יצאתם ביחד!</h1>
        {practice && <p className="font-bold text-teal-2">🧪 אימון במכשיר אחד</p>}
        <p className="mt-3 font-mono text-5xl font-extrabold text-gold-2" data-testid="score">{view.points}<span className="text-lg text-dim"> / 1000</span></p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-right">
          <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">זמן</dt><dd className="text-xl font-extrabold">{formatDuration((view.finishedAt ?? 0) - (view.startedAt ?? 0))}</dd></div>
          <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">רמזים</dt><dd className="text-xl font-extrabold">{view.hintsUsed}</dd></div>
          <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">שגיאות</dt><dd className="text-xl font-extrabold">{view.wrong}</dd></div>
        </dl>
        {res && (res.grants.some((g) => g.kind === 'first-room') ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2" data-testid="rewards">
            <span className="chip anim-pop">🏅 פרס סיום ראשון: {PAIR_ROOM.title}</span>
            <span className="chip anim-pop">+{xp} XP</span>
            <span className="chip anim-pop"><Coin /> +{coins}</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-dim">{practice ? 'באימון אין פרס — את הפרס מקבלים במשחק הזוגי בשני מכשירים.' : 'את פרס הסיום על החדר הזה כבר קיבלתם.'}</p>
        ))}
      </section>
      <details className="card p-4">
        <summary className="cursor-pointer font-bold">🧩 הסבר הפתרון</summary>
        <ol className="mt-3 space-y-2">
          {PAIR_PUZZLES.map((p, i) => <li key={p.id} className="rounded-xl bg-black/25 p-3 text-sm"><b>{i + 1}. {p.name}: <span className="text-gold">{p.solution}</span></b><br />{p.explanation}</li>)}
        </ol>
      </details>
      {manual && <textarea readOnly className="w-full rounded-lg border border-white/15 bg-black/40 p-2" rows={3} value={manual} aria-label="טקסט לשיתוף" onFocus={(e) => e.currentTarget.select()} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn btn-gold" onClick={async () => {
          const url = location.href.split('#')[0]
          try { await navigator.clipboard.writeText(`${text}\n${url}`); setToast('הטקסט הועתק') } catch { setManual(`${text}\n${url}`) }
        }}>שיתוף</button>
        <Link to="/escape" className="btn btn-ghost">לחדרי הבריחה</Link>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

// ── same-device practice ──────────────────────────────────

/** Practice on one device: the same puzzles, switching between the two sides. Clearly not the real thing. */
export function PairPractice() {
  const [state, setState] = useState<PairState>(() => ({ ...newPairState(), startedAt: Date.now() }))
  const [role, setRole] = useState<Role>('A')
  const [now, setNow] = useState(Date.now())
  const runId = useMemo(() => `pair-practice:${state.startedAt}`, [state.startedAt])
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [])
  const view = viewFor(state, role)
  const act: Act = async (type, stage, value) => {
    const id = crypto.randomUUID()
    const a = type === 'answer' ? { id, role, type, stage, value: value ?? '' } : { id, role, type, stage }
    const r = pairReduce(state, a as Parameters<typeof pairReduce>[1], Date.now())
    setState(r.state)
    return r.outcome
  }
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-1">
      <p className="rounded-xl border border-teal/50 bg-teal/10 p-2 text-center font-bold" role="note" data-testid="practice-banner">🧪 אימון — מכשיר אחד, עוברים בין הצדדים. לא המשחק הזוגי האמיתי.</p>
      {view.finished ? (
        <PairResult view={view} practice runId={runId} />
      ) : (
        <>
          <div role="tablist" aria-label="צד" className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((r) => <button key={r} role="tab" aria-selected={role === r} className={`btn ${role === r ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setRole(r)}>{roleName(r)}</button>)}
          </div>
          <PairBoard key={role} view={view} role={role} now={now} act={act} />
        </>
      )}
    </div>
  )
}
