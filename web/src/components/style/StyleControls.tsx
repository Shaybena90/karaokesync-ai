import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { AnimatedBackgroundPicker } from './AnimatedBackgroundPicker'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/he'
import { ensureFonts } from '../../lib/fonts'
import { COUNTDOWNS, ENTRANCES, FONTS, PRESETS, TEXT_3D_KINDS, text3dShadow, type FontName, type SubtitleStyle } from '../../lib/subtitleStyle'

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
  // The font picker shows every font in its own letters.
  useEffect(() => ensureFonts(Object.keys(FONTS) as FontName[]), [])

  return (
    <div className="space-y-3">
      <Section title={t('style.presets')} icon="✨">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => {
            const p = PRESETS[name]
            const active = style.preset === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => onChange({ ...PRESETS[name], backgrounds: style.backgrounds })}
                aria-pressed={active}
                className={`relative rounded-2xl p-2 text-center shadow-lg transition active:scale-[0.98] ${
                  active ? 'ring-2 ring-violet-300 shadow-violet-900/60' : 'ring-1 ring-white/10 hover:ring-white/30'
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

      <Section title={t('style.text')} icon="🔤">
        <Row label={t('style.font')}>
          <div role="radiogroup" aria-label={t('style.font')} className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pe-1">
            {(Object.keys(FONTS) as FontName[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={style.font === f}
                aria-label={f}
                onClick={() => set('font', f)}
                className="ks-choice min-h-14 px-2.5 py-1.5 text-start"
              >
                <span className="block truncate text-lg leading-tight" style={{ fontFamily: `"${f}", Heebo, sans-serif`, fontWeight: FONTS[f] }}>
                  {t('style.fontSample')}
                </span>
                <span className="block truncate text-[11px] text-white/50" dir="ltr">
                  {f}
                </span>
              </button>
            ))}
          </div>
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
        <Row label={t('style.text3d')}>
          <div role="radiogroup" aria-label={t('style.text3d')} className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {TEXT_3D_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={style.text_3d === k}
                onClick={() => set('text_3d', k)}
                className="ks-choice flex min-h-20 flex-col items-center justify-center gap-1.5 px-1 pb-1.5 pt-2 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="text-2xl font-black leading-none"
                  style={{ fontFamily: `"${style.font}", "Heebo", sans-serif`, color: style.text_color, textShadow: text3dShadow(k, style.depth_color) }}
                >
                  שיר
                </span>
                {t(`style.text3d.${k}`)}
              </button>
            ))}
          </div>
          {style.text_3d !== 'none' && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Color label={t('style.depthColor')} value={style.depth_color} onChange={(v) => set('depth_color', v)} />
            </div>
          )}
          <p className="mt-1.5 text-xs text-white/45">{t('style.text3dHint')}</p>
        </Row>
      </Section>

      <Section title={t('style.layout')} icon="🎬">
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
        <Row label={t('style.entrance')}>
          <div role="radiogroup" aria-label={t('style.entrance')} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ENTRANCES.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={style.entrance === e}
                onClick={() => set('entrance', e)}
                className="ks-choice min-h-11 px-2 text-sm"
              >
                {t(`style.entrance.${e}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-white/45">{t('style.entranceHint')}</p>
        </Row>
        <Row label={t('style.countdown')}>
          <div role="radiogroup" aria-label={t('style.countdown')} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {COUNTDOWNS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={style.countdown === c}
                onClick={() => set('countdown', c)}
                className="ks-choice min-h-11 px-2 text-sm"
              >
                {t(`style.countdown.${c}`)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-white/45">{t('style.countdownHint')}</p>
        </Row>
        <Toggle label={t('style.showNext')} checked={style.show_next_line} onChange={(v) => set('show_next_line', v)} />
      </Section>

      <Section title={t('style.background')} icon="🌌">
        <div className="grid grid-cols-2 gap-2">
          <Color label={t('style.bgColor1')} value={style.background_color} onChange={(v) => set('background_color', v)} />
          <Color label={t('style.bgColor2')} value={style.background_color2} onChange={(v) => set('background_color2', v)} />
        </div>
        <AnimatedBackgroundPicker value={style.animated_background} onChange={(v) => set('animated_background', v)} />
      </Section>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <details open className="group rounded-2xl border border-white/10 bg-white/[0.025] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-2xl px-3 py-2 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500/40 to-blue-500/30 text-base">
          {icon}
        </span>
        <h3 className="flex-1 text-sm font-semibold text-white/90">{title}</h3>
        <span aria-hidden="true" className="text-white/40 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-4 px-3 pb-4 pt-1">{children}</div>
    </details>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-white/70">{label}</span>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-white/70">
        {label}
        <span dir="ltr" className="rounded-md bg-white/10 px-1.5 py-0.5 tabular-nums text-white">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ks-range mt-1 w-full"
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </label>
  )
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ks-choice flex cursor-pointer flex-col items-center gap-1.5 p-2 text-center text-xs text-white/75">
      <span className="relative block size-10 overflow-hidden rounded-full shadow-lg ring-2 ring-white/25" style={{ background: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      {label}
      <span dir="ltr" className="font-mono text-[10px] uppercase text-white/40">{value}</span>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ks-choice flex min-h-12 cursor-pointer items-center justify-between gap-3 px-3 text-sm">
      {label}
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden="true"
          className="h-6 w-11 rounded-full bg-white/15 transition peer-checked:bg-gradient-to-r peer-checked:from-violet-500 peer-checked:to-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-300"
        />
        <span
          aria-hidden="true"
          className="absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5"
        />
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={`min-h-11 rounded-lg px-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 ${
            v === value
              ? 'bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-md shadow-violet-900/50'
              : 'text-white/65 hover:bg-white/10 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
