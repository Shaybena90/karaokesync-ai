import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { levelOf, LEVELS, type GameState } from '../../escape/engine'
import type { RoomDef } from '../../escape/types'
import { formatDuration } from '../../engine/date'
import { rankInfo } from '../../engine/rewards'
import { completeRun, runIdOf, type RunResult } from '../../storage/repo'
import { useApp } from '../../state/AppState'
import { Coin, Confetti } from '../art'
import { play } from '../audio'
import { Toast } from '../kit'
import { Vault3D } from '../Vault3D'

export function EscapeResult({ room, state, code, mode, players, onAgain }: { room: RoomDef; state: GameState; code: string; mode: 'solo' | 'coop'; players: number; onAgain?: () => void }) {
  const { reload } = useApp()
  const [res, setRes] = useState<RunResult | null>(null)
  const [error, setError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // when the clipboard is blocked, show the text to copy by hand
  const [manual, setManual] = useState<string | null>(null)

  useEffect(() => {
    completeRun({ runId: runIdOf(code, state), state, mode, players })
      .then(async (r) => {
        setRes(r)
        await reload()
        const leveled = rankInfo(r.profile.xp).rank > rankInfo(r.prevXp).rank
        window.setTimeout(() => play(leveled ? 'rank' : 'unlock'), 1800)
      })
      .catch(() => setError(true))
  }, [code, state, mode, players, reload])

  const timeMs = res?.run.timeMs ?? 0
  const collection = !!room.puzzles
  const text = res && collection ? `סיימתי את חדר הבריחה ״${room.title}״ עם ${res.run.points} נקודות${res.run.runMode === 'practice' ? ' (אימון)' : ''} 🔐 בלי ספוילרים — נסו בעצמכם!` : res ? `ברחנו מ״${room.title}״ ברמה ${LEVELS[levelOf(state)].label} ב־${formatDuration(timeMs)} ${'⭐'.repeat(res.run.stars)} — תצליחו מהר יותר? 🔐` : ''

  async function share() {
    const url = new URL('.', location.href.split('#')[0]).href
    try {
      if (navigator.share) {
        await navigator.share({ title: 'הכספת', text, url })
        setToast('נשלח!')
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setToast('הטקסט הועתק')
    } catch {
      setManual(`${text}\n${url}`)
    }
  }

  const xp = res?.grants.reduce((a, g) => a + g.xp, 0) ?? 0
  const coins = res?.grants.reduce((a, g) => a + g.coins, 0) ?? 0
  return (
    <div className="relative mx-auto max-w-xl">
      <Confetti />
      <section className="card card-hero relative overflow-hidden p-6 text-center" aria-labelledby="esc-title">
        <Vault3D open className="-mt-4 h-64 w-full" label="הכספת נפתחה" />
        <h1 id="esc-title" className="title-gold text-4xl sm:text-5xl">ברחתם!</h1>
        <p className="text-mist">{room.emoji} {room.title}{!collection && ` · רמה ${LEVELS[levelOf(state)].label}`}{mode === 'coop' && ` · ${players} שחקנים`}</p>
        {error && <p role="alert" className="mt-3 text-coral">לא הצלחנו לשמור את התוצאה במכשיר.</p>}
        {res && collection && (
          <>
            <p className="mt-3 font-mono text-5xl font-extrabold text-gold-2" data-testid="score">{res.run.points}<span className="text-lg text-dim"> / 1000</span></p>
            {res.run.runMode && <p className="text-sm font-bold text-teal-2">{res.run.runMode === 'practice' ? '🧘 מצב אימון — נשמר בנפרד מהאתגר' : room.loop ? '⏳ לולאה בזמן אמת' : '⏱ אתגר מתוזמן'}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">זמן</dt><dd className="text-xl font-extrabold" data-testid="escape-time">{formatDuration(res.run.timeMs)}</dd></div>
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">רמזים</dt><dd className="text-xl font-extrabold">{res.run.hintTiers ?? 0}</dd></div>
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">ניסיונות שגויים</dt><dd className="text-xl font-extrabold">{res.run.wrongAttempts}</dd></div>
              {res.run.loops !== undefined && <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">לולאות</dt><dd className="text-xl font-extrabold">{res.run.loops}</dd></div>}
            </dl>
            {res.grants.some((g) => g.kind === 'first-room') ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2" data-testid="rewards">
                <span className="chip anim-pop">🏅 פרס סיום ראשון: {room.emoji} {room.title}</span>
                <span className="chip anim-pop">+{xp} XP</span>
                <span className="chip anim-pop"><Coin /> +{coins} מטבעות</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-dim">את פרס הסיום הראשון על החדר הזה כבר קיבלתם.{res.grants.length > 0 && ` הבונוס היומי: +${xp} XP.`}</p>
            )}
          </>
        )}
        {res && !collection && (
          <>
            <p className="mt-3 text-4xl" aria-label={`${res.run.stars} כוכבים`}>{'⭐'.repeat(res.run.stars)}{'☆'.repeat(3 - res.run.stars)}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-right">
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">זמן</dt><dd className="text-xl font-extrabold" data-testid="escape-time">{formatDuration(res.run.timeMs)}</dd></div>
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">רמזים</dt><dd className="text-xl font-extrabold">{res.run.hints}</dd></div>
              <div className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-dim">ניסיונות שגויים</dt><dd className="text-xl font-extrabold">{res.run.wrongAttempts}</dd></div>
            </dl>
            {res.isBest && <p className="mt-3 font-bold text-teal-2">🏅 שיא אישי לחדר הזה ברמה הזאת{res.prevBestMs !== undefined && ` (קודם: ${formatDuration(res.prevBestMs)})`}</p>}
            {res.grants.length > 0 ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2" data-testid="rewards">
                <span className="chip anim-pop">+{xp} XP</span>
                <span className="chip anim-pop"><Coin /> +{coins} מטבעות</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-dim">כבר קיבלתם היום את הפרסים על החדר הזה.</p>
            )}
            {rankInfo(res.profile.xp).rank > rankInfo(res.prevXp).rank && <p className="anim-pop mt-3 rounded-xl border border-gold/50 bg-gold/15 p-3 font-extrabold text-gold">⭐ עליתם לדרגה {rankInfo(res.profile.xp).rank}!</p>}
          </>
        )}
      </section>
      {collection && (
        <details className="card mt-4 p-4" data-testid="explanations">
          <summary className="cursor-pointer font-bold">🧩 הסבר הפתרון — שלב אחר שלב</summary>
          <ol className="mt-3 space-y-3">
            {room.puzzles!.map((p, i) => (
              <li key={p.id} className="rounded-xl bg-black/25 p-3">
                <p className="font-bold">{i + 1}. {p.name}: <span className="text-gold">{p.solution}</span></p>
                <p className="mt-1 text-sm text-mist">{p.explanation}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {manual && (
        <div className="card mt-3 p-3">
          <label htmlFor="share-text" className="mb-1 block text-sm text-mist">ההעתקה נחסמה — סמנו והעתיקו ידנית:</label>
          <textarea id="share-text" readOnly className="w-full rounded-lg border border-white/15 bg-black/40 p-2" rows={3} value={manual} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button className="btn btn-gold" onClick={share} disabled={!res}>שיתוף</button>
        {onAgain && <button className="btn btn-ghost" onClick={onAgain}>לשחק שוב</button>}
        <Link to={collection ? '/escape' : '/rooms'} className="btn btn-ghost">{collection ? 'לחדרי הבריחה' : 'לחדרים'}</Link>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
