import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

const SIGNED_URL_SECONDS = 60 * 30

/**
 * Short-lived signed URL for a private audio object. `refresh()` issues a new
 * one (used when the old one expires in the middle of a long session).
 */
export function useSignedAudio(storagePath: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase || !storagePath) return null
    const { data, error } = await supabase.storage.from('audio').createSignedUrl(storagePath, SIGNED_URL_SECONDS)
    if (error || !data?.signedUrl) {
      setFailed(true)
      return null
    }
    setFailed(false)
    setUrl(data.signedUrl)
    return data.signedUrl
  }, [storagePath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { url, failed, refresh }
}
