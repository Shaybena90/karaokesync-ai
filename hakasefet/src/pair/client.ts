import { useEffect, useRef, useState } from 'react'
import type { ClientMsg, PairError, ServerMsg } from './protocol'

type StateMsg = Extract<ServerMsg, { t: 'state' }>

/** Where the pair server lives: VITE_PAIR_SERVER_URL, or port 8787 on the same host. */
export function pairServerUrl(): string {
  const env = import.meta.env.VITE_PAIR_SERVER_URL as string | undefined
  if (env) return env
  const secure = location.protocol === 'https:'
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8787`
}

const tokenKey = (code: string) => `hakasefet:pair:${code}`
export function savedToken(code: string): string | null {
  try {
    return localStorage.getItem(tokenKey(code))
  } catch {
    return null
  }
}
function saveToken(code: string, token: string) {
  try {
    localStorage.setItem(tokenKey(code), token)
  } catch {
    /* ignore */
  }
}

export type PairStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

/**
 * One connection to the pair server. `intent` says how to enter: create a new
 * session, or join / resume one by code (a saved token resumes the same role).
 * Reconnects by itself with back-off; the role is kept through the token.
 */
export function usePair(intent: { create: true } | { code: string }) {
  const [status, setStatus] = useState<PairStatus>('connecting')
  const [state, setState] = useState<StateMsg | null>(null)
  const [error, setError] = useState<PairError | null>(null)
  const [code, setCode] = useState<string | null>('code' in intent ? intent.code : null)
  const [offset, setOffset] = useState(0)
  const ws = useRef<WebSocket | null>(null)
  const pending = useRef(new Map<string, (o: 'ok' | 'wrong' | 'invalid' | 'timeout') => void>())
  const codeRef = useRef(code)
  codeRef.current = code

  useEffect(() => {
    let stop = false
    let tries = 0
    let timer = 0
    const connect = () => {
      if (stop) return
      const sock = new WebSocket(pairServerUrl())
      ws.current = sock
      sock.onopen = () => {
        tries = 0
        setStatus('online')
        const c = codeRef.current
        const token = c ? savedToken(c) : null
        const first: ClientMsg = c ? (token ? { t: 'resume', code: c, token } : { t: 'join', code: c }) : { t: 'create' }
        sock.send(JSON.stringify(first))
      }
      sock.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as ServerMsg
        if (m.t === 'joined') {
          saveToken(m.code, m.token)
          setCode(m.code)
          codeRef.current = m.code
          setError(null)
        } else if (m.t === 'state') {
          setState(m)
          setOffset(m.serverNow - Date.now())
        } else if (m.t === 'result') {
          pending.current.get(m.id)?.(m.outcome)
          pending.current.delete(m.id)
        } else if (m.t === 'error') {
          setError(m.error)
          if (m.error !== 'bad-message') stop = true
        }
      }
      sock.onclose = () => {
        for (const [, done] of pending.current) done('timeout')
        pending.current.clear()
        if (stop) return setStatus((s) => (s === 'online' ? 'offline' : s))
        setStatus('reconnecting')
        timer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** tries++))
      }
    }
    connect()
    return () => {
      stop = true
      window.clearTimeout(timer)
      ws.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendMsg = (m: ClientMsg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }
  return {
    status,
    state,
    error,
    code,
    serverNow: () => Date.now() + offset,
    ready: (ready: boolean) => sendMsg({ t: 'ready', ready }),
    /** Every action carries a unique id, so a resend after a reconnect is applied once. */
    act(type: 'answer' | 'hint' | 'exit', stage: number, value?: string): Promise<'ok' | 'wrong' | 'invalid' | 'timeout'> {
      const id = crypto.randomUUID()
      return new Promise((resolve) => {
        if (ws.current?.readyState !== WebSocket.OPEN) return resolve('timeout')
        pending.current.set(id, resolve)
        sendMsg({ t: 'act', id, type, stage, value })
        window.setTimeout(() => {
          if (pending.current.has(id)) {
            pending.current.delete(id)
            resolve('timeout')
          }
        }, 8000)
      })
    },
  }
}
