import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropzone } from '../components/Dropzone'
import { Alert, Button, Card, ProgressBar, Spinner } from '../components/ui'
import { errorKey, useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/he'
import { ApiError, api, type SongLanguage, uploadToSignedUrl } from '../lib/api'
import { LyricsTextarea } from '../components/PastedLyricsPanel'
import { checkLocalFile, readDuration } from '../lib/audioFile'
import { formatBytes, formatDuration } from '../lib/format'
import { usePendingFile } from '../lib/pendingFile'
import { useLimits } from '../lib/useLimits'

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'preparing' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'verifying' }
  | { kind: 'done' }
  | { kind: 'error'; code: string }

const phaseLabel: Partial<Record<Phase['kind'], MessageKey>> = {
  checking: 'upload.checking',
  preparing: 'upload.preparing',
  uploading: 'upload.uploading',
  verifying: 'upload.verifying',
  done: 'upload.done',
}

export function UploadPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const limits = useLimits()
  const [pending, setPending] = usePendingFile()
  const [file, setFile] = useState<File | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [language, setLanguage] = useState<SongLanguage | 'auto'>(() => {
    try {
      const saved = localStorage.getItem('ks-song-language')
      return saved === 'he' || saved === 'en' ? saved : 'auto'
    } catch {
      return 'auto'
    }
  })
  const [lyricsText, setLyricsText] = useState('')
  const [showLyrics, setShowLyrics] = useState(false)
  const chooseLanguage = (value: SongLanguage | 'auto') => {
    setLanguage(value)
    try {
      localStorage.setItem('ks-song-language', value)
    } catch {
      /* private mode: just not remembered */
    }
  }
  const abortRef = useRef<AbortController | null>(null)
  const projectRef = useRef<string | null>(null)

  const maxMb = Math.round(limits.max_upload_bytes / 1024 / 1024)
  const maxMinutes = Math.round(limits.max_audio_duration_seconds / 60)

  const start = useCallback(
    async (f: File) => {
      setFile(f)
      setDurationMs(null)
      projectRef.current = null
      setPhase({ kind: 'checking' })

      // 1. quick local checks (the server re-checks everything)
      const local = await checkLocalFile(f, limits.max_upload_bytes)
      if (!local.ok) return setPhase({ kind: 'error', code: local.code })
      const duration = await readDuration(f)
      setDurationMs(duration)
      if (duration && duration > limits.max_audio_duration_seconds * 1000) {
        return setPhase({ kind: 'error', code: 'too_long' })
      }

      try {
        // 2. ask the API for a one-time, path-restricted upload permission
        setPhase({ kind: 'preparing' })
        const init = await api.initUpload(f, language === 'auto' ? null : language, lyricsText.trim() || null)
        projectRef.current = init.project_id

        // 3. upload straight to private storage
        abortRef.current = new AbortController()
        setPhase({ kind: 'uploading', progress: 0 })
        await uploadToSignedUrl(
          init.upload_url,
          f,
          init.content_type,
          (p) => setPhase({ kind: 'uploading', progress: p }),
          abortRef.current.signal,
        )
        abortRef.current = null

        // 4. server-side verification + job creation
        setPhase({ kind: 'verifying' })
        const state = await api.completeUpload(init.project_id)
        if (state.status === 'failed') return setPhase({ kind: 'error', code: state.error_code ?? 'generic' })
        if (state.duration_ms) setDurationMs(state.duration_ms)
        setPhase({ kind: 'done' })
        setTimeout(() => navigate(`/projects/${init.project_id}`), 700)
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'generic'
        if (code === 'aborted') {
          // Remove the half-created project instead of leaving it behind.
          if (projectRef.current) api.deleteProject(projectRef.current).catch(() => undefined)
          setFile(null)
          return setPhase({ kind: 'idle' })
        }
        setPhase({ kind: 'error', code })
      }
    },
    [limits, navigate, language, lyricsText],
  )

  // A file picked on the home page before signing in.
  useEffect(() => {
    if (pending) {
      setPending(null)
      void start(pending)
    }
  }, [pending, setPending, start])

  // A free API host sleeps when idle and needs up to a minute to wake up:
  // explain the wait instead of looking stuck.
  const [slow, setSlow] = useState(false)
  const waitingForServer = phase.kind === 'preparing' || phase.kind === 'verifying'
  useEffect(() => {
    if (!waitingForServer) return setSlow(false)
    const timer = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(timer)
  }, [waitingForServer])

  const busy = ['checking', 'preparing', 'uploading', 'verifying', 'done'].includes(phase.kind)
  const label = phaseLabel[phase.kind]

  return (
    <div className="mx-auto max-w-2xl pt-8 sm:pt-12">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('upload.title')}</h1>
      <p className="mt-2 text-white/60">{t('upload.subtitle')}</p>

      <div className="mt-8 space-y-5">
        {!file && (
          <div>
            <p id="song-language" className="mb-2 text-sm text-white/70">{t('upload.language')}</p>
            <div role="radiogroup" aria-labelledby="song-language" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1">
              {(['auto', 'he', 'en'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={language === value}
                  onClick={() => chooseLanguage(value)}
                  className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition ${
                    language === value ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  {t(`upload.language.${value}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-white/45">{t('upload.languageHint')}</p>
          </div>
        )}
        {!file &&
          (showLyrics ? (
            <div className="glass space-y-2 rounded-3xl p-4" data-testid="upload-lyrics">
              <p className="text-sm font-semibold">📝 {t('lyrics.upload.title')}</p>
              <p className="text-xs text-white/55">{t('lyrics.paste.help')}</p>
              <LyricsTextarea value={lyricsText} onChange={setLyricsText} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLyrics(true)}
              className="min-h-11 w-full rounded-2xl border border-dashed border-white/20 px-4 text-start text-sm hover:border-violet-400 hover:bg-white/5"
            >
              📝 <span className="font-semibold">{t('lyrics.upload.open')}</span>
              <span className="block text-xs text-white/50">{t('lyrics.paste.why')}</span>
            </button>
          ))}
        {!file && <Dropzone onFile={start} maxMb={maxMb} maxMinutes={maxMinutes} />}

        {file && (
          <Card>
            <div className="flex items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600">
                <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" dir="auto" title={file.name}>
                  {file.name}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-white/50">{t('upload.file.size')}</dt>
                    <dd dir="ltr" className="text-start">
                      {formatBytes(file.size, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/50">{t('upload.file.duration')}</dt>
                    <dd dir="ltr" className="text-start">
                      {formatDuration(durationMs)}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-white/50">{t('upload.file.status')}</dt>
                    <dd className="flex items-center gap-2">
                      {busy && phase.kind !== 'done' && <Spinner className="size-4" />}
                      {label ? t(label) : phase.kind === 'error' ? t('status.failed') : ''}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {slow && waitingForServer && (
              <p className="mt-4 text-sm text-white/60" role="status">
                {t('upload.serverWaking')}
              </p>
            )}

            {phase.kind === 'uploading' && (
              <div className="mt-5 flex items-center gap-3">
                <ProgressBar value={phase.progress} label={t('upload.uploading')} />
                <span dir="ltr" className="w-12 text-end text-sm tabular-nums text-white/70">
                  {Math.round(phase.progress * 100)}%
                </span>
              </div>
            )}

            {phase.kind === 'error' && (
              <div className="mt-5">
                <Alert>{t(errorKey(phase.code), { mb: maxMb, min: maxMinutes })}</Alert>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {phase.kind === 'uploading' && (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  {t('upload.cancel')}
                </Button>
              )}
              {phase.kind === 'error' && (
                <>
                  <Button onClick={() => start(file)}>{t('upload.retry')}</Button>
                  <Button variant="ghost" onClick={() => (setFile(null), setPhase({ kind: 'idle' }))}>
                    {t('upload.another')}
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
