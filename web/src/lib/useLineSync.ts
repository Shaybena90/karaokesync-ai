import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from './api'
import { supabase } from './supabase'
import type { SyncJob } from './types'
import type { WordTime } from './lyricsDoc'

export type LineSyncState =
  | { kind: 'sending' }
  | { kind: 'queued' | 'running'; jobId: string; since: number }
  | { kind: 'done' }
  | { kind: 'changed' }
  | { kind: 'error'; code: string }

interface Pending {
  lineId: string
  texts: string[]
}

/**
 * Automatic sync requests for editor lines. A job goes to the worker queue;
 * the result arrives through Supabase Realtime (with polling as a fallback,
 * like video exports) and is handed to `onResult`, which applies it to the
 * document as a normal, undoable edit. `onResult` returns false when the line
 * was edited meanwhile, so a stale result is never applied.
 */
export function useLineSync(
  projectId: string,
  onResult: (lineId: string, texts: string[], times: WordTime[]) => boolean,
) {
  const [states, setStates] = useState<Record<string, LineSyncState>>({})
  const pending = useRef(new Map<string, Pending>()) // jobId → line
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const setLine = useCallback((lineId: string, state: LineSyncState | null) => {
    setStates((s) => {
      const next = { ...s }
      if (state) next[lineId] = state
      else delete next[lineId]
      return next
    })
  }, [])

  const handle = useCallback(
    (job: SyncJob) => {
      const p = pending.current.get(job.id)
      if (!p) return
      if (job.status === 'queued' || job.status === 'running') {
        setStates((s) => {
          const cur = s[p.lineId]
          if (cur && 'jobId' in cur && cur.kind === job.status) return s
          return { ...s, [p.lineId]: { kind: job.status as 'queued' | 'running', jobId: job.id, since: Date.now() } }
        })
        return
      }
      pending.current.delete(job.id)
      if (job.status === 'succeeded' && job.result) {
        const applied = onResultRef.current(p.lineId, p.texts, job.result)
        setLine(p.lineId, { kind: applied ? 'done' : 'changed' })
      } else {
        setLine(p.lineId, { kind: 'error', code: job.error_code ?? 'generic' })
      }
    },
    [setLine],
  )

  const refresh = useCallback(async () => {
    if (!supabase || pending.current.size === 0) return
    const { data } = await supabase.from('sync_jobs').select('*').in('id', [...pending.current.keys()])
    for (const job of (data as SyncJob[]) ?? []) handle(job)
  }, [handle])

  const active = Object.values(states).some((s) => s.kind === 'sending' || s.kind === 'queued' || s.kind === 'running')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel(`sync-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_jobs', filter: `project_id=eq.${projectId}` }, (e) =>
        handle(e.new as SyncJob),
      )
      .subscribe()
    return () => void client.removeChannel(channel)
  }, [projectId, handle])

  // Realtime can be blocked on some networks: poll while a sync is in progress.
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [active, refresh])

  const start = useCallback(
    async (lineId: string, texts: string[], window: { start: number; end: number }) => {
      setLine(lineId, { kind: 'sending' })
      try {
        const job = await api.createSyncJob(projectId, texts, window.start, window.end)
        pending.current.set(job.id, { lineId, texts })
        handle(job)
      } catch (err) {
        setLine(lineId, { kind: 'error', code: err instanceof ApiError ? err.code : 'generic' })
      }
    },
    [projectId, handle, setLine],
  )

  const dismiss = useCallback((lineId: string) => setLine(lineId, null), [setLine])
  const fail = useCallback((lineId: string, code: string) => setLine(lineId, { kind: 'error', code }), [setLine])

  return { states, start, dismiss, fail }
}
