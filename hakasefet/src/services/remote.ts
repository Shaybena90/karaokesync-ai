/**
 * Service layer for Stage 2 (accounts, sync, live duels, verified scores).
 * Stage 1 uses LocalService only — nothing in the UI calls a server.
 *
 * Verified competition requires the server to hold future questions' answers
 * and the vault code, and to compute the score itself. A client implementation
 * of this interface must never receive those before they are needed.
 */
import type { Level } from '../content/types'

export interface RemoteConfig {
  provider: 'local' | 'supabase'
  url?: string
  /** Public (anon) key only. Service-role keys stay on the server. */
  anonKey?: string
}

export interface ServerAnswerResult {
  correct: boolean
  points: number
  /** The server's clock decides the deadline. */
  serverTime: number
}

export interface RemoteService {
  readonly kind: RemoteConfig['provider']
  /** Stage 2: sign in and pull/push progress between devices. */
  syncProgress?(snapshot: unknown): Promise<unknown>
  /** Stage 2: server-side game — questions arrive one at a time, answers are checked on the server. */
  startVerifiedAttempt?(p: { date: string; level: Level }): Promise<{ attemptId: string }>
  submitAnswer?(p: { attemptId: string; questionId: string; optionId: string }): Promise<ServerAnswerResult>
  submitCode?(p: { attemptId: string; code: string }): Promise<{ solved: boolean; score: number }>
}

export class LocalService implements RemoteService {
  readonly kind = 'local' as const
}

export function readRemoteConfig(env: Record<string, string | undefined> = import.meta.env): RemoteConfig {
  const provider = env.VITE_REMOTE_PROVIDER === 'supabase' ? 'supabase' : 'local'
  return { provider, url: env.VITE_SUPABASE_URL || undefined, anonKey: env.VITE_SUPABASE_ANON_KEY || undefined }
}

/** Stage 1 always returns the local service; a Supabase implementation plugs in here later. */
export function createRemoteService(_config: RemoteConfig = readRemoteConfig()): RemoteService {
  return new LocalService()
}
