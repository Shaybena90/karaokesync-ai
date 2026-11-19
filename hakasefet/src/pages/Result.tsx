import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getPack } from '../content'
import { CATEGORY_LABEL, LEVEL_LABEL } from '../content/labels'
import type { Attempt } from '../engine/attempt'
import { challengeUrl } from '../engine/challenge'
import { addDays, formatDuration } from '../engine/date'
import { rankInfo } from '../engine/rewards'
import { mysteryForDate } from '../engine/selection'
import { shareChallenge, shareText } from '../engine/share'
import { completeAttempt, getAttempt, type CompletionResult } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Coin, Confetti, Vault } from '../ui/art'
import { play } from '../ui/audio'
import { ErrorBox, Loading, Toast } from '../ui/kit'

/** The app's own address without the #route — works on any host and sub-path. */
export function appBaseUrl(): string {
  return new URL('.', location.href.split('#')[0]).href
}

export function Result() {
  const { id } = useParams()
  const { state } = useLocation() as { state?: { fresh?: boolean } }
  const { reload } = useApp()
  const [data, setData] = useState<{ attempt: Attempt; result: CompletionResult } | null | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const fresh = !!state?.fresh

  useEffect(() => {
    if (!id) return
    getAttempt(id)
      .then(async (attempt) => {
        if (!attempt || attempt.phase !== 'solved') return setData(null)
        // Idempotent: returns the stored result if this attempt was already recorded.
        const result = await completeAttempt(attempt)
        await reload()
        setData({ attempt, result })
      })
      .catch(() => setData(null))
  }, [id, reload])

  useEffect(() => {
    if (!data || !fresh) return
    const leveled = rankInfo(data.result.profile.xp).rank > rankInfo(data.result.prevXp).rank
    const t = window.setTimeout(() => play(leveled ? 'rank' : data.result.grants.length ? 'coin' : 'tap'), 2300)
    return () => window.clearTimeout(t)
  }, [data, fresh])

  if (data === undefined) return <Loading />
  if (data === null) return <ErrorBox title="לא מצאנו את התוצאה" text="ייתכן שהנתונים אופסו במכשיר הזה." action={<Link className="btn btn-gold" to="/">לדף הבית</Link>} />

  const { attempt, result } = data
  const pack = getPack(attempt.contentVersion)!
  const mystery = pack.mysteries.find((m) => m.id === attempt.mysteryId)!
  const s = result.summary
  const xpGained = result.grants.reduce((a, g) => a + g.xp, 0)
  const coinsGained = result.grants.reduce((a, g) => a + g.coins, 0)
  const weekly = result.grants.find((g) => g.kind === 'weekly')
  const prevRank = rankInfo(result.prevXp).rank
  const newRank = rankInfo(result.profile.xp).rank
  const text = shareText({ durationMs: s.durationMs, score: s.score })
  const url = challengeUrl({ version: attempt.contentVersion, date: attempt.vaultDate, level: attempt.level!, order: attempt.roomOrder }, appBaseUrl())
  const nextDate = addDays(attempt.vaultDate, 1)
  const showNext = mystery.next && mysteryForDate(pack, nextDate).id === mystery.next.mysteryId

  async function share() {
    const outcome = await shareChallenge(text, url)
    if (outcome === 'shared') setToast('האתגר נשלח!')
    else if (outcome === 'copied') setToast('הטקסט והקישור הועתקו')
    else if (outcome === 'failed') setManual(`${text}\n${url}`)
  }

  return (
    <div className="relative mx-auto max-w-xl py-4">
      {fresh && <Confetti />}
      <section className="card relative overflow-hidden p-6 text-center" aria-labelledby="res-title">
        <div className="flex justify-center"><Vault size={170} opening label="הכספת נפתחה" /></div>
        <h1 id="res-title" className="title-gold mt-2 text-3xl font-extrabold">הכספת נפתחה!</h1>
        <p className="text-mist">{mystery.emoji} {mystery.title} · {LEVEL_LABEL[attempt.level!]}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-right sm:grid-cols-3">
          <Stat label="ניקוד" value={String(s.score)} testId="final-score" />
          <Stat label="זמן משחק" value={formatDuration(s.durationMs)} />
          <Stat label="דיוק" value={`${s.correct}/${s.total}`} />
          <Stat label="ניסיונות קוד" value={String(s.codeTries)} />
          <Stat label="רמז סופי" value={s.hintUsed ? 'נעזרתם' : 'בלי רמז'} />
          <Stat label="חצי־חצי" value={s.fiftyUsed ? 'נוצל' : 'לא נוצל'} />
        </dl>
        {result.isBest && <p className="mt-3 font-bold text-teal-2">🏅 שיא אישי חדש לכספת הזאת{result.prevBest !== undefined ? ` (קודם: ${result.prevBest})` : ''}</p>}
      </section>

      <section className="card mt-4 p-5" aria-labelledby="sol-title">
        <h2 id="sol-title" className="mb-2 text-xl font-extrabold">🔓 איך נפתח הקוד <span dir="ltr" className="text-gold">{mystery.code}</span></h2>
        <ol className="mb-3 space-y-1 text-sm text-mist">
          {mystery.readingOrder.map((c, i) => <li key={c}>{i + 1}. {CATEGORY_LABEL[c]} — {mystery.clues[c].title}</li>)}
        </ol>
        <p>{mystery.explanation}</p>
      </section>

      <section className="card mt-4 p-5" aria-labelledby="prize-title">
        <h2 id="prize-title" className="mb-3 text-xl font-extrabold">🎁 פרסים</h2>
        <div className="flex items-center gap-3 rounded-xl bg-black/25 p-3">
          <span className="text-4xl anim-pop" aria-hidden="true">{mystery.prize.emoji}</span>
          <div>
            <p className="font-bold">{mystery.prize.title}</p>
            <p className="text-sm text-dim">נאסף לאוסף התעלומות שלכם</p>
          </div>
        </div>
        {result.grants.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2" data-testid="rewards">
            <span className="chip anim-pop">+{xpGained} XP</span>
            <span className="chip anim-pop"><Coin /> +{coinsGained} מטבעות</span>
            {weekly && <span className="chip anim-pop border-teal/60 text-teal-2">בונוס שבועי +{weekly.coins}</span>}
          </div>
        ) : (
          <p className="mt-3 text-sm text-mist">{attempt.mode === 'daily' ? 'הפרס היומי של הכספת הזאת כבר התקבל — זה היה משחק אימון.' : 'משחק אימון — בלי פרס יומי.'}</p>
        )}
        {newRank > prevRank && (
          <div className="anim-pop mt-3 rounded-xl border border-gold/50 bg-gold/15 p-3 text-center" role="status">
            <p className="text-2xl" aria-hidden="true">⭐</p>
            <p className="font-extrabold text-gold">עליתם לדרגה {newRank}!</p>
          </div>
        )}
      </section>

      <section className="card mt-4 p-5" aria-labelledby="share-title">
        <h2 id="share-title" className="mb-2 text-xl font-extrabold">🔐 אתגרו חבר</h2>
        <p className="mb-1 rounded-xl bg-black/25 p-3" data-testid="share-text">{text}</p>
        <p className="mb-3 text-xs text-dim">הקישור פותח את אותה כספת, באותה רמה ובאותו סדר חדרים — בלי תשובות ובלי פרטים אישיים.</p>
        <button className="btn btn-gold w-full" onClick={share}>שיתוף האתגר</button>
        {manual && (
          <div className="mt-3">
            <label htmlFor="manual" className="mb-1 block text-sm text-coral">לא הצלחנו לשתף או להעתיק אוטומטית. סמנו והעתיקו:</label>
            <textarea id="manual" readOnly className="input h-28 text-sm" value={manual} onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
        <input type="hidden" data-testid="share-url" value={url} />
      </section>

      {showNext && (
        <p className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4 text-center text-gold-2">🔮 {mystery.next!.teaser}</p>
      )}

      <div className="mt-4 flex gap-2">
        <Link to="/" className="btn btn-ghost flex-1">לדף הבית</Link>
        <Link to="/archive" className="btn btn-ghost flex-1">לארכיון</Link>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="text-xl font-extrabold" data-testid={testId}>{value}</dd>
    </div>
  )
}
