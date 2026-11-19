import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { israelDate } from '../engine/date'
import { getProfile, type Profile } from '../storage/repo'
import { loadPrefs, savePrefs, type Prefs } from '../storage/prefs'
import { setSoundEnabled } from '../ui/audio'

interface AppState {
  status: 'loading' | 'ready' | 'error'
  profile?: Profile
  prefs: Prefs
  today: string
  setPrefs: (p: Prefs) => void
  setProfile: (p: Profile | undefined) => void
  reload: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppState['status']>('loading')
  const [profile, setProfile] = useState<Profile | undefined>()
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [today, setToday] = useState(() => israelDate())

  const reload = useCallback(async () => {
    try {
      setProfile(await getProfile())
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Keep "today" fresh across Israel midnight and when the tab comes back.
  useEffect(() => {
    const tick = () => setToday(israelDate())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  useEffect(() => {
    setSoundEnabled(prefs.sound)
    document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion)
  }, [prefs])

  const setPrefs = useCallback((p: Prefs) => {
    savePrefs(p)
    setPrefsState(p)
  }, [])

  const value = useMemo(() => ({ status, profile, prefs, today, setPrefs, setProfile, reload }), [status, profile, prefs, today, setPrefs, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}
