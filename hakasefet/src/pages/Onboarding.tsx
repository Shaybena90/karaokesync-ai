import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AVATARS, TAGLINE } from '../content/labels'
import { createProfile } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Vault } from '../ui/art'
import { play } from '../ui/audio'

export function Onboarding() {
  const { setProfile } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'who' | 'how'>('who')
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const trimmed = nickname.trim()

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      const p = await createProfile(trimmed, avatar)
      setProfile(p)
      play('unlock')
      const next = params.get('next')
      nav(next && next.startsWith('/') ? next : '/', { replace: true })
    } catch {
      setError('לא הצלחנו לשמור במכשיר. ייתכן שהדפדפן במצב פרטי שחוסם שמירה.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="anim-float"><Vault size={130} /></div>
        <h1 className="title-gold mt-3 text-4xl font-extrabold">ברוכים הבאים להכספת</h1>
        <p className="mt-2 text-lg text-mist">{TAGLINE}</p>
      </div>

      {step === 'who' ? (
        <form
          className="card space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (trimmed.length >= 2) setStep('how')
          }}
        >
          <div>
            <label htmlFor="nick" className="mb-2 block font-bold">איך לקרוא לך?</label>
            <input id="nick" className="input" value={nickname} maxLength={16} autoComplete="nickname" placeholder="כינוי (2–16 תווים)" onChange={(e) => setNickname(e.target.value)} />
            {nickname.length > 0 && trimmed.length < 2 && <p className="mt-1 text-sm text-coral">צריך לפחות שני תווים</p>}
          </div>
          <fieldset>
            <legend className="mb-2 font-bold">בחרו אווטאר</legend>
            <div className="grid grid-cols-5 gap-2">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-pressed={avatar === a}
                  aria-label={`אווטאר ${a}`}
                  onClick={() => setAvatar(a)}
                  className={`grid aspect-square place-items-center rounded-2xl border-2 text-3xl transition ${avatar === a ? 'border-gold bg-gold/15 scale-105' : 'border-white/10 bg-white/5 hover:border-white/30'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-gold w-full" disabled={trimmed.length < 2}>ממשיכים</button>
          <p className="text-center text-sm text-dim">משחקים כאורח — בלי הרשמה. אפשר לשנות כינוי ואווטאר בפרופיל.</p>
        </form>
      ) : (
        <div className="card anim-rise space-y-4 p-5">
          <h2 className="text-2xl font-extrabold">איך משחקים?</h2>
          <ol className="space-y-3 text-mist">
            <li><b className="text-white">1. </b>בכל יום נפתחת כספת חדשה עם תעלומה.</li>
            <li><b className="text-white">2. </b>עוברים בשלושה חדרים — ספורט, מוזיקה וידע כללי — ועונים על שתי שאלות בכל חדר.</li>
            <li><b className="text-white">3. </b>בסוף כל חדר מקבלים רמז. גם אם טעיתם.</li>
            <li><b className="text-white">4. </b>מחברים את שלושת הרמזים לקוד בן ארבע ספרות ופותחים את הכספת.</li>
          </ol>
          <div className="rounded-xl border border-gold/30 bg-black/30 p-4">
            <p className="mb-2 font-bold text-gold">דוגמה קטנה</p>
            <p className="text-mist">רמז 1 נותן <b className="text-white">5</b>, רמז 2 נותן <b className="text-white">6</b>, ורמז 3 נותן <b className="text-white">60</b>.</p>
            <p className="text-mist">ההוראה: ״חברו לפי מספרי הרמזים״ → הקוד הוא <b className="text-teal-2" dir="ltr">5660</b>.</p>
          </div>
          {error && <p role="alert" className="text-coral">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setStep('who')}>חזרה</button>
            <button className="btn btn-gold flex-1" onClick={finish} disabled={saving}>{saving ? 'שומר…' : 'יאללה, לכספת!'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
