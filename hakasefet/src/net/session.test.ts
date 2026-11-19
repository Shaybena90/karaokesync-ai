import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameSession } from './session'
import type { NetMsg, NetStatus, PlayerMeta, Transport, TransportHandlers } from './transport'
import type { GameState } from '../escape/engine'

/** In-memory "Realtime": delivers messages to everyone else, with presence. */
class Hub {
  members = new Map<string, { meta: PlayerMeta; h: TransportHandlers }>()
  online = true
  players() {
    return [...this.members.values()].map((m) => m.meta)
  }
  sync() {
    for (const m of this.members.values()) m.h.onPlayers(this.players())
  }
  transport(): Transport & { drop(): void } {
    let myId = ''
    return {
      connect: async (_code, me, h) => {
        myId = me.id
        this.members.set(me.id, { meta: me, h })
        h.onStatus('online' as NetStatus)
        this.sync()
      },
      send: (m: NetMsg) => {
        if (!this.online) return
        for (const [id, mem] of this.members) if (id !== myId) queueMicrotask(() => mem.h.onMessage(structuredClone(m)))
      },
      updateMe: (patch) => {
        const m = this.members.get(myId)!
        m.meta = { ...m.meta, ...patch }
        this.sync()
      },
      disconnect: () => {
        this.members.delete(myId)
        this.sync()
      },
      drop: () => {
        this.members.delete(myId)
        this.sync()
      },
    }
  }
}

const meta = (id: string, joinedAt: number): PlayerMeta => ({ id, nick: id, avatar: '🦊', joinedAt })
const flush = () => vi.advanceTimersByTimeAsync(0)

function memBackup() {
  let saved: GameState | undefined
  return { load: () => saved, save: (s: GameState) => (saved = structuredClone(s)), get: () => saved }
}

afterEach(() => vi.useRealTimers())

describe('co-op session', () => {
  it('a joiner receives the lobby, the host starts, actions from anyone apply once for everyone', async () => {
    vi.useFakeTimers()
    const hub = new Hub()
    const host = new GameSession({ code: 'ABCDE', me: meta('host', 1), transport: hub.transport(), roomId: 'lab', electionDelayMs: 10 })
    await host.connect()
    await vi.advanceTimersByTimeAsync(20)
    const guest = new GameSession({ code: 'ABCDE', me: meta('guest', 2), transport: hub.transport(), electionDelayMs: 10 })
    await guest.connect()
    await flush()
    expect(guest.snapshot().state?.roomId).toBe('lab')
    expect(guest.snapshot().isHost).toBe(false)
    expect(host.snapshot().isHost).toBe(true)
    expect(host.snapshot().players.map((p) => p.id)).toEqual(['host', 'guest'])

    expect(await host.dispatch({ type: 'START' })).toBe('ok')
    await flush()
    expect(guest.snapshot().state?.phase).toBe('playing')

    const r = guest.dispatch({ type: 'SOLVE', hotspot: 'drawer', input: '745' })
    await flush()
    await flush()
    expect(await r).toBe('ok')
    expect(host.snapshot().state?.flags).toContain('solved:drawer')
    expect(guest.snapshot().state?.flags).toContain('solved:drawer')

    const wrong = guest.dispatch({ type: 'SOLVE', hotspot: 'vault', input: '0000' })
    await flush()
    await flush()
    expect(await wrong).toBe('wrong')
    expect(guest.snapshot().state?.log.at(-1)?.text).toContain('קוד שגוי')
  })

  it('when the host leaves, the next player takes over with the latest state', async () => {
    vi.useFakeTimers()
    const hub = new Hub()
    const hostT = hub.transport()
    const host = new GameSession({ code: 'X', me: meta('host', 1), transport: hostT, roomId: 'lab', electionDelayMs: 10 })
    await host.connect()
    await vi.advanceTimersByTimeAsync(20)
    const guest = new GameSession({ code: 'X', me: meta('guest', 2), transport: hub.transport(), electionDelayMs: 10 })
    await guest.connect()
    await flush()
    await host.dispatch({ type: 'START' })
    await host.dispatch({ type: 'SOLVE', hotspot: 'drawer', input: '745' })
    await flush()

    hostT.drop()
    await vi.advanceTimersByTimeAsync(20)
    expect(guest.snapshot().isHost).toBe(true)
    // the new host applies its own actions directly
    expect(await guest.dispatch({ type: 'TAKE', hotspot: 'drawer' })).toBe('ok')
    expect(guest.snapshot().state?.inventory).toContain('uv')
  })

  it('a refreshed player gets the current state back; an older copy never overwrites a newer one', async () => {
    vi.useFakeTimers()
    const hub = new Hub()
    const backup = memBackup()
    const host = new GameSession({ code: 'Y', me: meta('host', 1), transport: hub.transport(), roomId: 'lab', electionDelayMs: 10 })
    await host.connect()
    await vi.advanceTimersByTimeAsync(20)
    const guestT = hub.transport()
    const guest = new GameSession({ code: 'Y', me: meta('guest', 2), transport: guestT, backup, electionDelayMs: 10 })
    await guest.connect()
    await flush()
    await host.dispatch({ type: 'START' })
    await flush()
    const stale = structuredClone(backup.get()!)
    guestT.drop()
    await host.dispatch({ type: 'SOLVE', hotspot: 'drawer', input: '745' })

    // the guest comes back (refresh) with an older backup
    const again = new GameSession({ code: 'Y', me: meta('guest', 3), transport: hub.transport(), backup: { load: () => stale, save: () => {} }, electionDelayMs: 10 })
    await again.connect()
    await flush()
    await flush()
    expect(again.snapshot().state?.flags).toContain('solved:drawer')
  })

  it('an action sent while the host is unreachable is resent and still applied once', async () => {
    vi.useFakeTimers()
    const hub = new Hub()
    const host = new GameSession({ code: 'Z', me: meta('host', 1), transport: hub.transport(), roomId: 'lab', electionDelayMs: 10, resendMs: 100 })
    await host.connect()
    await vi.advanceTimersByTimeAsync(20)
    const guest = new GameSession({ code: 'Z', me: meta('guest', 2), transport: hub.transport(), electionDelayMs: 10, resendMs: 100 })
    await guest.connect()
    await flush()
    await host.dispatch({ type: 'START' })
    await flush()
    hub.online = false
    const p = guest.dispatch({ type: 'SOLVE', hotspot: 'drawer', input: '745' })
    await vi.advanceTimersByTimeAsync(150)
    hub.online = true
    await vi.advanceTimersByTimeAsync(150)
    expect(await p).toBe('ok')
    expect(host.snapshot().state?.log.filter((l) => l.text.includes('מגירה')).length).toBe(1)
  })

  it('caps the room at four players', async () => {
    vi.useFakeTimers()
    const hub = new Hub()
    const s: GameSession[] = []
    for (let i = 0; i < 5; i++) {
      const g = new GameSession({ code: 'F', me: meta(`p${i}`, i), transport: hub.transport(), roomId: i === 0 ? 'lab' : undefined, electionDelayMs: 10 })
      await g.connect()
      s.push(g)
    }
    await flush()
    expect(s.slice(0, 4).every((g) => !g.isFull())).toBe(true)
    expect(s[4].isFull()).toBe(true)
  })
})
