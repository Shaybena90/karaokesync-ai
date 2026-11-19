import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PACKS } from '../content'
import { CATEGORY_LABEL, LEVEL_LABEL } from '../content/labels'
import type { OptionId, Question } from '../content/types'
import { seededShuffle } from '../engine/rng'
import { listMistakes, recordPractice, type Mistake } from '../storage/repo'
import { play } from '../ui/audio'
import { ErrorBox, Loading } from '../ui/kit'

/** Look a question up in any shipped pack (mistakes may come from an older version). */
function findQuestion(id: string): Question | undefined {
  for (const p of Object.values(PACKS)) {
    const q = p.questions.find((x) => x.id === id)
    if (q) return q
  }
  return undefined
}

/** "ההזדמנות לתקן" — practice mode, separate from daily scoring. */
export function Fix() {
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'open' | 'fixed'>('open')
  const [practice, setPractice] = useState<string | null>(null)

  const load = () => listMistakes().then(setMistakes).catch(() => setError(true))
  useEffect(() => {
    void load()
  }, [])

  if (error) return <ErrorBox title="לא הצלחנו לטעון" text="נסו לרענן את הדף." />
  if (!mistakes) return <Loading />

  const known = mistakes.filter((m) => findQuestion(m.questionId)).sort((a, b) => b.lastWrongAt - a.lastWrongAt)
  const open = known.filter((m) => !m.fixedAt)
  const fixed = known.filter((m) => m.fixedAt)
  const list = tab === 'open' ? open : fixed

  if (practice) {
    return (
      <Practice
        questionId={practice}
        onDone={async (nextId) => {
          await load()
          setPractice(nextId)
        }}
        nextAfter={(id) => open.find((m) => m.questionId !== id)?.questionId ?? null}
      />
    )
  }

  return (
    <div className="space-y-3 py-2">
      <h1 className="title-gold text-3xl">ההזדמנות לתקן</h1>
      <p className="text-mist">כאן נאספות שאלות שטעיתם בהן. זה אימון נפרד — לא משפיע על הניקוד היומי.</p>
      <div role="tablist" aria-label="סינון" className="flex gap-2">
        <button role="tab" aria-selected={tab === 'open'} className={`btn ${tab === 'open' ? 'btn-gold' : 'btn-ghost'} flex-1`} onClick={() => setTab('open')}>לתיקון ({open.length})</button>
        <button role="tab" aria-selected={tab === 'fixed'} className={`btn ${tab === 'fixed' ? 'btn-gold' : 'btn-ghost'} flex-1`} onClick={() => setTab('fixed')}>תוקנו ({fixed.length})</button>
      </div>
      {tab === 'open' && open.length > 0 && (
        <button className="btn btn-gold w-full" onClick={() => setPractice(open[0].questionId)}>להתחיל לתקן</button>
      )}
      {list.length === 0 ? (
        <div className="card p-6 text-center text-mist">
          {tab === 'open' ? (known.length ? 'תיקנתם הכול — כל הכבוד! 🎉' : 'עדיין אין טעויות לתקן. שחקו בכספת ונחזור לכאן.') : 'עוד לא תיקנתם שאלות.'}
          {!known.length && <div className="mt-3"><Link to="/" className="btn btn-ghost">לכספת של היום</Link></div>}
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const q = findQuestion(m.questionId)!
            return (
              <li key={m.questionId} className="card p-4">
                <p className="text-xs text-dim">{CATEGORY_LABEL[q.category]} · {LEVEL_LABEL[q.level]} · טעיתם {m.timesWrong} פעמים · ניסיונות תיקון: {m.practiceTries}</p>
                <p className="font-bold">{q.text}</p>
                {m.fixedAt ? (
                  <p className="mt-1 text-sm text-teal-2">✓ תוקן · {q.options.find((o) => o.id === q.answerId)!.text}</p>
                ) : (
                  <button className="btn btn-ghost mt-2 !min-h-10" onClick={() => setPractice(m.questionId)}>לנסות שוב</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Practice({ questionId, onDone, nextAfter }: { questionId: string; onDone: (next: string | null) => void; nextAfter: (id: string) => string | null }) {
  const q = findQuestion(questionId)!
  const [picked, setPicked] = useState<OptionId | null>(null)
  const order = useMemo(() => seededShuffle(q.options.map((o) => o.id), `practice|${questionId}|${Date.now() >> 16}`), [q, questionId])
  const correct = picked === q.answerId

  const pick = async (id: OptionId) => {
    if (picked) return
    setPicked(id)
    play(id === q.answerId ? 'correct' : 'wrong')
    await recordPractice(questionId, id === q.answerId)
  }

  return (
    <section className="anim-rise py-2" aria-labelledby="pq">
      <p className="mb-2 text-sm text-dim">אימון · {CATEGORY_LABEL[q.category]}</p>
      <div className="card p-5">
        <h1 id="pq" className="mb-4 text-xl font-extrabold">{q.text}</h1>
        <div className="grid gap-2.5">
          {order.map((id) => {
            const opt = q.options.find((o) => o.id === id)!
            const isC = id === q.answerId
            const cls = !picked ? 'border-white/15 bg-white/5 hover:border-gold/60' : isC ? 'border-teal bg-teal/20' : id === picked ? 'border-coral bg-coral/15' : 'border-white/10 opacity-60'
            return (
              <button key={id} disabled={!!picked} onClick={() => pick(id)} className={`min-h-14 rounded-2xl border-2 px-4 py-3 text-right text-lg font-bold ${cls}`}>
                {opt.text} {picked && isC && <span className="text-sm text-teal-2"> ✓ התשובה הנכונה</span>}
                {picked && !isC && id === picked && <span className="text-sm text-coral"> ✗ הבחירה שלך</span>}
              </button>
            )
          })}
        </div>
        {picked && (
          <div className="anim-rise mt-4 rounded-2xl bg-black/25 p-4" aria-live="polite">
            <p className={`text-lg font-extrabold ${correct ? 'text-teal-2' : 'text-coral'}`}>{correct ? '✓ תוקן!' : '✗ עוד לא — אפשר לנסות שוב אחר כך'}</p>
            <p className="text-mist">{q.explanation}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => onDone(null)}>לרשימה</button>
              {nextAfter(questionId) && <button className="btn btn-gold flex-1" onClick={() => onDone(nextAfter(questionId))} autoFocus>לשאלה הבאה</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
