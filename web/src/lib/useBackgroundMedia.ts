import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { BackgroundMedia } from './types'

const SIGNED_URL_SECONDS = 60 * 60

export interface LoadedBackground extends BackgroundMedia {
  /** Short-lived signed URL (private bucket); null until loaded or if signing failed. */
  url: string | null
}

async function load(projectId: string): Promise<LoadedBackground[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('background_media')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  const rows = ((data as BackgroundMedia[]) ?? []).filter((m) => m.status === 'verified')
  const urls = new Map<string, string>()
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from('backgrounds')
      .createSignedUrls(rows.map((m) => m.storage_path), SIGNED_URL_SECONDS)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  return rows.map((m) => ({ ...m, url: urls.get(m.storage_path) ?? null }))
}

/**
 * The project's background files (RLS: own rows only) with signed URLs for the
 * verified ones. `enabled` = false skips all requests (no backgrounds in use).
 */
export function useBackgroundMedia(projectId: string, enabled = true) {
  const [media, setMedia] = useState<LoadedBackground[]>([])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    void load(projectId).then((rows) => {
      if (alive) setMedia(rows)
    })
    return () => {
      alive = false
    }
  }, [projectId, enabled])

  const reload = useCallback(async () => {
    setMedia(await load(projectId))
  }, [projectId])

  return { media, reload }
}
