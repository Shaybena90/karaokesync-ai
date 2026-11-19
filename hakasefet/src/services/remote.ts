/**
 * Server-side extensions (see ROADMAP.md). Today co-op runs over Supabase
 * Realtime with a host-authoritative client (src/net/session.ts) and no
 * database. A future verified leaderboard needs the server to own the room
 * state and the answers; this interface is where that plugs in.
 *
 * Only public values (URL + anon key) ever reach the browser. Service-role
 * keys stay in server code (Edge Functions) and never use the VITE_ prefix.
 */
export interface VerifiedRunService {
  /** Server creates the run and keeps the answers. */
  startRun(p: { roomId: string; players: string[] }): Promise<{ runId: string; serverStartedAt: number }>
  /** Server checks a lock and returns only right/wrong plus what it unlocks. */
  tryLock(p: { runId: string; hotspot: string; input: string }): Promise<{ ok: boolean }>
  /** Server computes the official time. */
  finish(p: { runId: string }): Promise<{ timeMs: number; rank?: number }>
}
