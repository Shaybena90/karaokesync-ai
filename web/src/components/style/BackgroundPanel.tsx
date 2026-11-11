import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { errorKey, useI18n } from '../../i18n/I18nProvider'
import { ApiError, api, uploadToSignedUrl } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import { MAX_BACKGROUNDS, type BackgroundClip, type SubtitleStyle } from '../../lib/subtitleStyle'
import type { LoadedBackground } from '../../lib/useBackgroundMedia'
import { parseSeconds } from '../editor/WordInspector'
import { ProgressBar } from '../ui'

interface Props {
  projectId: string
  style: SubtitleStyle
  onChange: (next: SubtitleStyle) => void
  media: LoadedBackground[]
  reloadMedia: () => Promise<void>
  songMs: number
  /** Current position of the preview player (ms). */
  positionRef: MutableRefObject<number>
}

const ACCEPT = '.gif,.mp4,.m4v,.webm,.mov,.png,.jpg,.jpeg'

/** "1:05.3" */
function formatTime(ms: number): string {
  return `${formatDuration(ms)}.${Math.floor((ms % 1000) / 100)}`
}

/**
 * Video background: upload an animated GIF, a short video or a picture, and
 * choose whether it shows for the whole song or only part of it. It loops
 * for as long as its part lasts, in the preview and in the exported video.
 */
export function BackgroundPanel({ projectId, style, onChange, media, reloadMedia, songMs, positionRef }: Props) {
  const { t } = useI18n()
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // Latest style: an upload takes a while and the user may keep editing meanwhile.
  const styleRef = useRef(style)
  useLayoutEffect(() => {
    styleRef.current = style
  }, [style])

  const setClips = (clips: BackgroundClip[]) => onChange({ ...styleRef.current, backgrounds: clips })

  const add = async (file: File) => {
    setError(null)
    setProgress(0)
    try {
      const init = await api.initBackground(projectId, file)
      await uploadToSignedUrl(init.upload_url, file, init.content_type, setProgress)
      const done = await api.completeBackground(init.media.id)
      if (done.status !== 'verified') throw new ApiError(done.error_code ?? 'not_media')
      await reloadMedia()
      setClips([...styleRef.current.backgrounds, { media_id: done.id, start_ms: null, end_ms: null }])
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'generic')
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  const update = (index: number, patch: Partial<BackgroundClip>) => {
    const clips = styleRef.current.backgrounds.map((c, i) => (i === index ? { ...c, ...patch } : c))
    const c = clips[index]
    // Keep the range valid: the end always comes after the start.
    if (c.start_ms !== null && c.end_ms !== null && c.end_ms <= c.start_ms) clips[index] = { ...c, end_ms: c.start_ms + 1000 }
    setClips(clips)
  }

  const remove = async (index: number) => {
    const clip = styleRef.current.backgrounds[index]
    const rest = styleRef.current.backgrounds.filter((_, i) => i !== index)
    setClips(rest)
    if (!rest.some((c) => c.media_id === clip.media_id)) {
      try {
        await api.deleteBackground(clip.media_id)
      } catch {
        /* the file is no longer used; the retention job removes it eventually */
      }
      await reloadMedia()
    }
  }

  return (
    <div className="space-y-3" data-testid="background-panel">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('bg.title')}</h2>
        <p className="mt-1 text-xs text-white/50">{t('bg.help')}</p>
      </div>

      {style.backgrounds.length > 0 && (
        <ol className="space-y-2.5">
          {style.backgrounds.map((clip, i) => {
            const m = media.find((x) => x.id === clip.media_id)
            const whole = clip.start_ms === null && clip.end_ms === null
            return (
              <li key={`${i}:${clip.media_id}`} className="rounded-2xl border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-white/5">
                    {m?.url &&
                      (m.kind === 'image' || m.format === 'gif' ? (
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video src={m.url} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                      ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" dir="auto">
                      {m?.original_name ?? t('bg.missing')}
                    </p>
                    {m && (
                      <p className="text-xs text-white/50">
                        {m.kind === 'image' ? t('bg.kind.image') : m.format === 'gif' ? t('bg.kind.gif') : t('bg.kind.video')}
                        {m.duration_ms ? ` · ${formatTime(m.duration_ms)}` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(i)}
                    aria-label={t('bg.remove')}
                    title={t('bg.remove')}
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-200 hover:bg-red-500/20"
                  >
                    🗑
                  </button>
                </div>

                <label className="mt-3 flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={whole}
                    onChange={(e) =>
                      update(i, e.target.checked ? { start_ms: null, end_ms: null } : { start_ms: 0, end_ms: Math.min(songMs || 10_000, 10_000) })
                    }
                    className="size-5 accent-violet-500"
                  />
                  {t('bg.wholeSong')}
                </label>

                {!whole && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <TimeBox
                      label={t('bg.from')}
                      ms={clip.start_ms ?? 0}
                      onChange={(ms) => update(i, { start_ms: ms })}
                      onNow={() => update(i, { start_ms: Math.round(positionRef.current) })}
                    />
                    <TimeBox
                      label={t('bg.to')}
                      ms={clip.end_ms ?? songMs}
                      onChange={(ms) => update(i, { end_ms: ms })}
                      onNow={() => update(i, { end_ms: Math.round(positionRef.current) })}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {progress !== null ? (
        <div className="space-y-1.5" role="status">
          <p className="text-sm text-white/70">{t('bg.uploading')}</p>
          <ProgressBar value={progress} label={t('bg.uploading')} />
        </div>
      ) : (
        style.backgrounds.length < MAX_BACKGROUNDS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="min-h-11 w-full rounded-2xl border border-dashed border-white/20 px-3 text-sm font-semibold hover:border-violet-400 hover:bg-white/5"
          >
            + {t('bg.add')}
          </button>
        )
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="background-file"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void add(file)
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-red-200">
          {t(errorKey(error))}
        </p>
      )}
    </div>
  )
}

function TimeBox({ label, ms, onChange, onNow }: { label: string; ms: number; onChange: (ms: number) => void; onNow: () => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = parseSeconds(draft)
    if (v !== null) onChange(v)
    setDraft(null)
  }
  return (
    <div className="rounded-xl border border-white/10 p-2">
      <span className="text-xs text-white/60">{label}</span>
      <input
        value={draft ?? formatTime(ms)}
        inputMode="decimal"
        dir="ltr"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="mt-1 block min-h-10 w-full rounded-lg bg-white/5 px-2 text-center font-mono text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-400"
      />
      <button type="button" onClick={onNow} className="mt-1.5 min-h-9 w-full rounded-lg bg-violet-500/20 text-xs font-semibold text-violet-100">
        ◉ {t('bg.now')}
      </button>
    </div>
  )
}
