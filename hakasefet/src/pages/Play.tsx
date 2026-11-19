import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getPack } from '../content'
import { CATEGORY_LABEL, CATEGORY_ROOM, LEVEL_LABEL } from '../content/labels'
import { CATEGORIES, type Category, type Mystery, type OptionId } from '../content/types'
import { allQuestions, currentQuestion, isExpired, makeCtx, openableRooms, reduce, type Action, type Attempt, type Ctx } from '../engine/attempt'
import { BASE_POINTS, FIFTY_COST, HINT_COST, QUESTION_MS, WRONG_CODE_COST } from '../engine/scoring'
import { abandonActive, completeAttempt, getActiveAttempt, saveAttempt } from '../storage/repo'
import { newest, readBackup, writeBackup } from '../storage/backup'
import { useApp } from '../state/AppState'
import { KeyArt, RoomIcon, Vault } from '../ui/art'
import { play } from '../ui/audio'
import { ErrorBox, Loading, Modal } from '../ui/kit'

/** Loads the active attempt, applies actions through the pure reducer and persists every change. */
function usePlay() {
  const [attempt, setAttempt] = useState<Attempt | null | undefined>(undefined)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [error, setError] = useState<'storage' | 'version' | null>(null)
  const ref = useRef<Attempt | null>(null)
  const ctxRef = useRef<Ctx | null>(null)

  useEffect(() => {
    getActiveAttempt()
      .then((fromDb) => {
        const a = newest(fromDb, readBackup())
        if (!a) return setAttempt(null)
        const pack = getPack(a.contentVersion)
        if (!pack) {
          setError('version')
          return setAttempt(a)
        }
        const c = makeCtx(pack, a.mysteryId)
        ctxRef.current = c
        setCtx(c)
        // Settle the timer right away: time keeps running while the tab is closed.
        const settled = isExpired(a, Date.now()) ? reduce(a, { type: 'EXPIRE', now: Date.now() }, c) : a
        ref.current = settled
        setAttempt(settled)
        if (settled !== fromDb) void saveAttempt(settled)
      })
      .catch(() => setError('storage'))
  }, [])

  const dispatch = useCallback((action: Action) => {
    const cur = ref.current
    const c = ctxRef.current
    if (!cur || !c) return cur
    const next = reduce(cur, action, c)
    if (next !== cur) {
      ref.current = next
      setAttempt(next)
      writeBackup(next)
      saveAttempt(next).catch(() => setError('storage'))
    }
    return next
  }, [])

  return { attempt, ctx, error, dispatch }
}

export function Play() {
  const { attempt, ctx, error, dispatch } = usePlay()
  const nav = useNavigate()
  const { reload } = useApp()
  const [cluesOpen, setCluesOpen] = useState(false)
  const finishing = useRef(false)

  // Timer reconciliation: on a tick, and whenever the tab becomes visible again.
  useEffect(() => {
    const check = () => {
      if (attempt && isExpired(attempt, Date.now())) {
        dispatch({ type: 'EXPIRE', now: Date.now() })
        play('wrong')
      }
    }
    const id = window.setInterval(check, 250)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [attempt, dispatch])

  // Solved → record result + rewards once, then show results.
  useEffect(() => {
    if (attempt?.phase !== 'solved' || finishing.current) return
    finishing.current = true
    completeAttempt(attempt)
      .then(async () => {
        await reload()
        nav(`/result/${attempt.id}`, { replace: true, state: { fresh: true } })
      })
      .catch(() => {
        finishing.current = false
      })
  }, [attempt, nav, reload])

  if (error === 'storage') return <ErrorBox title="בעיה בשמירה" text="לא הצלחנו לקרוא או לשמור את המשחק במכשיר. נסו לרענן את הדף." action={<button className="btn btn-gold" onClick={() => location.reload()}>רענון</button>} />
  if (error === 'version')
    return (
      <ErrorBox
        title="גרסת התוכן של המשחק לא זמינה"
        text="המשחק השמור שייך לגרסת תוכן שכבר לא נמצאת במכשיר. אפשר לסגור אותו ולפתוח את הכספת של היום."
        action={<button className="btn btn-gold" onClick={() => abandonActive().then(() => nav('/'))}>לכספת של היום</button>}
      />
    )
  if (attempt === undefined) return <Loading text="טוען את המשחק…" />
  if (attempt === null || !ctx)
    return <ErrorBox title="אין משחק פתוח" text="אפשר להתחיל את הכספת של היום מדף הבית." action={<Link className="btn btn-gold" to="/">לדף הבית</Link>} />

  const mystery = ctx.mystery
  const showCluesButton = attempt.phase !== 'level' && attempt.phase !== 'board' && attempt.phase !== 'solved'

  return (
    <div className="mx-auto max-w-xl py-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-dim">{mystery.emoji} {mystery.title}{attempt.level && ` · ${LEVEL_LABEL[attempt.level]}`}</p>
          <p className="text-lg font-extrabold">
            <span className="text-gold" data-testid="score">{attempt.score}</span> נקודות
          </p>
        </div>
        {showCluesButton && (
          <button className="btn btn-ghost shrink-0 !min-h-11 !px-4" onClick={() => setCluesOpen(true)} aria-label={`לוח הרמזים: ${attempt.revealedClues.length} מתוך 3`}>
            <span aria-hidden="true">🗝️</span> רמזים {attempt.revealedClues.length}/3
          </button>
        )}
      </div>

      {attempt.phase === 'level' && <LevelSelect onPick={(level) => dispatch({ type: 'SELECT_LEVEL', level, now: Date.now() })} />}
      {attempt.phase === 'map' && <RoomMap attempt={attempt} onEnter={(category) => { play('tap'); dispatch({ type: 'ENTER_ROOM', category, now: Date.now() }) }} />}
      {attempt.phase === 'question' && <QuestionView attempt={attempt} ctx={ctx} dispatch={dispatch} />}
      {attempt.phase === 'clue' && <ClueReveal attempt={attempt} mystery={mystery} onClose={() => dispatch({ type: 'CLOSE_CLUE', now: Date.now() })} />}
      {attempt.phase === 'board' && <Board attempt={attempt} mystery={mystery} dispatch={dispatch} />}
      {attempt.phase === 'solved' && <Loading text="פותחים את הכספת…" />}

      <Modal open={cluesOpen} title="לוח הרמזים" onClose={() => setCluesOpen(false)}>
        <CluesList attempt={attempt} mystery={mystery} />
      </Modal>
    </div>
  )
}

function LevelSelect({ onPick }: { onPick: (l: 'normal' | 'hard') => void }) {
  return (
    <section className="anim-rise space-y-3" aria-labelledby="lvl">
      <h1 id="lvl" className="title-gold text-3xl">בחרו רמה</h1>
      <p className="text-mist">הרמה נשארת קבועה עד סוף המשחק.</p>
      {(['normal', 'hard'] as const).map((l) => (
        <button key={l} className="card tile flex w-full items-center gap-4 p-5 text-right" onClick={() => { play('tap'); onPick(l) }}>
          <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-4xl shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_14px_-4px_rgba(0,0,0,.8)] ${l === 'normal' ? 'bg-gradient-to-b from-teal/40 to-teal/10' : 'bg-gradient-to-b from-coral/45 to-coral/10'}`} aria-hidden="true">{l === 'normal' ? '🗝️' : '🔥'}</span>
          <span>
            <span className="font-display block text-2xl font-bold">{LEVEL_LABEL[l]}</span>
            <span className="block text-mist">{BASE_POINTS[l]} נקודות לתשובה נכונה + בונוס מהירות עד 20</span>
          </span>
        </button>
      ))}
    </section>
  )
}

function RoomMap({ attempt, onEnter }: { attempt: Attempt; onEnter: (c: Category) => void }) {
  const openable = openableRooms(attempt)
  return (
    <section className="anim-rise" aria-labelledby="map">
      <h1 id="map" className="title-gold mb-1 text-3xl">מפת החדרים</h1>
      <p className="mb-4 text-mist">
        {attempt.fixedRoomOrder ? 'המסלול נקבע לפי האתגר שקיבלתם.' : attempt.roomOrder.length === 0 ? 'בחרו באיזה חדר להתחיל. כל חדר נפתח פעם אחת.' : 'בחרו את החדר הבא.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => {
          const done = attempt.roomOrder.includes(c)
          const can = openable.includes(c)
          const pos = attempt.fixedRoomOrder ? attempt.fixedRoomOrder.indexOf(c) + 1 : undefined
          return (
            <button
              key={c}
              disabled={!can}
              onClick={() => onEnter(c)}
              aria-label={`${CATEGORY_ROOM[c]}${done ? ' — הושלם' : can ? '' : ' — נעול'}`}
              className={`card flex items-center gap-4 p-4 text-right transition sm:flex-col sm:text-center ${can ? 'door-hover tile' : ''} ${done ? 'door-open' : ''}`}
            >
              <span className="door-frame relative block h-28 w-24 shrink-0 rounded-t-2xl bg-[radial-gradient(circle_at_50%_55%,rgba(255,217,122,.45),rgba(5,10,28,.95)_70%)] shadow-[inset_0_0_0_3px_rgba(10,20,48,.9),inset_0_8px_18px_rgba(0,0,0,.8)]" aria-hidden="true">
                <span className="absolute inset-0 grid place-items-center"><RoomIcon category={c} size={56} /></span>
                <span className="door-panel">
                  <span className="door-knob" />
                  <span className="absolute inset-x-0 top-3 text-center text-xs font-extrabold text-gold-2 engraved">{done ? '✓' : can ? (pos ?? '') : '🔒'}</span>
                </span>
              </span>
              <span className="flex-1">
                <span className="font-display block text-xl font-bold">{CATEGORY_ROOM[c]}</span>
                <span className="block text-sm text-mist">
                  {done ? '✓ הושלם · הרמז נאסף' : can ? 'שתי שאלות · רמז אחד' : '🔒 נעול כרגע'}
                  {pos ? ` · תחנה ${pos}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function useCountdown(deadline?: number, stopped?: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (stopped) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [stopped, deadline])
  return deadline ? Math.max(0, deadline - now) : QUESTION_MS
}

function QuestionView({ attempt, ctx, dispatch }: { attempt: Attempt; ctx: Ctx; dispatch: (a: Action) => Attempt | null }) {
  const qs = currentQuestion(attempt)!
  const q = ctx.question(qs.questionId)
  const answered = qs.answer
  const remaining = useCountdown(qs.deadline, !!answered)
  const secs = Math.ceil(remaining / 1000)
  const number = allQuestions(attempt).findIndex((x) => x.questionId === qs.questionId) + 1
  const continueRef = useRef<HTMLButtonElement>(null)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (answered) continueRef.current?.focus()
  }, [answered])

  const pick = (id: OptionId) => {
    const next = dispatch({ type: 'ANSWER', optionId: id, now: Date.now() })
    const a = next ? currentQuestion(next)?.answer : undefined
    if (!a) return
    play(a.correct ? 'correct' : 'wrong')
    if (!a.correct) setShake(true)
  }

  // Keyboard: 1–4 choose an answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answered || e.target instanceof HTMLInputElement) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < 4) {
        const id = qs.optionOrder[i]
        if (!qs.removed?.includes(id)) pick(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ring = 2 * Math.PI * 20
  const urgent = secs <= 5 && !answered

  return (
    <section className="anim-rise" aria-labelledby="qtext">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RoomIcon category={qs.category} size={36} />
          <div>
            <p className="font-bold">{CATEGORY_ROOM[qs.category]}</p>
            <p className="text-sm text-dim">שאלה {number} מתוך 6</p>
          </div>
        </div>
        <div className="relative grid h-14 w-14 place-items-center" role="timer" aria-label={`נותרו ${secs} שניות`}>
          <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgb(255 255 255 / .12)" strokeWidth="5" />
            <circle cx="24" cy="24" r="20" fill="none" stroke={urgent ? '#ff7a6b' : '#f2c14e'} strokeWidth="5" strokeDasharray={ring} strokeDashoffset={ring * (1 - remaining / QUESTION_MS)} strokeLinecap="round" />
          </svg>
          <span className={`text-lg font-extrabold ${urgent ? 'text-coral' : ''}`}>{answered ? '—' : secs}</span>
        </div>
      </div>
      <div className="mb-3 flex gap-1" aria-hidden="true">
        {allQuestions(attempt).map((x, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${x.answer ? (x.answer.correct ? 'bg-teal' : 'bg-coral') : x.questionId === qs.questionId ? 'bg-gold' : 'bg-white/15'}`} />
        ))}
        {Array.from({ length: 6 - allQuestions(attempt).length }, (_, i) => <span key={`e${i}`} className="h-1.5 flex-1 rounded-full bg-white/15" />)}
      </div>

      <div className="card p-5">
        <h1 id="qtext" className="mb-5 text-xl font-extrabold leading-snug sm:text-2xl">{q.text}</h1>
        <div className={`grid gap-2.5 ${shake ? 'anim-shake' : ''}`} onAnimationEnd={() => setShake(false)}>
          {qs.optionOrder.map((id, i) => {
            const opt = q.options.find((o) => o.id === id)!
            const removed = qs.removed?.includes(id)
            const isCorrect = id === q.answerId
            const chosen = answered?.optionId === id
            let cls = 'border-gold/15 hover:border-gold/60'
            let mark = ''
            if (answered) {
              if (isCorrect) { cls = 'border-teal bg-teal/20 anim-glow'; mark = '✓ התשובה הנכונה' }
              else if (chosen) { cls = 'border-coral bg-coral/15'; mark = '✗ הבחירה שלך' }
              else cls = 'border-white/10 bg-white/5 opacity-60'
            }
            return (
              <button
                key={id}
                disabled={!!answered || removed}
                onClick={() => pick(id)}
                className={`tile flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-right text-lg font-bold ${cls} ${removed ? 'invisible' : ''}`}
                aria-label={removed ? undefined : `${i + 1}. ${opt.text}${mark ? ` — ${mark}` : ''}`}
                aria-hidden={removed || undefined}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/30 text-sm" aria-hidden="true">{i + 1}</span>
                <span className="flex-1">{opt.text}</span>
                {mark && <span className={`text-sm ${isCorrect ? 'text-teal-2' : 'text-coral'}`}>{mark}</span>}
              </button>
            )
          })}
        </div>

        {!answered && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button className="btn btn-ghost" disabled={attempt.fiftyUsed} onClick={() => { play('tap'); dispatch({ type: 'FIFTY', now: Date.now() }) }}>
              ✂️ חצי־חצי (−{FIFTY_COST})
            </button>
            <span className="text-sm text-dim">{attempt.fiftyUsed ? 'חצי־חצי כבר נוצל במשחק הזה' : 'אפשר פעם אחת במשחק'}</span>
          </div>
        )}

        {answered && (
          <div className="anim-rise mt-4 rounded-2xl border border-white/10 bg-black/25 p-4" aria-live="polite">
            <p className={`mb-1 text-lg font-extrabold ${answered.correct ? 'text-teal-2' : 'text-coral'}`}>
              {answered.correct ? `✓ נכון! +${answered.points}` : answered.timedOut ? '⏰ נגמר הזמן' : '✗ לא הפעם'}
            </p>
            <p className="text-mist">{q.explanation}</p>
            <button ref={continueRef} className="btn btn-gold mt-3 w-full" onClick={() => { play('tap'); dispatch({ type: 'CONTINUE', now: Date.now() }) }}>
              ממשיכים
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function ClueReveal({ attempt, mystery, onClose }: { attempt: Attempt; mystery: Mystery; onClose: () => void }) {
  const cat = attempt.revealedClues[attempt.revealedClues.length - 1]
  const clue = mystery.clues[cat]
  const n = mystery.readingOrder.indexOf(cat) + 1
  const last = attempt.roomOrder.length === 3
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    play('clue')
    const t = window.setTimeout(() => setFlipped(true), 900)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <section className="text-center" aria-labelledby="clue-title">
      <div className="mb-3 flex justify-center"><KeyArt size={84} className="anim-key drop-shadow-[0_8px_16px_rgba(242,193,78,.45)]" /></div>
      <p className="text-sm font-bold text-gold">{CATEGORY_ROOM[cat]} הושלם — נחשף רמז!</p>
      <div className={`flip mx-auto mt-3 max-w-md ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)}>
        <div className="flip-inner">
          <div className="flip-face card card-hero grid min-h-56 place-items-center p-6" aria-hidden="true">
            <div className="flex flex-col items-center gap-3">
              <span className="anim-seal grid h-20 w-20 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ff9b8c,#c0392b_55%,#7a1d14)] text-3xl shadow-[0_6px_16px_rgba(0,0,0,.7),inset_0_2px_4px_rgba(255,255,255,.35)]">🔐</span>
              <span className="font-display text-xl text-gold-2">מעטפה חתומה</span>
            </div>
          </div>
          <div className="flip-face flip-back card card-hero p-6 text-right">
            <p className="mb-1 text-sm text-dim">רמז מס׳ {n} בלוח · נאספו {attempt.revealedClues.length} מתוך 3</p>
            <div className="gold-rule mb-3" />
            <h1 id="clue-title" className="title-gold mb-2 text-3xl">{clue.title}</h1>
            <p className="text-lg leading-relaxed">{clue.text}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-dim">הרמז נשמר בלוח הרמזים.</p>
      <button className="btn btn-gold mt-4 w-full max-w-md" onClick={onClose} autoFocus>
        {last ? 'ללוח החקירה' : 'ממשיכים לחדר הבא'}
      </button>
    </section>
  )
}

function CluesList({ attempt, mystery }: { attempt: Attempt; mystery: Mystery }) {
  return (
    <div>
      <p className="mb-3 rounded-xl bg-gold/10 p-3 text-sm"><b className="text-gold">איך מחברים: </b>{mystery.orderRule}</p>
      <ol className="space-y-2">
        {mystery.readingOrder.map((c, i) => {
          const open = attempt.revealedClues.includes(c)
          return (
            <li key={c} className={`rounded-xl border p-3 ${open ? 'border-gold/40 bg-white/5' : 'border-dashed border-white/15'}`}>
              <p className="mb-1 flex items-center gap-2 text-sm text-dim">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gold font-extrabold text-ink">{i + 1}</span>
                {CATEGORY_LABEL[c]}
              </p>
              {open ? (
                <>
                  <p className="font-bold">{mystery.clues[c].title}</p>
                  <p className="text-mist">{mystery.clues[c].text}</p>
                </>
              ) : (
                <p className="text-dim">🔒 ייחשף אחרי {CATEGORY_ROOM[c]}</p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Board({ attempt, mystery, dispatch }: { attempt: Attempt; mystery: Mystery; dispatch: (a: Action) => Attempt | null }) {
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [confirmHint, setConfirmHint] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4}$/.test(code)) {
      setFeedback('הקוד צריך להיות בדיוק ארבע ספרות.')
      return
    }
    const next = dispatch({ type: 'SUBMIT_CODE', code, now: Date.now() })
    if (next?.phase === 'solved') {
      play('unlock')
      setFeedback(null)
    } else {
      play('wrong')
      setShake(true)
      setFeedback(`הקוד ${code} לא פותח את הכספת. ירדו ${WRONG_CODE_COST} נקודות — נסו שוב.`)
      setCode('')
    }
  }

  return (
    <section className="anim-rise space-y-4" aria-labelledby="board-title">
      <div className="flex items-center gap-3">
        <Vault size={72} />
        <div>
          <h1 id="board-title" className="title-gold text-3xl">לוח החקירה</h1>
          <p className="text-mist">כל הרמזים אצלכם. חברו אותם לקוד בן ארבע ספרות.</p>
        </div>
      </div>
      <div className="card p-4"><CluesList attempt={attempt} mystery={mystery} /></div>

      {attempt.hintUsed && (
        <div className="anim-rise rounded-xl border border-teal/40 bg-teal/10 p-4" role="note">
          <p className="mb-1 font-bold text-teal-2">💡 רמז עזר</p>
          <p>{mystery.hint}</p>
        </div>
      )}

      <form onSubmit={submit} className={`card p-4 ${shake ? 'anim-shake' : ''}`} onAnimationEnd={() => setShake(false)}>
        <label htmlFor="code" className="mb-2 block font-bold">הקוד הסופי</label>
        <div className="flex gap-2">
          <input
            id="code"
            className="input text-center text-2xl font-extrabold tracking-[.5em]"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={4}
            value={code}
            placeholder="····"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-describedby="code-help"
          />
          <button className="btn btn-gold shrink-0" disabled={code.length !== 4}>פתיחה</button>
        </div>
        <p id="code-help" className="mt-2 text-sm text-dim">
          ניסיונות: {attempt.codeTries} · קוד שגוי מוריד {WRONG_CODE_COST} נקודות
        </p>
        {feedback && <p role="alert" className="mt-2 font-bold text-coral">✗ {feedback}</p>}
      </form>

      {!attempt.hintUsed && (
        <button className="btn btn-ghost w-full" onClick={() => setConfirmHint(true)}>💡 רמז סופי (−{HINT_COST} נקודות)</button>
      )}
      <Modal open={confirmHint} title="להשתמש ברמז הסופי?" onClose={() => setConfirmHint(false)}>
        <p className="mb-4 text-mist">הרמז יעזור לפצח את הקוד, ויורידו {HINT_COST} נקודות (הניקוד לא יורד מתחת לאפס).</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirmHint(false)} data-autofocus>ביטול</button>
          <button className="btn btn-gold flex-1" onClick={() => { dispatch({ type: 'USE_HINT', now: Date.now() }); setConfirmHint(false); play('clue') }}>כן, תנו רמז</button>
        </div>
      </Modal>
    </section>
  )
}
