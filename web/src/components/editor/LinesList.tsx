import { memo, useEffect, useState, type ReactNode } from 'react'
import { errorKey, useI18n } from '../../i18n/I18nProvider'
import { lineEnd, lineStart, type DocLine, type LyricsDoc } from '../../lib/lyricsDoc'
import { formatDuration } from '../../lib/format'
import type { LineSyncState } from '../../lib/useLineSync'
import { Spinner } from '../ui'

/** After this long in the queue, remind the user that the worker must be running. */
const SLOW_QUEUE_MS = 15_000

interface Props {
  doc: LyricsDoc
  selectedId: string | null
  lyricDir: 'rtl' | 'ltr' | 'auto'
  registerChip: (id: string, el: HTMLButtonElement | null) => void
  onSelect: (wordId: string) => void
  onPlayLine: (line: DocLine) => void
  onLoopLine: (line: DocLine) => void
  onShiftLine: (lineId: string, deltaMs: number) => void
  onMergeNext: (lineId: string) => void
  syncStates: Record<string, LineSyncState>
  onAutoSync: (line: DocLine) => void
  onTapSync: (line: DocLine) => void
  onDismissSync: (lineId: string) => void
  /** A typed sentence replaces the line; `sync` = then time it to the singer automatically. */
  onLineText: (lineId: string, text: string, sync: boolean) => void
  /** Mark the stretch where this line is sung, then sync inside it. */
  onMarkRange: (line: DocLine) => void
}

/** All lines as editable word chips. Low-confidence words are underlined so they are easy to find. */
export const LinesList = memo(function LinesList({
  doc,
  selectedId,
  lyricDir,
  registerChip,
  onSelect,
  onPlayLine,
  onLoopLine,
  onShiftLine,
  onMergeNext,
  syncStates,
  onAutoSync,
  onTapSync,
  onDismissSync,
  onLineText,
  onMarkRange,
}: Props) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<{ lineId: string; text: string } | null>(null)
  const save = (sync: boolean) => {
    if (!editing) return
    onLineText(editing.lineId, editing.text, sync)
    setEditing(null)
  }
  return (
    <ol className="space-y-2.5">
      {doc.map((line, i) => (
        <li key={line.id} className="glass rounded-2xl p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/50">
            <span className="font-semibold text-white/70">#{i + 1}</span>
            <span dir="ltr" className="tabular-nums">
              {formatDuration(lineStart(line))}–{formatDuration(lineEnd(line))}
            </span>
            <span className="ms-auto flex flex-wrap gap-1">
              <IconBtn label={t('editor.playLine')} onClick={() => onPlayLine(line)}>▶</IconBtn>
              <IconBtn label={t('editor.loopLine')} onClick={() => onLoopLine(line)}>⟲</IconBtn>
              <IconBtn label={t('editor.line.edit')} onClick={() => setEditing({ lineId: line.id, text: line.words.map((w) => w.text).join(' ') })}>
                ✏️
              </IconBtn>
              <IconBtn label={t('editor.range.open')} onClick={() => onMarkRange(line)}>
                ⏱
              </IconBtn>
              <IconBtn label={t('editor.autoSync')} onClick={() => onAutoSync(line)} disabled={isBusy(syncStates[line.id])}>
                ✨
              </IconBtn>
              <IconBtn label={t('editor.tapSync')} onClick={() => onTapSync(line)}>
                👆
              </IconBtn>
              <IconBtn label={t('editor.shiftEarlier')} onClick={() => onShiftLine(line.id, -100)}>−0.1</IconBtn>
              <IconBtn label={t('editor.shiftLater')} onClick={() => onShiftLine(line.id, 100)}>+0.1</IconBtn>
              {i < doc.length - 1 && (
                <IconBtn label={t('editor.mergeNext')} onClick={() => onMergeNext(line.id)}>⤓</IconBtn>
              )}
            </span>
          </div>
          {editing?.lineId === line.id && (
            <div className="mt-2 space-y-2" data-testid="line-editor">
              <input
                autoFocus
                value={editing.text}
                dir={lyricDir}
                maxLength={2000}
                aria-label={t('editor.line.edit')}
                onChange={(e) => setEditing({ lineId: line.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    save(true)
                  } else if (e.key === 'Escape') setEditing(null)
                }}
                className="block min-h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-lg font-semibold focus:border-violet-400 focus:outline-none"
              />
              <p className="text-xs text-white/50">{t('editor.line.hint')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!editing.text.trim()} onClick={() => save(true)}
                  className="min-h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 px-3 text-sm font-semibold disabled:opacity-40">
                  ✨ {t('editor.line.saveSync')}
                </button>
                <button type="button" disabled={!editing.text.trim()} onClick={() => save(false)}
                  className="min-h-10 rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/15 disabled:opacity-40">
                  {t('editor.line.saveOnly')}
                </button>
                <button type="button" onClick={() => setEditing(null)} className="min-h-10 rounded-xl px-3 text-sm text-white/60 hover:text-white">
                  {t('editor.line.cancel')}
                </button>
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5" dir={lyricDir}>
            {line.words.map((w) => {
              const unsure = w.confidence !== null && w.confidence < 0.5
              return (
                <button
                  key={w.id}
                  type="button"
                  ref={(el) => registerChip(w.id, el)}
                  onClick={() => onSelect(w.id)}
                  title={`${(w.start_ms / 1000).toFixed(2)}–${(w.end_ms / 1000).toFixed(2)}`}
                  className={`ks-chip min-h-10 scroll-mt-48 scroll-mb-[55vh] rounded-xl px-3 sm:scroll-mb-4 text-base font-semibold transition ${
                    w.id === selectedId ? 'bg-fuchsia-500/40 ring-2 ring-fuchsia-300' : 'bg-white/[0.07] hover:bg-white/15'
                  } ${unsure ? 'underline decoration-amber-300/80 decoration-dotted decoration-2 underline-offset-4' : ''}`}
                >
                  {w.text}
                </button>
              )
            })}
          </div>
          <SyncStatus state={syncStates[line.id]} onDismiss={() => onDismissSync(line.id)} />
        </li>
      ))}
    </ol>
  )
})

function isBusy(state: LineSyncState | undefined): boolean {
  return state?.kind === 'sending' || state?.kind === 'queued' || state?.kind === 'running'
}

function SyncStatus({ state, onDismiss }: { state: LineSyncState | undefined; onDismiss: () => void }) {
  const { t } = useI18n()
  const queuedSince = state?.kind === 'queued' ? state.since : null
  const [slowSince, setSlowSince] = useState<number | null>(null)
  useEffect(() => {
    if (queuedSince === null) return
    const timer = setTimeout(() => setSlowSince(queuedSince), Math.max(0, queuedSince + SLOW_QUEUE_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [queuedSince])
  const slow = queuedSince !== null && slowSince === queuedSince
  if (!state) return null
  if (isBusy(state)) {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-violet-200" role="status">
        <Spinner className="size-3.5" />
        {state.kind === 'running' ? t('editor.syncRunning') : t('editor.syncQueued')}
        {slow && <span className="text-amber-200">· {t('editor.syncSlow')}</span>}
      </p>
    )
  }
  const tone = state.kind === 'done' ? 'text-emerald-300' : 'text-amber-200'
  const text =
    state.kind === 'error' ? t(errorKey(state.code)) : state.kind === 'changed' ? t('editor.syncChanged') : t('editor.synced')
  return (
    <p className={`mt-2 flex items-center gap-2 text-xs ${tone}`} role="status">
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={onDismiss} className="rounded-lg px-2 py-1 text-white/50 hover:text-white" aria-label={t('editor.close')}>
        ✕
      </button>
    </p>
  )
}

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      dir="ltr"
      className="grid h-8 min-w-8 place-items-center rounded-lg bg-white/5 px-1.5 text-xs text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  )
}
