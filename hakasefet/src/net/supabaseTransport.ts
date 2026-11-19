import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { NetMsg, PlayerMeta, Transport, TransportHandlers } from './transport'

/**
 * Online co-op over Supabase Realtime: one broadcast channel per room code,
 * presence for the player list. Only the public URL + anon key are used —
 * no tables, no server code. supabase-js is loaded lazily.
 */
export class SupabaseTransport implements Transport {
  private client?: SupabaseClient
  private channel?: RealtimeChannel
  private me?: PlayerMeta

  private url: string
  private anonKey: string

  constructor(url: string, anonKey: string) {
    this.url = url
    this.anonKey = anonKey
  }

  async connect(code: string, me: PlayerMeta, h: TransportHandlers) {
    this.me = me
    const { createClient } = await import('@supabase/supabase-js')
    this.client = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
    const channel = this.client.channel(`hakasefet:${code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
    })
    this.channel = channel
    channel.on('broadcast', { event: 'msg' }, ({ payload }) => h.onMessage(payload as NetMsg))
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PlayerMeta>()
      const players = Object.values(state)
        .map((arr) => arr[arr.length - 1])
        .filter(Boolean) as PlayerMeta[]
      if (!players.some((p) => p.id === me.id)) players.push(this.me!)
      h.onPlayers(players)
    })
    h.onStatus('connecting')
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(this.me!)
        h.onStatus('online')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        h.onStatus('reconnecting')
      }
    })
  }

  send(m: NetMsg) {
    void this.channel?.send({ type: 'broadcast', event: 'msg', payload: m })
  }

  updateMe(patch: Partial<PlayerMeta>) {
    this.me = { ...this.me!, ...patch }
    void this.channel?.track(this.me)
  }

  disconnect() {
    if (this.channel) void this.client?.removeChannel(this.channel)
    this.channel = undefined
  }
}
