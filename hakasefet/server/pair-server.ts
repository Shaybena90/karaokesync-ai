/**
 * Realtime service for the two-player room "שני צדדים של הדלת".
 *
 *   npm run pair-server            (PAIR_PORT, default 8787)
 *
 * The server holds every session in memory and is the only authority:
 * it hands out roles and tokens, starts the shared timer when both are ready,
 * checks answers (src/pair/logic.ts), applies each action id once, and sends
 * each player only the view for their own role.
 */
import { createServer } from 'node:http'
import { randomBytes, randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { newPairState, pairReduce, viewFor, type PairState, type Role } from '../src/pair/logic.ts'
import { IDLE_TTL_MS, SESSION_TTL_MS, type ClientMsg, type PairError, type ServerMsg } from '../src/pair/protocol.ts'

interface Seat {
  token: string
  socket: WebSocket | null
  ready: boolean
}
interface Session {
  code: string
  createdAt: number
  lastSeen: number
  seats: Partial<Record<Role, Seat>>
  state: PairState
}

const PORT = Number(process.env.PAIR_PORT ?? 8787)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const sessions = new Map<string, Session>()
const expired = new Set<string>()

function newCode(): string {
  for (;;) {
    const c = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
    if (!sessions.has(c) && !expired.has(c)) return c
  }
}

const send = (ws: WebSocket | null | undefined, m: ServerMsg) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
}

function phase(s: Session): 'waiting' | 'playing' | 'done' {
  return s.state.finishedAt !== undefined ? 'done' : s.state.startedAt !== undefined ? 'playing' : 'waiting'
}

function broadcast(s: Session) {
  const now = Date.now()
  const peers = {
    A: { connected: !!s.seats.A?.socket, ready: !!s.seats.A?.ready, taken: !!s.seats.A },
    B: { connected: !!s.seats.B?.socket, ready: !!s.seats.B?.ready, taken: !!s.seats.B },
  }
  for (const role of ['A', 'B'] as const) {
    const seat = s.seats[role]
    if (seat?.socket) send(seat.socket, { t: 'state', code: s.code, role, phase: phase(s), serverNow: now, expiresAt: s.createdAt + SESSION_TTL_MS, peers, view: viewFor(s.state, role) })
  }
}

function sweep() {
  const now = Date.now()
  for (const [code, s] of sessions) {
    const nobody = !s.seats.A?.socket && !s.seats.B?.socket
    if (now - s.createdAt > SESSION_TTL_MS || (nobody && now - s.lastSeen > IDLE_TTL_MS)) {
      for (const seat of Object.values(s.seats)) seat?.socket?.close(4000, 'expired')
      sessions.delete(code)
      expired.add(code)
    }
  }
}
setInterval(sweep, 60_000).unref()

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})
const wss = new WebSocketServer({ server: http, maxPayload: 4096 })

wss.on('connection', (ws) => {
  let session: Session | null = null
  let role: Role | null = null
  const fail = (error: PairError) => send(ws, { t: 'error', error })

  const seat = (s: Session, r: Role, token: string) => {
    const prev = s.seats[r]?.socket
    if (prev && prev !== ws) prev.close(4001, 'replaced') // the same player on a new connection
    s.seats[r] = { token, socket: ws, ready: s.seats[r]?.ready ?? false }
    s.lastSeen = Date.now()
    session = s
    role = r
    send(ws, { t: 'joined', code: s.code, role: r, token })
    broadcast(s)
  }

  ws.on('message', (raw) => {
    let m: ClientMsg
    try {
      m = JSON.parse(String(raw)) as ClientMsg
    } catch {
      return fail('bad-message')
    }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return fail('bad-message')
    sweep()

    if (m.t === 'create') {
      const s: Session = { code: newCode(), createdAt: Date.now(), lastSeen: Date.now(), seats: {}, state: newPairState() }
      sessions.set(s.code, s)
      return seat(s, 'A', randomBytes(16).toString('hex'))
    }
    if (m.t === 'join' || m.t === 'resume') {
      const code = String(m.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
      const s = sessions.get(code)
      if (!s) return fail(expired.has(code) ? 'expired' : 'not-found')
      if (m.t === 'resume') {
        const r = (['A', 'B'] as const).find((x) => s.seats[x]?.token === m.token)
        return r ? seat(s, r, m.token) : fail('bad-token')
      }
      if (s.seats.B) return fail('full')
      return seat(s, 'B', randomBytes(16).toString('hex'))
    }
    if (!session || !role) return fail('bad-message')
    const s = session
    s.lastSeen = Date.now()

    if (m.t === 'ready') {
      const st = s.seats[role]
      if (!st || s.state.startedAt !== undefined) return
      st.ready = !!m.ready
      if (s.seats.A?.ready && s.seats.B?.ready) s.state = { ...s.state, startedAt: Date.now(), log: [{ at: Date.now(), role: null, text: 'שניכם מוכנים — השעון התחיל!', kind: 'info' }] }
      return broadcast(s)
    }
    if (m.t === 'act') {
      if (typeof m.id !== 'string' || m.id.length > 64 || typeof m.stage !== 'number') return fail('bad-message')
      const action = m.type === 'answer' ? { id: m.id, role, type: 'answer' as const, stage: m.stage, value: String(m.value ?? '').slice(0, 40) } : m.type === 'hint' ? { id: m.id, role, type: 'hint' as const, stage: m.stage } : m.type === 'exit' ? { id: m.id, role, type: 'exit' as const, stage: m.stage } : null
      if (!action) return fail('bad-message')
      const r = pairReduce(s.state, action, Date.now())
      s.state = r.state
      send(ws, { t: 'result', id: m.id, outcome: r.outcome })
      return broadcast(s)
    }
    fail('bad-message')
  })

  ws.on('close', () => {
    const s = session as Session | null
    if (!s || !role) return
    const st = s.seats[role]
    if (st && st.socket === ws) {
      st.socket = null
      s.lastSeen = Date.now()
      broadcast(s) // the other player sees "disconnected"
    }
  })
})

http.listen(PORT, () => console.log(`pair server listening on :${PORT}`))
