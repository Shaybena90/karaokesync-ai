import { useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { DocWord } from '../../lib/lyricsDoc'

interface Props {
  word: DocWord
  canSplit: boolean
  lyricDir: 'rtl' | 'ltr' | 'auto'
  currentTimeMs: () => number
  onText: (text: string) => void
  onTiming: (startMs: number, endMs: number) => void
  onInsert: (where: 'before' | 'after', text: string) => void
  onDelete: () => void
  onSplitLine: () => void
  onPlay: () => void
  onLoop: () => void
  onClose: () => void
}

/** "12.345" (seconds) ⇄ ms. Accepts "1:02.5" too. */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(2)
}
export function parseSeconds(value: string): number | null {
  const v = value.trim().replace(',', '.')
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v)
  if (!m) return null
  return Math.round(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) * 1000)
}

export function WordInspector(props: Props) {
  const { word, lyricDir, onText, onTiming } = props
  const { t } = useI18n()
  const [text, setText] = useState(word.text)
  const [newWord, setNewWord] = useState('')

  const commitText = () => {
    if (text.trim() && text.trim() !== word.text) onText(text)
    else setText(word.text)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">{t('editor.word')}</h2>
        <button type="button" onClick={props.onClose} className="rounded-xl px-2 py-1 text-sm text-white/60 hover:text-white" aria-label={t('editor.close')}>
          ✕
        </button>
      </div>

      <label className="block text-sm">
        <span className="text-white/60">{t('editor.text')}</span>
        <input
          value={text}
          dir={lyricDir}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
          className="mt-1 block min-h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-lg font-semibold focus:border-violet-400 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-white/40">{t('editor.textHint')}</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          label={t('editor.start')}
          ms={word.start_ms}
          onChange={(v) => onTiming(v, Math.max(v, word.end_ms))}
          onNow={() => {
            const now = props.currentTimeMs()
            onTiming(now, Math.max(now, word.end_ms))
          }}
        />
        <TimeField
          label={t('editor.end')}
          ms={word.end_ms}
          onChange={(v) => onTiming(word.start_ms, v)}
          onNow={() => onTiming(word.start_ms, props.currentTimeMs())}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Small onClick={props.onPlay}>▶ {t('editor.playWord')}</Small>
        <Small onClick={props.onLoop}>⟲ {t('editor.loopWord')}</Small>
        {props.canSplit && <Small onClick={props.onSplitLine}>↵ {t('editor.splitLine')}</Small>}
        <Small onClick={props.onDelete} danger>
          🗑 {t('editor.deleteWord')}
        </Small>
      </div>

      <div className="rounded-2xl border border-white/10 p-3">
        <p className="text-sm text-white/60">{t('editor.addWord')}</p>
        <div className="mt-2 flex gap-2">
          <input
            value={newWord}
            dir={lyricDir}
            maxLength={100}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder={t('editor.newWordPlaceholder')}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 focus:border-violet-400 focus:outline-none"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['before', 'after'] as const).map((where) => (
            <Small
              key={where}
              disabled={!newWord.trim()}
              onClick={() => {
                props.onInsert(where, newWord)
                setNewWord('')
              }}
            >
              {where === 'before' ? t('editor.insertBefore') : t('editor.insertAfter')}
            </Small>
          ))}
        </div>
      </div>
    </div>
  )
}

function TimeField({ label, ms, onChange, onNow }: { label: string; ms: number; onChange: (ms: number) => void; onNow: () => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = parseSeconds(draft)
    if (v !== null) onChange(v)
    setDraft(null)
  }
  return (
    <div className="rounded-2xl border border-white/10 p-2.5">
      <span className="text-xs text-white/60">{label}</span>
      <div className="mt-1 flex items-center gap-1" dir="ltr">
        <button type="button" onClick={() => onChange(ms - 50)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lg active:scale-95" aria-label={`${label} −0.05`}>
          −
        </button>
        <input
          value={draft ?? formatSeconds(ms)}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label={label}
          className="min-h-10 w-full min-w-0 rounded-xl bg-transparent text-center font-mono text-base tabular-nums focus:bg-white/5 focus:outline-none"
        />
        <button type="button" onClick={() => onChange(ms + 50)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lg active:scale-95" aria-label={`${label} +0.05`}>
          +
        </button>
      </div>
      <button type="button" onClick={onNow} className="mt-1.5 w-full rounded-xl bg-violet-500/20 py-2 text-xs font-semibold text-violet-100 active:scale-[0.98]">
        ◉ {t('editor.setNow')}
      </button>
    </div>
  )
}

function Small({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-10 rounded-xl px-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 ${
        danger ? 'bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'bg-white/10 hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  )
}
