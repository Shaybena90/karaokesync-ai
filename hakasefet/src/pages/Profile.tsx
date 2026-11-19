import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AVATARS } from '../content/labels'
import { rankInfo } from '../engine/rewards'
import { formatDuration } from '../engine/date'
import { listHistory, listLedger, listMistakes, resetAll, updateProfile, type HistoryEntry } from '../storage/repo'
import { useApp } from '../state/AppState'
import { play } from '../ui/audio'
import { Loading, Modal, Toast } from '../ui/kit'

export function Profile() {
  const { profile, setProfile, prefs, setPrefs } = useApp()
  const nav = useNavigate()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [stats, setStats] = useState<{ history: HistoryEntry[]; days: number; fixed: number; mistakes: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listHistory(), listLedger(), listMistakes()])
      .then(([history, ledger, mistakes]) => setStats({ history, days: ledger.filter((l) => l.kind === 'daily').length, fixed: mistakes.filter((m) => m.fixedAt).length, mistakes: mistakes.length }))
      .catch(() => setStats({ history: [], days: 0, fixed: 0, mistakes: 0 }))
  }, [])

  if (!profile || !stats) return <Loading />
  const h = stats.history
  const correct = h.reduce((s, x) => s + x.correct, 0)
  const total = h.reduce((s, x) => s + x.total, 0)
  const best = h.reduce((m, x) => Math.max(m, x.score), 0)
  const fastest = h.length ? Math.min(...h.map((x) => x.durationMs)) : 0
  const trimmed = nickname.trim()

  async function saveNick(e: React.FormEvent) {
    e.preventDefault()
    if (trimmed.length < 2) return
    setProfile(await updateProfile({ nickname: trimmed }))
    setToast('הכינוי נשמר')
  }

  async function pickAvatar(a: string) {
    setProfile(await updateProfile({ avatar: a }))
    play('tap')
  }

  async function reset() {
    await resetAll()
    setConfirm(false)
    setProfile(undefined)
    nav('/welcome', { replace: true })
  }

  return (
    <div className="space-y-4 py-2">
      <h1 className="text-2xl font-extrabold">👤 פרופיל והגדרות</h1>
      <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-mist">💾 ההתקדמות נשמרת במכשיר הזה.</p>

      <section className="card space-y-4 p-4" aria-labelledby="me">
        <h2 id="me" className="font-extrabold">כינוי ואווטאר</h2>
        <form onSubmit={saveNick} className="flex gap-2">
          <label htmlFor="pnick" className="sr-only">כינוי</label>
          <input id="pnick" className="input" maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <button className="btn btn-gold shrink-0" disabled={trimmed.length < 2 || trimmed === profile.nickname}>שמירה</button>
        </form>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="אווטאר">
          {AVATARS.map((a) => (
            <button key={a} aria-pressed={profile.avatar === a} aria-label={`אווטאר ${a}`} onClick={() => pickAvatar(a)} className={`grid aspect-square place-items-center rounded-2xl border-2 text-3xl ${profile.avatar === a ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/5'}`}>
              {a}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-4" aria-labelledby="st">
        <h2 id="st" className="mb-3 font-extrabold">סטטיסטיקה</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ['דרגה', `${rankInfo(profile.xp).rank} (${profile.xp} XP)`],
            ['כספות שנפתחו', String(h.length)],
            ['ימי כספת יומית', String(stats.days)],
            ['דיוק כולל', total ? `${Math.round((correct / total) * 100)}%` : '—'],
            ['ניקוד שיא', h.length ? String(best) : '—'],
            ['הפיצוח המהיר', h.length ? formatDuration(fastest) : '—'],
            ['שאלות שתוקנו', `${stats.fixed}/${stats.mistakes}`],
            ['מטבעות', String(profile.coins)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-black/25 p-3">
              <dt className="text-xs text-dim">{k}</dt>
              <dd className="text-lg font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="set">
        <h2 id="set" className="font-extrabold">הגדרות</h2>
        <Toggle label="צלילים" checked={prefs.sound} onChange={(v) => { setPrefs({ ...prefs, sound: v }); if (v) play('tap') }} />
        <Toggle label="הפחתת אנימציות" checked={prefs.reducedMotion} onChange={(v) => setPrefs({ ...prefs, reducedMotion: v })} />
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="about">
        <h2 id="about" className="font-extrabold">על הגרסה</h2>
        <p className="text-sm text-mist">השאלות והתשובות שמורות במכשיר כדי שאפשר יהיה לשחק גם בלי רשת. לכן התוצאות כאן הן שיאים אישיים בלבד, ולא תחרות מאומתת.</p>
      </section>

      <section className="card p-4" aria-labelledby="danger">
        <h2 id="danger" className="mb-2 font-extrabold text-coral">איפוס נתונים</h2>
        <p className="mb-3 text-sm text-mist">מוחק מהמכשיר את הפרופיל, ההתקדמות, המטבעות והחדר.</p>
        <button className="btn btn-danger w-full" onClick={() => setConfirm(true)}>איפוס כל הנתונים</button>
      </section>

      <Modal open={confirm} title="למחוק את כל הנתונים?" onClose={() => setConfirm(false)}>
        <p className="mb-4 text-mist">הפעולה תמחק את כל ההתקדמות במכשיר הזה — דרגה, מטבעות, פריטים, שיאים וטעויות לתיקון. אי אפשר לבטל אותה.</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirm(false)} data-autofocus>ביטול</button>
          <button className="btn btn-danger flex-1" onClick={reset}>כן, למחוק הכול</button>
        </div>
      </Modal>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center justify-between rounded-xl bg-black/20 px-4">
      <span className="font-bold">{label}</span>
      <span className={`flex items-center gap-2 text-sm ${checked ? 'text-teal-2' : 'text-dim'}`}>
        {checked ? 'פועל' : 'כבוי'}
        <span className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-teal' : 'bg-white/20'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'right-1' : 'right-6'}`} />
        </span>
      </span>
    </button>
  )
}
