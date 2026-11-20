import type { PairView, Role } from './logic.ts'

/** Messages between the browser and the pair server (JSON over WebSocket). */
export type ClientMsg =
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'resume'; code: string; token: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'act'; id: string; type: 'answer' | 'hint' | 'exit'; stage: number; value?: string }

export type PairError = 'not-found' | 'full' | 'expired' | 'bad-token' | 'bad-message'

export interface PeerInfo {
  connected: boolean
  ready: boolean
  taken: boolean
}

export type ServerMsg =
  | { t: 'joined'; code: string; role: Role; token: string }
  | { t: 'error'; error: PairError }
  | { t: 'result'; id: string; outcome: 'ok' | 'wrong' | 'invalid' }
  | { t: 'state'; code: string; role: Role; phase: 'waiting' | 'playing' | 'done'; serverNow: number; expiresAt: number; peers: Record<Role, PeerInfo>; view: PairView }

/** Sessions last up to 3 hours; one with nobody connected for 30 minutes expires. */
export const SESSION_TTL_MS = 3 * 60 * 60_000
export const IDLE_TTL_MS = 30 * 60_000
