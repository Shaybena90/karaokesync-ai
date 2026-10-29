import { memo, type ReactNode } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { lineEnd, lineStart, type DocLine, type LyricsDoc } from '../../lib/lyricsDoc'
import { formatDuration } from '../../lib/format'

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
}: Props) {
  const { t } = useI18n()
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
              <IconBtn label={t('editor.shiftEarlier')} onClick={() => onShiftLine(line.id, -100)}>−0.1</IconBtn>
              <IconBtn label={t('editor.shiftLater')} onClick={() => onShiftLine(line.id, 100)}>+0.1</IconBtn>
              {i < doc.length - 1 && (
                <IconBtn label={t('editor.mergeNext')} onClick={() => onMergeNext(line.id)}>⤓</IconBtn>
              )}
            </span>
          </div>
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
                  className={`ks-chip min-h-10 rounded-xl px-3 text-base font-semibold transition ${
                    w.id === selectedId ? 'bg-fuchsia-500/40 ring-2 ring-fuchsia-300' : 'bg-white/[0.07] hover:bg-white/15'
                  } ${unsure ? 'underline decoration-amber-300/80 decoration-dotted decoration-2 underline-offset-4' : ''}`}
                >
                  {w.text}
                </button>
              )
            })}
          </div>
        </li>
      ))}
    </ol>
  )
})

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      dir="ltr"
      className="grid h-8 min-w-8 place-items-center rounded-lg bg-white/5 px-1.5 text-xs text-white/70 hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  )
}
