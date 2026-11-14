import { useEffect, useRef, useState } from 'react'
import { errorKey, useI18n } from '../i18n/I18nProvider'
import { ApiError, api, type LyricsSearchResult } from '../lib/api'
import { formatDuration } from '../lib/format'
import { LyricsTextarea } from './PastedLyricsPanel'
import { Button, Spinner } from './ui'

interface Props {
  /** Search words to start with (the song's name), searched as soon as the panel opens. */
  initialQuery: string
  /** Length of the uploaded song: results of the same length come first. */
  durationMs?: number | null
  busy?: boolean
  /** "sync": use the lyrics and time them to the singer now; "fill": just put them in the form. */
  mode: 'sync' | 'fill'
  onUse: (text: string) => void
  startOpen?: boolean
}

/**
 * Find the song's lyrics online: search by name, pick the right song, check the
 * words, and with one button they are used (and synced to the singer).
 */
export function LyricsSearchPanel({ initialQuery, durationMs, busy = false, mode, onUse, startOpen = false }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(startOpen)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<LyricsSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<LyricsSearchResult | null>(null)
  const [text, setText] = useState('')
  const searched = useRef(false)

  const search = async (q: string) => {
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    setChosen(null)
    try {
      const { results } = await api.searchLyrics(q.trim(), durationMs)
      setResults(results)
      if (results.length > 0 && results[0].matches_length) choose(results[0])
    } catch (err) {
      setResults(null)
      setError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setSearching(false)
    }
  }
  const choose = (r: LyricsSearchResult) => {
    setChosen(r)
    setText(r.lyrics)
  }

  // Search right away with the song's name when the panel opens.
  useEffect(() => {
    if (open && !searched.current && initialQuery.trim()) {
      searched.current = true
      void search(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 w-full rounded-2xl border border-violet-400/40 bg-violet-500/10 px-4 text-start text-sm hover:bg-violet-500/20"
      >
        🔎 <span className="font-semibold">{t('lyrics.search.open')}</span>
        <span className="block text-xs text-white/55">{t('lyrics.search.why')}</span>
      </button>
    )
  }

  return (
    <div className="glass space-y-3 rounded-3xl p-4" data-testid="lyrics-search">
      <h2 className="font-display text-lg font-semibold">🔎 {t('lyrics.search.title')}</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search(query)
        }}
      >
        <input
          value={query}
          dir="auto"
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('lyrics.search.query')}
          placeholder={t('lyrics.search.placeholder')}
          className="min-h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 text-base focus:border-violet-400 focus:outline-none"
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          {t('lyrics.search.go')}
        </Button>
      </form>

      {searching && (
        <p className="flex items-center gap-2 text-sm text-white/70">
          <Spinner /> {t('lyrics.search.searching')}
        </p>
      )}
      {error && <p className="text-sm text-rose-300">{t(errorKey(error))}</p>}
      {results && !searching && results.length === 0 && <p className="text-sm text-amber-200/90">{t('lyrics.search.none')}</p>}

      {results && results.length > 0 && !searching && (
        <div role="radiogroup" aria-label={t('lyrics.search.results')} className="max-h-64 space-y-1.5 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={chosen?.id === r.id}
              onClick={() => choose(r)}
              className={`block w-full rounded-xl px-3 py-2 text-start text-sm transition ${
                chosen?.id === r.id ? 'bg-violet-500/30 ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="block font-semibold" dir="auto">
                {r.title}
                {r.artist && <span className="font-normal text-white/60"> · {r.artist}</span>}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                {r.duration_ms !== null && <span dir="ltr">{formatDuration(r.duration_ms)}</span>}
                {r.matches_length && <span className="text-emerald-300">✓ {t('lyrics.search.sameLength')}</span>}
                <span className="truncate" dir="auto">
                  {r.lyrics.split('\n').find((l) => l.trim())}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <div className="space-y-2">
          <p className="text-xs text-white/60">{t('lyrics.search.check')}</p>
          <LyricsTextarea value={text} onChange={setText} />
          <Button className="w-full" disabled={busy || !text.trim()} onClick={() => onUse(text)}>
            {mode === 'sync' ? `✨ ${t('lyrics.search.useSync')}` : `✓ ${t('lyrics.search.useFill')}`}
          </Button>
          {mode === 'sync' && <p className="text-xs text-amber-200/80">{t('lyrics.paste.replaces')}</p>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/40">{t('lyrics.search.source')}</p>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t('lyrics.paste.cancel')}
        </Button>
      </div>
    </div>
  )
}
