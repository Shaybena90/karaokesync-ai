import { useEffect, useRef, useState } from 'react'
import { errorKey, useI18n } from '../i18n/I18nProvider'
import { ApiError, api, type LyricsSourceReport } from '../lib/api'
import { formatDuration } from '../lib/format'
import { MAX_LYRICS_SOURCES, sourceHost, useLyricsSources } from '../lib/lyricsSources'
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

/** One song found, from the open database (LRCLIB) or from one of the user's own websites. */
interface Found {
  key: string
  title: string
  artist: string
  source: string
  url: string | null
  duration_ms: number | null
  matches_length: boolean
  lyrics: string
}

/**
 * Find the song's lyrics online: in the open LRCLIB database and in the user's
 * own lyrics websites. Pick the right song, check the words, and with one
 * button they are used (and synced to the singer).
 */
export function LyricsSearchPanel({ initialQuery, durationMs, busy = false, mode, onUse, startOpen = false }: Props) {
  const { t } = useI18n()
  const { sources, loaded, add, remove } = useLyricsSources()
  const [open, setOpen] = useState(startOpen)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Found[] | null>(null)
  const [reports, setReports] = useState<LyricsSourceReport[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Found | null>(null)
  const [text, setText] = useState('')
  const searched = useRef(false)

  const choose = (r: Found) => {
    setChosen(r)
    setText(r.lyrics)
  }

  const search = async (q: string) => {
    if (!q.trim()) return
    setSearching(true)
    setError(null)
    setChosen(null)
    setReports([])
    const [open_, mine] = await Promise.allSettled([
      api.searchLyrics(q.trim(), durationMs),
      sources.length ? api.searchLyricsSources(q.trim(), sources.map((s) => s.url)) : Promise.resolve({ sources: [] }),
    ])
    const fromDb: Found[] =
      open_.status === 'fulfilled'
        ? open_.value.results.map((r) => ({ key: `db:${r.id}`, title: r.title, artist: r.artist, source: 'LRCLIB', url: null,
            duration_ms: r.duration_ms, matches_length: r.matches_length, lyrics: r.lyrics }))
        : []
    const siteReports = mine.status === 'fulfilled' ? mine.value.sources : []
    const fromSites: Found[] = siteReports.flatMap((rep) =>
      rep.results.map((r) => ({ key: `site:${r.url}`, title: r.title, artist: '', source: r.source, url: r.url,
        duration_ms: null, matches_length: false, lyrics: r.lyrics })),
    )
    // Same-length songs from the database first, then the user's sites, then the rest.
    const merged = [...fromDb.filter((r) => r.matches_length), ...fromSites, ...fromDb.filter((r) => !r.matches_length)]
    setReports(siteReports)
    if (open_.status === 'rejected' && (mine.status === 'rejected' || !sources.length || fromSites.length === 0)) {
      const err = open_.reason
      setError(err instanceof ApiError ? err.code : 'generic')
    }
    setResults(merged)
    if (merged[0]?.matches_length) choose(merged[0])
    setSearching(false)
  }

  // Search right away with the song's name when the panel opens (once the user's sites are known).
  useEffect(() => {
    if (open && loaded && !searched.current && initialQuery.trim()) {
      searched.current = true
      void search(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loaded])

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

  const missed = reports.filter((r) => r.status !== 'ok')
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
      <p className="text-xs text-white/50">
        {sources.length
          ? t('lyrics.sources.searchingIn').replace('{n}', String(sources.length))
          : t('lyrics.sources.onlyOpen')}
      </p>

      {searching && (
        <p className="flex items-center gap-2 text-sm text-white/70">
          <Spinner /> {t('lyrics.search.searching')}
        </p>
      )}
      {error && <p className="text-sm text-rose-300">{t(errorKey(error))}</p>}
      {results && !searching && results.length === 0 && !error && <p className="text-sm text-amber-200/90">{t('lyrics.search.none')}</p>}

      {results && results.length > 0 && !searching && (
        <div role="radiogroup" aria-label={t('lyrics.search.results')} className="max-h-64 space-y-1.5 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={chosen?.key === r.key}
              onClick={() => choose(r)}
              className={`block w-full rounded-xl px-3 py-2 text-start text-sm transition ${
                chosen?.key === r.key ? 'bg-violet-500/30 ring-2 ring-violet-300' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="block font-semibold" dir="auto">
                {r.title}
                {r.artist && <span className="font-normal text-white/60"> · {r.artist}</span>}
              </span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                <span className="rounded bg-white/10 px-1.5 text-white/70" dir="ltr">{r.source}</span>
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

      {!searching && missed.length > 0 && (
        <ul className="space-y-1 text-xs text-white/55" data-testid="sources-missed">
          {missed.map((r) => (
            <li key={r.template}>
              {t(r.status === 'blocked_source' ? 'lyrics.sources.blocked' : r.status === 'no_results' ? 'lyrics.sources.notFound' : 'lyrics.sources.failed').replace(
                '{site}',
                r.host || sourceHost(r.template),
              )}{' '}
              {r.search_url && (
                <a href={r.search_url} target="_blank" rel="noopener noreferrer" className="text-violet-300 underline">
                  {t('lyrics.sources.openSite')} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="space-y-2">
          <p className="text-xs text-white/60">
            {t('lyrics.search.check')}
            {chosen.url && (
              <>
                {' '}
                <a href={chosen.url} target="_blank" rel="noopener noreferrer" className="text-violet-300 underline">
                  {t('lyrics.sources.openPage')} ↗
                </a>
              </>
            )}
          </p>
          <LyricsTextarea value={text} onChange={setText} />
          <Button className="w-full" disabled={busy || !text.trim()} onClick={() => onUse(text)}>
            {mode === 'sync' ? `✨ ${t('lyrics.search.useSync')}` : `✓ ${t('lyrics.search.useFill')}`}
          </Button>
          {mode === 'sync' && <p className="text-xs text-amber-200/80">{t('lyrics.paste.replaces')}</p>}
        </div>
      )}

      <SourcesManager sources={sources} add={add} remove={remove} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/40">{t('lyrics.search.source')}</p>
        {!startOpen && (
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('lyrics.paste.cancel')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** "My lyrics websites": add a site by pasting its search address, or remove one. */
export function SourcesManager({
  sources,
  add,
  remove,
  defaultOpen = false,
}: {
  sources: { name: string; url: string }[]
  add: (name: string, url: string) => Promise<string>
  remove: (index: number) => Promise<void>
  defaultOpen?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(defaultOpen)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const template = await add(name, url)
      setMessage({ ok: true, text: t('lyrics.sources.added').replace('{url}', template) })
      setName('')
      setUrl('')
    } catch (err) {
      setMessage({ ok: false, text: t(errorKey(err instanceof ApiError ? err.code : 'lyrics_source_save_failed')) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10" data-testid="lyrics-sources">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start text-sm"
      >
        <span>
          ⚙️ <span className="font-semibold">{t('lyrics.sources.title')}</span>{' '}
          <span className="text-white/50">({sources.length})</span>
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/10 p-3">
          {sources.length > 0 && (
            <ul className="space-y-1.5">
              {sources.map((s, i) => (
                <li key={s.url} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold" dir="auto">{s.name}</span>
                    <span className="block truncate text-xs text-white/45" dir="ltr">{s.url}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(i)}
                    aria-label={t('lyrics.sources.remove').replace('{site}', s.name)}
                    className="min-h-9 rounded-lg px-2 text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sources.length < MAX_LYRICS_SOURCES ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <p className="text-xs leading-relaxed text-white/60">{t('lyrics.sources.how')}</p>
              <input
                value={name}
                maxLength={60}
                dir="auto"
                onChange={(e) => setName(e.target.value)}
                aria-label={t('lyrics.sources.name')}
                placeholder={t('lyrics.sources.name')}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm focus:border-violet-400 focus:outline-none"
              />
              <input
                value={url}
                maxLength={500}
                dir="ltr"
                inputMode="url"
                onChange={(e) => setUrl(e.target.value)}
                aria-label={t('lyrics.sources.url')}
                placeholder="https://example.co.il/?s=test"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm focus:border-violet-400 focus:outline-none"
              />
              <Button type="submit" disabled={saving || !url.trim()}>
                {t('lyrics.sources.add')}
              </Button>
            </form>
          ) : (
            <p className="text-xs text-white/50">{t('lyrics.sources.full')}</p>
          )}
          {message && <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`} dir="auto">{message.text}</p>}
          <p className="text-[11px] text-white/40">{t('lyrics.sources.note')}</p>
        </div>
      )}
    </div>
  )
}
