import { newGame, reduce, type Action, type GameState, type Outcome } from '../escape/engine'
import { getRoom } from '../escape/rooms'
import type { NetMsg, NetStatus, PlayerMeta, Transport } from './transport'

/**
 * A game session — solo or co-op — with one authoritative copy of the state.
 *
 * Co-op is host-authoritative: the earliest player still present is the host.
 * Others send their actions to the host; the host applies them with the pure
 * engine and broadcasts the new state. Actions carry unique ids and the engine
 * applies each id once, so resending after a disconnect is safe. If the host
 * leaves, the next player takes over with the latest state it has; a player
 * who refreshes gets the state back from the others (or from its own backup).
 */
export type SessionOutcome = Outcome | 'timeout'

export interface SessionSnapshot {
  state: GameState | null
  players: PlayerMeta[]
  status: NetStatus
  isHost: boolean
  hostId?: string
  me: PlayerMeta
  clockOffset: number
}

export interface Backup {
  load(): GameState | undefined
  save(s: GameState): void
}

interface Pending {
  action: Action
  resolve: (o: SessionOutcome) => void
  tries: number
  timer: ReturnType<typeof setTimeout>
}

export const MAX_PLAYERS = 4

export interface SessionOptions {
    code: string
    me: PlayerMeta
    transport: Transport
    /** Creator only: the room to set up. Joiners learn it from the host. */
    roomId?: string
    backup?: Backup
    now?: () => number
    /** How long a new host waits for someone else's state before using its own. */
    electionDelayMs?: number
    resendMs?: number
}

export class GameSession {
  private state: GameState | null
  private players: PlayerMeta[] = []
  private status: NetStatus = 'connecting'
  private hostId?: string
  private clockOffset = 0
  private listeners = new Set<(s: SessionSnapshot) => void>()
  private pending = new Map<string, Pending>()
  private electionTimer?: ReturnType<typeof setTimeout>
  private me: PlayerMeta

  private opts: SessionOptions

  constructor(opts: SessionOptions) {
    this.opts = opts
    this.me = opts.me
    const saved = opts.backup?.load()
    this.state = saved ?? (opts.roomId && getRoom(opts.roomId) ? newGame(getRoom(opts.roomId)!) : null)
  }

  private now() {
    return (this.opts.now ?? Date.now)()
  }

  subscribe(fn: (s: SessionSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => this.listeners.delete(fn)
  }

  snapshot(): SessionSnapshot {
    return { state: this.state, players: this.players, status: this.status, isHost: this.hostId === this.me.id, hostId: this.hostId, me: this.me, clockOffset: this.clockOffset }
  }

  private emit() {
    const s = this.snapshot()
    for (const l of this.listeners) l(s)
  }

  async connect() {
    await this.opts.transport.connect(this.opts.code, this.me, {
      onMessage: (m) => this.onMessage(m),
      onPlayers: (p) => this.onPlayers(p),
      onStatus: (s) => {
        this.status = s
        if (s === 'online') this.opts.transport.send({ t: 'hello', from: this.me.id })
        this.emit()
      },
    })
  }

  /** Present players in join order (host first), capped at MAX_PLAYERS. */
  private onPlayers(list: PlayerMeta[]) {
    const uniq = new Map(list.map((p) => [p.id, p]))
    this.players = [...uniq.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))
    const prevHost = this.hostId
    this.hostId = this.players[0]?.id
    if (this.hostId !== prevHost) this.onHostChange()
    this.emit()
  }

  isFull(): boolean {
    return this.players.findIndex((p) => p.id === this.me.id) >= MAX_PLAYERS
  }

  private onHostChange() {
    if (this.electionTimer) clearTimeout(this.electionTimer)
    if (this.hostId === this.me.id) {
      // Wait briefly: someone may hold a newer state than mine.
      this.electionTimer = setTimeout(() => {
        if (this.hostId !== this.me.id || !this.state) return
        this.broadcastState()
        // Apply my own unanswered actions now that I am the host.
        for (const p of this.pending.values()) this.applyAsHost(p.action)
      }, this.opts.electionDelayMs ?? 1200)
    } else {
      // Resend anything still waiting to the new host.
      for (const p of this.pending.values()) this.opts.transport.send({ t: 'action', from: this.me.id, action: p.action })
    }
  }

  private onMessage(m: NetMsg) {
    if (m.from === this.me.id) return
    if (m.t === 'hello') {
      if (this.hostId === this.me.id && this.state) this.broadcastState()
      return
    }
    if (m.t === 'state') {
      if (this.state && m.state.seq < this.state.seq && this.state.roomId === m.state.roomId) return
      this.state = m.state
      this.clockOffset = m.hostNow - this.now()
      this.opts.backup?.save(m.state)
      this.settlePending()
      this.emit()
      return
    }
    if (m.t === 'action' && this.hostId === this.me.id) this.applyAsHost(m.action)
  }

  private applyAsHost(action: Action): Outcome {
    if (!this.state) return 'invalid'
    const room = getRoom(this.state.roomId)
    if (!room) return 'invalid'
    const { state, outcome } = reduce(room, this.state, action)
    if (state !== this.state) {
      this.state = state
      this.opts.backup?.save(state)
      this.broadcastState()
    }
    this.settlePending()
    this.emit()
    return outcome
  }

  private broadcastState() {
    if (!this.state) return
    this.opts.transport.send({ t: 'state', from: this.me.id, state: this.state, hostNow: this.now() })
  }

  private settlePending() {
    if (!this.state) return
    for (const [id, p] of this.pending) {
      const r = this.state.results[id]
      if (r) {
        clearTimeout(p.timer)
        this.pending.delete(id)
        p.resolve(r)
      }
    }
  }

  /** Perform an action. Resolves with how it went once the host has applied it. */
  dispatch(partial: Omit<Action, 'id' | 'by' | 'now'> & Record<string, unknown>): Promise<SessionOutcome> {
    const action = {
      ...partial,
      id: `${this.me.id}-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      by: { nick: this.me.nick, avatar: this.me.avatar },
      now: this.now() + this.clockOffset,
    } as Action
    if (this.hostId === this.me.id) return Promise.resolve(this.applyAsHost(action))
    return new Promise((resolve) => {
      const resendMs = this.opts.resendMs ?? 2000
      const send = () => this.opts.transport.send({ t: 'action', from: this.me.id, action })
      const tick = () => {
        const p = this.pending.get(action.id)
        if (!p) return
        if (++p.tries >= 4) {
          this.pending.delete(action.id)
          resolve('timeout')
          return
        }
        send()
        p.timer = setTimeout(tick, resendMs)
      }
      this.pending.set(action.id, { action, resolve, tries: 0, timer: setTimeout(tick, resendMs) })
      send()
    })
  }

  /** Server-aligned "now" for timers. */
  hostNow(): number {
    return this.now() + this.clockOffset
  }

  setScene(scene: string) {
    this.me = { ...this.me, scene }
    this.opts.transport.updateMe({ scene })
  }

  leave() {
    if (this.electionTimer) clearTimeout(this.electionTimer)
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
    this.opts.transport.disconnect()
    this.listeners.clear()
  }
}
