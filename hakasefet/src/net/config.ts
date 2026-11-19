import { LocalTransport, type Transport } from './transport'
import { SupabaseTransport } from './supabaseTransport'

/**
 * Which network co-op uses:
 * - 'supabase' when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (public values);
 * - 'local' (tabs of the same browser) when localStorage `hakasefet:net` is "local" — for testing;
 * - otherwise co-op is not available and the UI says how to enable it.
 */
export type NetMode = 'supabase' | 'local' | 'none'

export function netMode(): NetMode {
  try {
    if (localStorage.getItem('hakasefet:net') === 'local') return 'local'
  } catch {
    /* ignore */
  }
  const env = import.meta.env
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? 'supabase' : 'none'
}

export function createTransport(mode: NetMode = netMode()): Transport | null {
  if (mode === 'local') return new LocalTransport()
  if (mode === 'supabase') return new SupabaseTransport(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  return null
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function newRoomCode(): string {
  const a = new Uint32Array(5)
  crypto.getRandomValues(a)
  return Array.from(a, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('')
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

/** One id per browser tab: survives a refresh (rejoin as the same player), two tabs are two players. */
export function playerId(): string {
  try {
    let id = sessionStorage.getItem('hakasefet:player')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('hakasefet:player', id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}
