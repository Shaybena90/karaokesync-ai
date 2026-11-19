import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { getActiveAttempt } from '../storage/repo'

const CHECK_EVERY_MS = 30 * 60 * 1000

/**
 * Update policy:
 * - The app checks for a new version on start, every 30 minutes and whenever
 *   the tab comes back to the foreground.
 * - A new version installs itself automatically — but only when no game is in
 *   progress and the player is not on the game screen. During a game it waits
 *   and shows a short note; it updates as soon as the game ends.
 * - Older content packs stay in the bundle, so a game always finishes on the
 *   content version it started with.
 */
export function UpdateBanner() {
  const { pathname } = useLocation()
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (!navigator.onLine || registration.installing) return
        registration.update().catch(() => {})
      }
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
  const [busy, setBusy] = useState(false)
  const [updating, setUpdating] = useState(false)
  const inGame = pathname.startsWith('/play')

  useEffect(() => {
    if (!needRefresh || updating) return
    let alive = true
    const tryUpdate = async () => {
      const active = await getActiveAttempt().catch(() => undefined)
      if (!alive) return
      setBusy(!!active || inGame)
      if (!active && !inGame) {
        setUpdating(true)
        // Give the note a moment to show, then switch to the new version.
        window.setTimeout(() => void updateServiceWorker(true), 900)
      }
    }
    void tryUpdate()
    const id = window.setInterval(tryUpdate, 5000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [needRefresh, inGame, updating, updateServiceWorker])

  useEffect(() => {
    if (!offlineReady) return
    const id = window.setTimeout(() => setOfflineReady(false), 5000)
    return () => window.clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (updating)
    return (
      <div role="status" className="mx-4 mb-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold-2">
        ✨ מעדכנים לגרסה החדשה…
      </div>
    )
  if (needRefresh && busy && !inGame)
    return (
      <div role="status" className="mx-4 mb-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm">
        יש גרסה חדשה. היא תותקן לבד אחרי שתסיימו את המשחק הפתוח.
      </div>
    )
  if (offlineReady)
    return (
      <div role="status" className="mx-4 mb-2 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2 text-sm text-teal-2">
        ✓ המשחק מוכן לשימוש גם בלי חיבור לרשת
      </div>
    )
  return null
}
