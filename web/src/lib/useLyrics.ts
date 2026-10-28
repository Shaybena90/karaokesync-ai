import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { LyricLine, LyricWord } from './types'

/** Lines with their words, ordered. RLS ensures only the owner can read them. */
export function useLyrics(projectId: string): { lines: LyricLine[] | null; error: boolean } {
  const [lines, setLines] = useState<LyricLine[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    const client = supabase
    void (async () => {
      const [l, w] = await Promise.all([
        client.from('lyric_lines').select('id, line_index, start_ms, end_ms').eq('project_id', projectId).order('line_index'),
        client
          .from('lyric_words')
          .select('id, line_id, text, start_ms, end_ms, word_index, confidence')
          .eq('project_id', projectId)
          .order('word_index'),
      ])
      if (!alive) return
      if (l.error || w.error) return setError(true)
      const byLine = new Map<string, LyricWord[]>()
      for (const word of w.data as LyricWord[]) {
        const list = byLine.get(word.line_id)
        if (list) list.push(word)
        else byLine.set(word.line_id, [word])
      }
      setLines((l.data as Omit<LyricLine, 'words'>[]).map((line) => ({ ...line, words: byLine.get(line.id) ?? [] })))
    })()
    return () => {
      alive = false
    }
  }, [projectId])

  return { lines, error }
}
