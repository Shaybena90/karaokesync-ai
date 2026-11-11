import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'
import { supabase } from './supabase'
import type { InstrumentalJob } from './types'

async function latest(projectId: string): Promise<InstrumentalJob | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('instrumental_jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as InstrumentalJob | null) ?? null
}

/**
 * The song's melody-only track (singer removed by the worker): its latest job,
 * kept fresh with Realtime and, while it runs, polling as a fallback.
 * `ready` = the track exists and can be played or used in a video.
 */
export function useInstrumental(projectId: string, enabled = true) {
  const [job, setJob] = useState<InstrumentalJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => void latest(projectId).then((j) => alive && setJob(j))
    load()
    if (!supabase) return
    const client = supabase
    // A unique name: the player and the export panel can both follow the same song.
    const channel = client
      .channel(`instrumental-${projectId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instrumental_jobs', filter: `project_id=eq.${projectId}` }, load)
      .subscribe()
    return () => {
      alive = false
      void client.removeChannel(channel)
    }
  }, [projectId, enabled])

  const active = job?.status === 'queued' || job?.status === 'running'
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void latest(projectId).then(setJob), 4000)
    return () => clearInterval(timer)
  }, [active, projectId])

  const request = useCallback(async () => {
    setRequesting(true)
    setError(null)
    try {
      setJob(await api.requestInstrumental(projectId))
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setRequesting(false)
    }
  }, [projectId])

  const ready = job?.status === 'succeeded' && Boolean(job.output_path)
  return { job, ready, active, requesting, error, request }
}

export type InstrumentalState = ReturnType<typeof useInstrumental>
