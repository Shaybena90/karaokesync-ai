import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { AudioFile, ProcessingJob, Project } from './types'

export interface ProjectLive {
  project: Project | null
  audio: AudioFile | null
  job: ProcessingJob | null
  loading: boolean
  notFound: boolean
  reload: () => Promise<void>
}

/**
 * Loads a project with its audio file and latest job, and keeps it fresh via
 * Supabase Realtime (with a slow polling fallback for flaky mobile networks).
 * Row Level Security guarantees only the owner's rows are returned.
 */
export function useProjectLive(projectId: string): ProjectLive {
  const [project, setProject] = useState<Project | null>(null)
  const [audio, setAudio] = useState<AudioFile | null>(null)
  const [job, setJob] = useState<ProcessingJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const reload = useCallback(async () => {
    if (!supabase) return
    const [p, a, j] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('audio_files').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('processing_jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setProject((p.data as Project) ?? null)
    setNotFound(!p.error && !p.data)
    setAudio((a.data as AudioFile) ?? null)
    setJob((j.data as ProcessingJob) ?? null)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    void reload()
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel(`project-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` }, () => void reload())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processing_jobs', filter: `project_id=eq.${projectId}` },
        () => void reload(),
      )
      .subscribe()
    const poll = setInterval(() => void reload(), 15000)
    return () => {
      clearInterval(poll)
      void client.removeChannel(channel)
    }
  }, [projectId, reload])

  return { project, audio, job, loading, notFound, reload }
}
