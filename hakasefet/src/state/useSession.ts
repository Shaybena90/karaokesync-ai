import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../escape/engine'
import { GameSession, type SessionSnapshot } from '../net/session'
import { NullTransport, type Transport } from '../net/transport'
import { playerId } from '../net/config'
import { useApp } from './AppState'

export function backupFor(code: string) {
  const key = `hakasefet:game:${code}`
  return {
    load(): GameState | undefined {
      try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as GameState) : undefined
      } catch {
        return undefined
      }
    },
    save(s: GameState) {
      try {
        localStorage.setItem(key, JSON.stringify(s))
      } catch {
        /* ignore */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

/** Connects a GameSession for the lifetime of the component. */
export function useSession(p: { code: string; roomId?: string; transport: () => Transport | null; solo?: boolean }) {
  const { profile } = useApp()
  const [snap, setSnap] = useState<SessionSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<GameSession | null>(null)

  useEffect(() => {
    if (!profile) return
    const transport = p.solo ? new NullTransport() : p.transport()
    if (!transport) {
      setError('no-network')
      return
    }
    const s = new GameSession({
      code: p.code,
      roomId: p.roomId,
      me: { id: playerId(), nick: profile.nickname, avatar: profile.avatar, joinedAt: Date.now() },
      transport,
      backup: backupFor(p.code),
      electionDelayMs: p.solo ? 0 : 1500,
    })
    ref.current = s
    const unsub = s.subscribe(setSnap)
    s.connect().catch(() => setError('connect'))
    return () => {
      unsub()
      s.leave()
      ref.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.code, p.solo, profile?.nickname, profile?.avatar])

  return { snap, session: ref.current, error }
}
