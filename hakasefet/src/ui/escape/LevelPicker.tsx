import { LEVEL_IDS, LEVELS, type Level } from '../../escape/engine'

/** Easy / medium / hard selector (used in the solo intro and the co-op lobby). */
export function LevelPicker({ value, onChange, disabled }: { value: Level; onChange?: (l: Level) => void; disabled?: boolean }) {
  return (
    <fieldset className="text-right">
      <legend className="mb-2 font-bold">רמת קושי</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="רמת קושי">
        {LEVEL_IDS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === l}
            disabled={disabled}
            onClick={() => onChange?.(l)}
            className={`rounded-2xl border-2 p-2 text-center transition ${value === l ? 'border-gold bg-gold/15 shadow-[0_0_18px_-6px_rgba(242,193,78,.8)]' : 'border-white/10 bg-white/5'} ${disabled && value !== l ? 'opacity-40' : ''}`}
          >
            <span className="block text-xl" aria-hidden="true">{l === 'easy' ? '🟢' : l === 'medium' ? '🟡' : '🔴'}</span>
            <span className="block font-extrabold">{LEVELS[l].label}</span>
            <span className="block text-xs text-dim">{LEVELS[l].minutes} דק׳</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-mist">{LEVELS[value].desc}</p>
    </fieldset>
  )
}
