import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { supabase } from './supabase'

/**
 * The user's own lyrics websites. Kept in their account (Supabase user
 * metadata), so the list is the same on the phone and on the computer, with no
 * database table. `url` is the site's search address with {q} for the song name.
 */
export interface LyricsSource {
  name: string
  url: string
}

export const MAX_LYRICS_SOURCES = 8

function valid(raw: unknown): LyricsSource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is LyricsSource => !!s && typeof s.url === 'string' && s.url.includes('{q}') && /^https?:\/\//.test(s.url))
    .map((s) => ({ name: typeof s.name === 'string' ? s.name.slice(0, 60) : '', url: s.url.slice(0, 500) }))
    .slice(0, MAX_LYRICS_SOURCES)
}

export const sourceHost = (url: string) => {
  try {
    return new URL(url.replace('{q}', 'x')).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function useLyricsSources() {
  const [sources, setSources] = useState<LyricsSource[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void supabase?.auth.getUser().then(({ data }) => {
      if (!alive) return
      setSources(valid(data.user?.user_metadata?.lyrics_sources))
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback(async (next: LyricsSource[]) => {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ data: { lyrics_sources: next } })
    if (error) throw new Error('save_failed')
    setSources(next)
  }, [])

  /** Add a site: the server turns what was pasted into a search address (or says it is not usable). */
  const add = useCallback(
    async (name: string, url: string) => {
      const { template } = await api.normalizeLyricsSource(url)
      if (sources.some((s) => s.url === template)) return template
      await save([...sources, { name: name.trim() || sourceHost(template), url: template }].slice(0, MAX_LYRICS_SOURCES))
      return template
    },
    [sources, save],
  )

  const remove = useCallback((index: number) => save(sources.filter((_, i) => i !== index)), [sources, save])

  return { sources, loaded, add, remove }
}
