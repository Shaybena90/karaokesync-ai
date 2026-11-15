import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, uploadToSignedUrl } from './api'
import { supabase } from './supabase'

/**
 * The user's own opening clip (instead of the KaraokeSync intro). The file is
 * uploaded like a video background; which one it is, is kept in the user's
 * account (Supabase user metadata), so it is offered for every song and on
 * every device.
 */
export interface OwnIntro {
  id: string
  name: string
  kind: 'image' | 'video'
  duration_ms: number | null
}

export const OWN_INTRO_ACCEPT = '.mp4,.mov,.webm,.m4v,.gif,.png,.jpg,.jpeg'

function valid(raw: unknown): OwnIntro | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(r.id)) return null
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name.slice(0, 120) : '',
    kind: r.kind === 'image' ? 'image' : 'video',
    duration_ms: typeof r.duration_ms === 'number' ? r.duration_ms : null,
  }
}

export function useOwnIntro() {
  const [intro, setIntro] = useState<OwnIntro | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void supabase?.auth.getUser().then(({ data }) => {
      if (!alive) return
      setIntro(valid(data.user?.user_metadata?.own_intro))
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async (next: OwnIntro | null) => {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ data: { own_intro: next } })
    if (error) throw new ApiError('save_failed')
    setIntro(next)
  }, [])

  /** Upload a clip (checked by the server) and make it the user's opening. */
  const upload = useCallback(
    async (projectId: string, file: File, onProgress: (p: number) => void) => {
      const init = await api.initBackground(projectId, file)
      await uploadToSignedUrl(init.upload_url, file, init.content_type, onProgress)
      const done = await api.completeBackground(init.media.id)
      if (done.status !== 'verified') throw new ApiError(done.error_code ?? 'not_media')
      await save({ id: done.id, name: file.name.slice(0, 120), kind: done.kind === 'image' ? 'image' : 'video', duration_ms: done.duration_ms })
    },
    [save],
  )

  const remove = useCallback(() => save(null), [save])

  /** A short-lived link to watch it, or null when the file no longer exists. */
  const watchUrl = useCallback(async (): Promise<string | null> => {
    if (!supabase || !intro) return null
    const { data } = await supabase.from('background_media').select('storage_path,status').eq('id', intro.id).maybeSingle()
    if (!data || data.status !== 'verified') return null
    const signed = await supabase.storage.from('backgrounds').createSignedUrl(data.storage_path as string, 600)
    return signed.data?.signedUrl ?? null
  }, [intro])

  return { intro, loaded, upload, remove, watchUrl }
}
