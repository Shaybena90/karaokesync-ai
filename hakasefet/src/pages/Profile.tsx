import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AVATARS } from '../content/labels'
import { rankInfo } from '../engine/rewards'
import { formatDuration } from '../engine/date'
import { listRuns, resetAll, updateProfile, type Run } from '../storage/repo'
import { useApp } from '../state/AppState'
import { play } from '../ui/audio'
import { Loading, Modal, Toast } from '../ui/kit'

export function Profile() {
  const { profile, setProfile, prefs, setPrefs } = useApp()
  const nav = useNavigate()
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    listRuns().then(setRuns).catch(() => setRuns([]))
  }, [])

  if (!profile || !runs) return <Loading />
  const best = runs.length ? Math.min(...runs.map((r) => r.timeMs)) : 0
  const rooms = new Set(runs.map((r) => r.roomId)).size
  const coopRuns = runs.filter((r) => r.mode === 'coop').length
  const starsTotal = runs.reduce((a, r) => a + r.stars, 0)
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
      <h1 className="title-gold text-3xl">פרופיל והגדרות</h1>
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
            ['בריחות', String(runs.length)],
            ['חדרים שפוצחו', `${rooms}/3`],
            ['בריחה הכי מהירה', runs.length ? formatDuration(best) : '—'],
            ['כוכבים', String(starsTotal)],
            ['בריחות עם חברים', String(coopRuns)],
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
        <fieldset className="rounded-xl bg-black/20 p-3">
          <legend className="px-1 font-bold">איכות גרפיקה</legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ['ultra', 'אולטרה 4K', 'רזולוציה מלאה, צללים חדים, החלקת קצוות'],
              ['high', 'גבוהה', 'תלת־ממד עם צללים וזוהר'],
              ['normal', 'רגילה', 'תלת־ממד קל, חוסך סוללה'],
              ['2d', 'דו־ממד', 'תצוגה שטוחה, הכי חסכוני'],
            ] as const).map(([v, label, desc]) => (
              <button key={v} role="radio" aria-checked={prefs.graphics === v} onClick={() => setPrefs({ ...prefs, graphics: v })} className={`rounded-xl border-2 p-2 text-right ${prefs.graphics === v ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/5'}`}>
                <span className="block font-bold">{label}</span>
                <span className="block text-xs text-dim">{desc}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="about">
        <h2 id="about" className="font-extrabold">על הגרסה</h2>
        <p className="text-sm text-mist">החדרים והפתרונות שמורים במכשיר כדי שאפשר יהיה לשחק לבד גם בלי רשת. לכן הזמנים כאן הם שיאים אישיים, ולא טבלת תחרות מאומתת. משחק עם חברים דורש חיבור לאינטרנט.</p>
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
