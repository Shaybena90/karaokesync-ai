import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getActiveAttempt } from '../storage/repo'

/**
 * Update policy: a new version is downloaded in the background but only
 * applied when the player agrees AND no game is in progress. Content packs of
 * older versions stay in the bundle, so an attempt always finishes on the
 * content version it started with.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!needRefresh) return
    let alive = true
    const check = () => getActiveAttempt().then((a) => alive && setBusy(!!a)).catch(() => {})
    check()
    const id = window.setInterval(check, 5000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [needRefresh])

  useEffect(() => {
    if (!offlineReady) return
    const id = window.setTimeout(() => setOfflineReady(false), 5000)
    return () => window.clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (offlineReady)
    return (
      <div role="status" className="mx-4 mb-2 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2 text-sm text-teal-2">
        ✓ המשחק מוכן לשימוש גם בלי חיבור לרשת
      </div>
    )
  if (!needRefresh) return null
  return (
    <div role="status" className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm">
      {busy ? <span>יש גרסה חדשה. היא תותקן אחרי שתסיימו את המשחק הפתוח.</span> : <span>יש גרסה חדשה של המשחק.</span>}
      <div className="flex gap-2">
        {!busy && (
          <button className="btn btn-gold !min-h-9 !px-4 !text-sm" onClick={() => updateServiceWorker(true)}>
            לעדכן עכשיו
          </button>
        )}
        <button className="btn btn-ghost !min-h-9 !px-4 !text-sm" onClick={() => setNeedRefresh(false)}>
          אחר כך
        </button>
      </div>
    </div>
  )
}
