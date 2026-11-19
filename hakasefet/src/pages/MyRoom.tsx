import { useState } from 'react'
import { ROOM_ITEMS, SLOT_LABEL, type RoomItem } from '../content/room-items'
import { buyOrEquip, unequip } from '../storage/repo'
import { useApp } from '../state/AppState'
import { Coin } from '../ui/art'
import { play } from '../ui/audio'
import { Loading, Toast } from '../ui/kit'
import { RoomScene } from '../ui/RoomScene'

export function MyRoom() {
  const { profile, setProfile } = useApp()
  const [preview, setPreview] = useState<RoomItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!profile) return <Loading />

  const equipped = preview ? { ...profile.equipped, [preview.slot]: preview.id } : profile.equipped

  async function buy(item: RoomItem) {
    setError(null)
    const r = await buyOrEquip(item.id, item.slot, item.price).catch(() => null)
    if (!r) return setError('לא הצלחנו לשמור. נסו שוב.')
    if (!r.ok) return setError(r.reason === 'coins' ? `חסרים ${item.price - profile!.coins} מטבעות. פתחו כספות יומיות כדי לצבור עוד.` : 'אין פרופיל')
    setProfile(r.profile)
    setPreview(null)
    play(r.charged ? 'coin' : 'tap')
    setToast(r.charged ? `${item.name} נקנה ונכנס לחדר!` : `${item.name} בשימוש`)
  }

  async function remove(item: RoomItem) {
    setProfile(await unequip(item.slot))
    setToast(`${item.name} הוסר מהחדר`)
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="title-gold text-3xl">החדר שלי</h1>
        <span className="chip"><Coin /> {profile.coins}</span>
      </div>
      <div className="card overflow-hidden p-2">
        <RoomScene equipped={equipped} avatar={profile.avatar} className="w-full rounded-xl" />
        {preview && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3" role="status">
            <p>תצוגה מקדימה: <b>{preview.name}</b></p>
            <div className="flex gap-2">
              <button className="btn btn-ghost !min-h-10" onClick={() => setPreview(null)}>ביטול</button>
              <button className="btn btn-gold !min-h-10" disabled={profile.coins < preview.price} onClick={() => buy(preview)}>
                קנייה · {preview.price} <Coin />
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-coral">{error}</p>}
      <p className="text-sm text-dim">לחיצה על פריט שלא קניתם מציגה אותו בחדר. פריט שקניתם נשאר שלכם — בחירה חוזרת בו לא עולה מטבעות.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ROOM_ITEMS.map((item) => {
          const owned = profile.owned.includes(item.id)
          const inUse = profile.equipped[item.slot] === item.id
          const removable = inUse && item.slot !== 'wall' && item.slot !== 'floor'
          return (
            <li key={item.id} className={`card flex flex-col gap-2 p-3 ${preview?.id === item.id ? 'border-gold' : ''}`}>
              <span className="text-3xl" aria-hidden="true">{item.emoji}</span>
              <span className="font-bold leading-tight">{item.name}</span>
              <span className="text-xs text-dim">{SLOT_LABEL[item.slot]}</span>
              {inUse ? (
                removable ? (
                  <button className="btn btn-ghost !min-h-10 !text-sm" onClick={() => remove(item)} aria-label={`הסרה: ${item.name}`}>✓ בשימוש · הסרה</button>
                ) : (
                  <span className="btn btn-ghost !min-h-10 !text-sm pointer-events-none">✓ בשימוש</span>
                )
              ) : owned ? (
                <button className="btn btn-ghost !min-h-10 !text-sm" onClick={() => buy(item)} aria-label={`בחירה: ${item.name}`}>בחירה</button>
              ) : (
                <button className="btn btn-gold !min-h-10 !text-sm" onClick={() => setPreview(item)} aria-label={`תצוגה מקדימה וקנייה: ${item.name}, ${item.price} מטבעות`}>
                  {item.price} <Coin size={14} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
