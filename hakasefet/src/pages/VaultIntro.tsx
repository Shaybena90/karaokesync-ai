import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CURRENT_VERSION, getPack } from '../content'
import { CATEGORY_LABEL, LEVEL_LABEL, TAGLINE } from '../content/labels'
import type { Category, Level } from '../content/types'
import type { Attempt } from '../engine/attempt'
import { addDays, formatHebDate, isValidDate } from '../engine/date'
import { mysteryForDate } from '../engine/selection'
import { abandonActive, getActiveAttempt } from '../storage/repo'
import { useApp } from '../state/AppState'
import { startAttempt } from '../state/game'
import { RoomIcon } from '../ui/art'
import { Vault3D } from '../ui/Vault3D'
import { play } from '../ui/audio'
import { ErrorBox, Loading, Modal, TiltCard } from '../ui/kit'

export const ARCHIVE_DAYS = 7

/**
 * Mystery intro ("מתחילים לפצח"). Used for today's vault, archive vaults and
 * challenge links (which also fix the level and the room order).
 */
export function VaultIntro({ challenge }: { challenge?: { version: string; date: string; level: Level; order: Category[] } }) {
  const { today } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const date = challenge?.date ?? params.get('d') ?? today
  const version = challenge?.version ?? CURRENT_VERSION
  const [active, setActive] = useState<Attempt | undefined | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getActiveAttempt().then(setActive).catch(() => setActive(undefined))
  }, [])

  const pack = getPack(version)
  const oldest = addDays(today, -ARCHIVE_DAYS)
  if (!pack) return null
  if (!isValidDate(date) || date > today || (!challenge && date < oldest))
    return <ErrorBox title="הכספת הזאת לא זמינה" text="אפשר לשחק בכספת של היום או בכספות של השבוע האחרון." action={<Link className="btn btn-gold" to="/">לכספת של היום</Link>} />
  if (active === null) return <Loading />

  const mystery = mysteryForDate(pack, date)
  const isToday = date === today
  const mode = isToday ? 'daily' : challenge ? 'challenge' : 'archive'
  const sameActive = active && active.vaultDate === date && active.contentVersion === version && !challenge

  async function begin() {
    play('tap')
    try {
      if (active && !sameActive) await abandonActive()
      await startAttempt({ version, date, mode, level: challenge?.level, fixedRoomOrder: challenge?.order })
      nav('/play')
    } catch {
      setError('לא הצלחנו להתחיל את המשחק. נסו שוב.')
    }
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <TiltCard className="card-hero anim-rise overflow-hidden p-6 text-center" max={3}>
        {challenge && <p className="mb-2 inline-block rounded-full bg-teal/15 px-3 py-1 text-sm font-bold text-teal-2">🎯 קיבלתם אתגר מחבר</p>}
        <p className="text-sm font-bold text-gold">{isToday ? 'הכספת של היום' : `כספת מ־${formatHebDate(date)}`}</p>
        <Vault3D className="-my-2 h-64 w-full" />
        <h1 className="title-gold text-4xl">{mystery.emoji} {mystery.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed text-mist">{mystery.teaser}</p>
        {challenge && (
          <div className="mt-4 rounded-xl bg-black/25 p-3 text-sm">
            <p className="mb-2">רמה: <b>{LEVEL_LABEL[challenge.level]}</b> · המסלול של החבר:</p>
            <ol className="flex items-center justify-center gap-3">
              {challenge.order.map((c, i) => (
                <li key={c} className="flex flex-col items-center gap-1">
                  <RoomIcon category={c} size={40} />
                  <span>{i + 1}. {CATEGORY_LABEL[c]}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-dim">התוצאה שבהודעה נשלחה על ידי החבר ואינה מאומתת.</p>
          </div>
        )}
        {mode !== 'daily' && <p className="mt-3 text-sm text-dim">זהו משחק אימון — הוא יכול לשפר שיא אישי, אבל לא נותן פרס יומי.</p>}
        {error && <p role="alert" className="mt-3 text-coral">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          {sameActive ? (
            <Link to="/play" className="btn btn-gold">המשך המשחק השמור</Link>
          ) : (
            <button className="btn btn-gold text-lg" onClick={() => (active ? setConfirm(true) : begin())}>מתחילים לפצח</button>
          )}
          <p className="text-sm text-dim">{TAGLINE}</p>
        </div>
      </TiltCard>
      <Modal open={confirm} title="יש משחק פתוח" onClose={() => setConfirm(false)}>
        <p className="mb-4 text-mist">התחלת כספת חדשה תסגור את המשחק השמור, וההתקדמות בו לא תישמר.</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setConfirm(false)} data-autofocus>ביטול</button>
          <button className="btn btn-gold flex-1" onClick={begin}>להתחיל חדש</button>
        </div>
      </Modal>
    </div>
  )
}
