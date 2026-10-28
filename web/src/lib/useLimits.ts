import { useEffect, useState } from 'react'
import { api } from './api'
import type { Limits } from './types'

// Shown until the API answers; the API is the source of truth.
const DEFAULT_LIMITS: Limits = {
  max_upload_bytes: 50 * 1024 * 1024,
  max_audio_duration_seconds: 600,
  allowed_extensions: ['mp3', 'wav', 'm4a'],
  max_uploads_per_day: 20,
}

export function useLimits(): Limits {
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS)
  useEffect(() => {
    let alive = true
    api
      .limits()
      .then((l) => alive && setLimits(l))
      .catch(() => {
        /* keep defaults; errors surface when uploading */
      })
    return () => {
      alive = false
    }
  }, [])
  return limits
}
