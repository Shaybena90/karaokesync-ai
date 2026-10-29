import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/he'
import { FONTS, PRESETS, type FontName, type SubtitleStyle } from '../../lib/subtitleStyle'

interface Props {
  style: SubtitleStyle
  onChange: (next: SubtitleStyle) => void
}

const PRESET_LABEL: Record<keyof typeof PRESETS, MessageKey> = {
  classic: 'style.preset.classic',
  neon: 'style.preset.neon',
  tiktok: 'style.preset.tiktok',
}

/** All subtitle style options. Any manual change switches the preset to "custom". */
export function StyleControls({ style, onChange }: Props) {
  const { t } = useI18n()
  const set = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) =>
    onChange({ ...style, [key]: value, preset: 'custom' })

  return (
    <div className="space-y-5">
      <Section title={t('style.presets')}>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => {
            const p = PRESETS[name]
            const active = style.preset === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => onChange(PRESETS[name])}
                aria-pressed={active}
                className={`rounded-2xl p-2 text-center transition active:scale-[0.98] ${
                  active ? 'ring-2 ring-violet-400' : 'ring-1 ring-white/10 hover:ring-white/30'
                }`}
                style={{ backgroundImage: `linear-gradient(135deg, ${p.background_color}, ${p.background_color2})` }}
              >
                <span
                  className="block truncate py-2 text-lg"
                  style={{
                    fontFamily: `"${p.font}", Heebo, sans-serif`,
                    fontWeight: FONTS[p.font],
                    color: p.highlight_color,
                    textShadow: p.glow ? `0 0 10px ${p.highlight_color}` : `0 2px 0 ${p.outline_color}`,
                  }}
                >
                  {t('style.sample')}
                </span>
                <span className="block text-xs font-medium text-white/80">{t(PRESET_LABEL[name])}</span>
              </button>
            )
          })}
        </div>
        {style.preset === 'custom' && <p className="mt-2 text-xs text-white/50">{t('style.custom')}</p>}
      </Section>

      <Section title={t('style.text')}>
        <Row label={t('style.font')}>
          <select
            aria-label={t('style.font')}
            value={style.font}
            onChange={(e) => set('font', e.target.value as FontName)}
            className="h-11 w-full rounded-xl bg-white/10 px-3"
            style={{ fontFamily: `"${style.font}", Heebo, sans-serif` }}
          >
            {(Object.keys(FONTS) as FontName[]).map((f) => (
              <option key={f} value={f} className="bg-ink-900" style={{ fontFamily: `"${f}"` }}>
                {f}
              </option>
            ))}
          </select>
        </Row>
        <Slider label={t('style.size')} value={style.size} min={50} max={160} step={5} suffix="%" onChange={(v) => set('size', v)} />
        <div className="grid grid-cols-3 gap-2">
          <Color label={t('style.textColor')} value={style.text_color} onChange={(v) => set('text_color', v)} />
          <Color label={t('style.highlightColor')} value={style.highlight_color} onChange={(v) => set('highlight_color', v)} />
          <Color label={t('style.outlineColor')} value={style.outline_color} onChange={(v) => set('outline_color', v)} />
        </div>
        <Slider label={t('style.outline')} value={style.outline} min={0} max={10} onChange={(v) => set('outline', v)} />
        <Slider label={t('style.shadow')} value={style.shadow} min={0} max={10} onChange={(v) => set('shadow', v)} />
        <div className="grid grid-cols-2 gap-2">
          <Toggle label={t('style.glow')} checked={style.glow} onChange={(v) => set('glow', v)} />
          <Toggle label={t('style.textBox')} checked={style.text_box} onChange={(v) => set('text_box', v)} />
        </div>
      </Section>

      <Section title={t('style.layout')}>
        <Row label={t('style.position')}>
          <Segmented
            value={style.position}
            options={[
              ['top', t('style.position.top')],
              ['center', t('style.position.center')],
              ['bottom', t('style.position.bottom')],
            ]}
            onChange={(v) => set('position', v)}
          />
        </Row>
        <Row label={t('style.animation')}>
          <Segmented
            value={style.animation}
            options={[
              ['fill', t('style.animation.fill')],
              ['word', t('style.animation.word')],
              ['none', t('style.animation.none')],
            ]}
            onChange={(v) => set('animation', v)}
          />
        </Row>
        <Toggle label={t('style.showNext')} checked={style.show_next_line} onChange={(v) => set('show_next_line', v)} />
      </Section>

      <Section title={t('style.background')}>
        <div className="grid grid-cols-2 gap-2">
          <Color label={t('style.bgColor1')} value={style.background_color} onChange={(v) => set('background_color', v)} />
          <Color label={t('style.bgColor2')} value={style.background_color2} onChange={(v) => set('background_color2', v)} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-white/80">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-white/60">{label}</span>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-white/60">
        {label}
        <span dir="ltr" className="tabular-nums">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 w-full accent-violet-400"
      />
    </label>
  )
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1 rounded-xl bg-white/5 p-2 text-center text-xs text-white/70">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent"
      />
      {label}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-violet-500" />
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void
}) {
  return (
    <div className="grid rounded-xl bg-white/5 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-lg px-2 text-sm font-medium transition ${v === value ? 'bg-violet-500/40 text-white' : 'text-white/60 hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
