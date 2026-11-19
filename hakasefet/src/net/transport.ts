import type { Action, GameState } from '../escape/engine'

export interface PlayerMeta {
  id: string
  nick: string
  avatar: string
  /** When this player joined the channel — the earliest present player is the host. */
  joinedAt: number
  /** Which scene the player is looking at (for "who is where"). */
  scene?: string
}

export type NetMsg =
  | { t: 'hello'; from: string }
  | { t: 'state'; from: string; state: GameState; hostNow: number }
  | { t: 'action'; from: string; action: Action }

export type NetStatus = 'connecting' | 'online' | 'reconnecting'

export interface TransportHandlers {
  onMessage(m: NetMsg): void
  /** Everyone currently present, including me. */
  onPlayers(p: PlayerMeta[]): void
  onStatus(s: NetStatus): void
}

export interface Transport {
  connect(code: string, me: PlayerMeta, h: TransportHandlers): Promise<void>
  send(m: NetMsg): void
  updateMe(patch: Partial<PlayerMeta>): void
  disconnect(): void
}

/** Solo play: a channel with only me in it. */
export class NullTransport implements Transport {
  private me?: PlayerMeta
  private h?: TransportHandlers
  async connect(_code: string, me: PlayerMeta, h: TransportHandlers) {
    this.me = me
    this.h = h
    h.onStatus('online')
    h.onPlayers([me])
  }
  send() {}
  updateMe(patch: Partial<PlayerMeta>) {
    if (!this.me) return
    this.me = { ...this.me, ...patch }
    this.h?.onPlayers([this.me])
  }
  disconnect() {}
}

/**
 * Same-browser transport over BroadcastChannel (tabs of one browser).
 * Used for local testing and the automated co-op tests; presence by heartbeat.
 */
export class LocalTransport implements Transport {
  private ch?: BroadcastChannel
  private me?: PlayerMeta
  private h?: TransportHandlers
  private peers = new Map<string, { meta: PlayerMeta; seen: number }>()
  private timer = 0

  async connect(code: string, me: PlayerMeta, h: TransportHandlers) {
    this.me = me
    this.h = h
    this.ch = new BroadcastChannel(`hakasefet-coop-${code}`)
    this.ch.onmessage = (e) => {
      const d = e.data as { k: 'beat'; meta: PlayerMeta } | { k: 'bye'; id: string } | { k: 'msg'; m: NetMsg }
      if (d.k === 'beat') {
        const isNew = !this.peers.has(d.meta.id)
        this.peers.set(d.meta.id, { meta: d.meta, seen: Date.now() })
        if (isNew) this.beat()
        this.emitPlayers()
      } else if (d.k === 'bye') {
        this.peers.delete(d.id)
        this.emitPlayers()
      } else h.onMessage(d.m)
    }
    h.onStatus('online')
    this.beat()
    this.emitPlayers()
    this.timer = window.setInterval(() => {
      this.beat()
      const now = Date.now()
      let changed = false
      for (const [id, p] of this.peers) {
        if (now - p.seen > 4000) {
          this.peers.delete(id)
          changed = true
        }
      }
      if (changed) this.emitPlayers()
    }, 1000)
  }
  private beat() {
    this.ch?.postMessage({ k: 'beat', meta: this.me })
  }
  private emitPlayers() {
    this.h?.onPlayers([this.me!, ...[...this.peers.values()].map((p) => p.meta)])
  }
  send(m: NetMsg) {
    this.ch?.postMessage({ k: 'msg', m })
  }
  updateMe(patch: Partial<PlayerMeta>) {
    this.me = { ...this.me!, ...patch }
    this.beat()
    this.emitPlayers()
  }
  disconnect() {
    window.clearInterval(this.timer)
    this.ch?.postMessage({ k: 'bye', id: this.me?.id })
    this.ch?.close()
    this.ch = undefined
  }
}
