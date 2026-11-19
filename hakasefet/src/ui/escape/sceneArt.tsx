import type { ReactNode } from 'react'
import type { ArtKey, SceneDef } from '../../escape/types'

/**
 * Hand-drawn SVG art for escape-room scenes, in a glowing "computerised" style.
 * Each object is drawn inside its hotspot box (x, y, w, h) on an 800×600 stage.
 */

const GOLD = '#f2c14e'
const TEAL = '#2ec4b6'
const TEAL2 = '#7ee8dc'
const INK = '#08122c'
const FRAME: Record<string, string> = { red: '#e0533f', green: '#3fb36b', blue: '#3f7be0', yellow: '#f2c14e' }

export function SceneDefs() {
  return (
    <defs>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2b4384" />
        <stop offset="1" stopColor="#14214a" />
      </linearGradient>
      <linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffe9a8" />
        <stop offset=".5" stopColor="#f2c14e" />
        <stop offset="1" stopColor="#a87720" />
      </linearGradient>
      <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6b4524" />
        <stop offset="1" stopColor="#3e2512" />
      </linearGradient>
      <radialGradient id="spot" cx=".5" cy="0" r="1">
        <stop offset="0" stopColor="#fff2c4" stopOpacity=".35" />
        <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
      </radialGradient>
      <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse">
        <rect width="50" height="50" fill="#0e1b3d" />
        <path d="M0 0H50V50" fill="none" stroke="#1d3270" strokeWidth="2" />
      </pattern>
      <pattern id="panels" width="100" height="80" patternUnits="userSpaceOnUse">
        <rect width="100" height="80" fill="#111d40" />
        <rect x="4" y="4" width="92" height="72" rx="6" fill="none" stroke="#24407e" strokeWidth="2" />
        <circle cx="12" cy="12" r="2" fill="#3a5aa8" />
        <circle cx="88" cy="68" r="2" fill="#3a5aa8" />
      </pattern>
      <pattern id="velvet" width="40" height="600" patternUnits="userSpaceOnUse">
        <rect width="40" height="600" fill="#3b0f1d" />
        <rect width="3" height="600" fill="#4d1527" />
      </pattern>
      <pattern id="parquet" width="80" height="24" patternUnits="userSpaceOnUse">
        <rect width="80" height="24" fill="#5a3a1e" />
        <path d="M0 23.5H80M40 0V24" stroke="#3e2512" />
      </pattern>
    </defs>
  )
}

export function SceneBackground({ theme }: { theme: SceneDef['theme'] }) {
  if (theme === 'station')
    return (
      <g>
        <rect width="800" height="600" fill="url(#panels)" />
        <rect y="540" width="800" height="60" fill="#0a1430" />
        <path d="M0 540H800" stroke={TEAL} strokeWidth="2" opacity=".6" filter="url(#glow)" />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={40 + i * 90} cy="560" r="3" fill={TEAL2} opacity=".8" />)}
      </g>
    )
  if (theme === 'bunker')
    return (
      <g>
        <rect width="800" height="460" fill="#3a3a3f" />
        {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M0 ${i * 80 + 40}H800`} stroke="#2c2c31" strokeWidth="3" />)}
        <rect y="460" width="800" height="140" fill="#24242a" />
        <path d="M0 460H800" stroke="#f2c14e" strokeWidth="2" opacity=".35" />
        {[160, 400, 640].map((x) => (
          <g key={x}>
            <path d={`M${x} 0V40`} stroke="#111" strokeWidth="2" />
            <circle cx={x} cy="48" r="10" fill="#ffd97a" filter="url(#glow)" />
            <ellipse cx={x} cy="60" rx="120" ry="200" fill="url(#spot)" />
          </g>
        ))}
      </g>
    )
  if (theme === 'hq')
    return (
      <g>
        <rect width="800" height="450" fill="#cbb994" />
        {Array.from({ length: 10 }, (_, i) => Array.from({ length: 6 }, (_, j) => <rect key={`${i}${j}`} x={i * 80 + (j % 2) * 40} y={j * 75} width="78" height="73" fill="none" stroke="#a8946c" strokeWidth="2" />))}
        <rect y="450" width="800" height="150" fill="#6b5a3e" />
        <path d="M0 450H800" stroke="#3e2f1c" strokeWidth="4" />
        <ellipse cx="400" cy="0" rx="300" ry="300" fill="url(#spot)" />
      </g>
    )
  if (theme === 'hut')
    return (
      <g>
        <rect width="800" height="450" fill="#5a3f26" />
        {Array.from({ length: 16 }, (_, i) => <rect key={i} x={i * 50} width="49" height="450" fill={i % 2 ? '#5f4329' : '#553a22'} />)}
        <rect y="450" width="800" height="150" fill="url(#parquet)" />
        <path d="M0 450H800" stroke="#2a180a" strokeWidth="4" />
        <ellipse cx="400" cy="0" rx="320" ry="300" fill="url(#spot)" />
      </g>
    )
  if (theme === 'museum')
    return (
      <g>
        <rect width="800" height="420" fill="url(#velvet)" />
        <rect y="400" width="800" height="20" fill="#2a0b14" />
        <rect y="420" width="800" height="180" fill="url(#parquet)" />
        <path d="M0 400H800" stroke={GOLD} strokeWidth="3" opacity=".7" />
        {[125, 325, 525].map((x) => <ellipse key={x} cx={x} cy="40" rx="140" ry="220" fill="url(#spot)" />)}
      </g>
    )
  return (
    <g>
      <rect width="800" height="600" fill="url(#tiles)" />
      <rect y="440" width="800" height="160" fill="#0a1432" />
      <path d="M0 440H800" stroke={TEAL} strokeWidth="2" opacity=".5" filter="url(#glow)" />
    </g>
  )
}

/** Draws one object inside its box. `active` = opened / powered / revealed. */
export function ObjectArt({ art, w, h, active, variant }: { art: ArtKey; w: number; h: number; active: boolean; variant?: string }): ReactNode {
  const cx = w / 2
  const cy = h / 2
  switch (art) {
    case 'door':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="url(#steel)" stroke={GOLD} strokeWidth="3" />
          <rect x="12" y="14" width={w - 24} height={h * 0.38} rx="4" fill="none" stroke="#3a5aa8" strokeWidth="2" />
          <rect x="12" y={h * 0.5} width={w - 24} height={h * 0.42} rx="4" fill="none" stroke="#3a5aa8" strokeWidth="2" />
          <rect x={w - 34} y={h * 0.44} width="22" height="34" rx="4" fill={INK} stroke={TEAL} strokeWidth="2" />
          <rect x={w - 30} y={h * 0.44 + 6} width="14" height="6" rx="2" fill={active ? TEAL : '#e0533f'} filter="url(#glow)" />
          <text x={cx} y={h - 14} textAnchor="middle" fontSize="14" fill={TEAL2} fontWeight="700">EXIT</text>
        </g>
      )
    case 'clock':
      return (
        <g>
          <circle cx={cx} cy={cy} r={Math.min(w, h) / 2 - 4} fill="#f4f6ff" stroke={GOLD} strokeWidth="6" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6
            const r = Math.min(w, h) / 2 - 14
            return <circle key={i} cx={cx + Math.sin(a) * r} cy={cy - Math.cos(a) * r} r="3" fill={INK} />
          })}
          {(() => {
            const [hh, mm] = (variant ?? '7:45').split(':').map(Number)
            const r = Math.min(w, h) / 2
            const ma = (mm / 60) * Math.PI * 2
            const ha = (((hh % 12) + mm / 60) / 12) * Math.PI * 2
            return (
              <>
                <path d={`M${cx} ${cy}L${cx + Math.sin(ma) * r * 0.62} ${cy - Math.cos(ma) * r * 0.62}`} stroke={INK} strokeWidth="4" strokeLinecap="round" />
                <path d={`M${cx} ${cy}L${cx + Math.sin(ha) * r * 0.4} ${cy - Math.cos(ha) * r * 0.4}`} stroke={INK} strokeWidth="6" strokeLinecap="round" />
              </>
            )
          })()}
          <circle cx={cx} cy={cy} r="5" fill={GOLD} />
        </g>
      )
    case 'trash':
      return (
        <g>
          <path d={`M8 16H${w - 8}L${w - 16} ${h}H16Z`} fill="#2a3f78" stroke={TEAL} strokeWidth="2" />
          <rect x="2" y="6" width={w - 4} height="12" rx="4" fill="#3a5aa8" />
          <circle cx={cx - 10} cy="8" r="9" fill="#e9ecf8" />
          <circle cx={cx + 8} cy="4" r="7" fill="#d9dceb" />
        </g>
      )
    case 'drawer':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="url(#wood)" stroke="#8a5a2e" strokeWidth="3" />
          <rect x="10" y="10" width={w - 20} height={h - 20} rx="4" fill="none" stroke="#2a180a" strokeWidth="2" />
          {active ? <rect x="10" y={h - 18} width={w - 20} height="14" fill={INK} /> : null}
          <rect x={cx - 22} y={cy - 5} width="44" height="10" rx="5" fill="url(#goldg)" />
          {!active && <rect x={cx - 8} y={cy + 8} width="16" height="14" rx="3" fill={INK} stroke={GOLD} strokeWidth="2" />}
        </g>
      )
    case 'terminal':
      return (
        <g>
          <rect width={w} height={h - 30} rx="10" fill="#0d1838" stroke={active ? TEAL : '#3a5aa8'} strokeWidth="4" filter={active ? 'url(#glow)' : undefined} />
          <rect x="14" y="14" width={w - 28} height={h - 58} rx="4" fill={active ? '#06281f' : '#020611'} />
          {active ? (
            <g fill={TEAL2} fontFamily="monospace" fontSize="14">
              <text x={w - 24} y="40" textAnchor="end">{'> נוי־בוט v2.1'}</text>
              <text x={w - 24} y="62" textAnchor="end">{'> ממתין לקלט_'}</text>
              <rect x="24" y={h - 74} width="70" height="6" fill={TEAL} opacity=".7" />
            </g>
          ) : (
            <text x={cx} y={cy - 10} textAnchor="middle" fontSize="13" fill="#3a5aa8">● כבוי</text>
          )}
          <rect x={cx - 20} y={h - 30} width="40" height="16" fill="#1b2f61" />
          <rect x={cx - 60} y={h - 14} width="120" height="10" rx="5" fill="#2a3f78" />
        </g>
      )
    case 'desk-under':
      return (
        <g>
          <rect width={w} height="18" rx="4" fill="url(#wood)" />
          <rect x="10" y="18" width="16" height={h - 18} fill="#3e2512" />
          <rect x={w - 26} y="18" width="16" height={h - 18} fill="#3e2512" />
          <rect x={cx + 30} y="22" width="40" height="22" rx="2" fill="#ffd97a" opacity=".9" />
        </g>
      )
    case 'whiteboard':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill={variant === 'dark' ? '#1f2a24' : '#e9ecf8'} stroke={variant === 'dark' ? '#6b4524' : '#8d9bc4'} strokeWidth="6" />
          <g stroke="#3f7be0" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d={`M${w - 30} 34H${w - 140}`} />
            <path d={`M${w - 30} 64H${w - 110}`} stroke="#e0533f" />
            <path d={`M${w - 30} 94H${w - 150}`} stroke="#3fb36b" />
            <path d={`M${w - 30} 124H${w - 120}`} stroke="#f2c14e" />
            <circle cx="60" cy="80" r="28" />
            <path d="M44 80h32M60 64v32" />
          </g>
        </g>
      )
    case 'mixer': {
      const cols = ['#e0533f', '#3fb36b', '#3f7be0', '#f2c14e']
      return (
        <g>
          <rect y={h - 60} width={w} height="60" rx="8" fill="url(#steel)" stroke={TEAL} strokeWidth="2" />
          {cols.map((c, i) => {
            const x = 22 + i * ((w - 44) / 4) + 10
            return (
              <g key={c}>
                <rect x={x} y="20" width="30" height={h - 90} rx="12" fill="rgba(255,255,255,.08)" stroke="#c9d3f0" strokeWidth="2" />
                <rect x={x + 3} y={active ? 40 : h - 120} width="24" height={active ? h - 113 : 47} rx="10" fill={c} opacity=".9" filter="url(#glow)" />
              </g>
            )
          })}
          <circle cx={cx} cy={h - 30} r="12" fill={active ? TEAL : '#e0533f'} filter="url(#glow)" />
        </g>
      )
    }
    case 'vent':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill={active ? INK : '#2a3f78'} stroke="#8d9bc4" strokeWidth="3" />
          {!active && Array.from({ length: 6 }, (_, i) => <rect key={i} x="14" y={14 + i * ((h - 28) / 6)} width={w - 28} height="6" rx="3" fill="#13224a" />)}
          {[[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill={active ? 'transparent' : '#c9d3f0'} />)}
        </g>
      )
    case 'fusebox':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="#2a3f78" stroke="#8d9bc4" strokeWidth="3" />
          <path d={`M${cx} 18l-12 26h12l-8 24 22-32h-12l8-18z`} fill={active ? GOLD : '#4a5f98'} filter={active ? 'url(#glow)' : undefined} />
          {[0, 1, 2].map((i) => <rect key={i} x={18 + i * ((w - 36) / 3)} y={h - 64} width="20" height="40" rx="4" fill={i === 1 && !active ? INK : '#c9d3f0'} />)}
        </g>
      )
    case 'poster':
      return (
        <g>
          <rect width={w} height={h} fill="#e9ecf8" stroke="#3a5aa8" strokeWidth="3" />
          {Array.from({ length: 18 }, (_, i) => <rect key={i} x={12 + (i % 6) * ((w - 24) / 6)} y={14 + Math.floor(i / 6) * 34} width={(w - 24) / 6 - 4} height="28" fill={['#3f7be0', '#3fb36b', '#f2c14e'][i % 3]} opacity=".5" />)}
          {active && (
            <text x={cx} y={h - 18} textAnchor="middle" fontSize="20" fontWeight="800" fill="#b45cff" filter="url(#glow)">פרויקט אורה</text>
          )}
        </g>
      )
    case 'safe':
      return (
        <g>
          <rect width={w} height={h} rx="12" fill="url(#steel)" stroke="url(#goldg)" strokeWidth="5" />
          {active ? (
            <rect x="14" y="14" width={w - 28} height={h - 28} rx="8" fill={INK} stroke={GOLD} strokeWidth="2" />
          ) : (
            <g>
              <circle cx={cx} cy={cy} r={Math.min(w, h) / 3.2} fill="#0d1838" stroke="url(#goldg)" strokeWidth="5" />
              {[0, 60, 120].map((d) => <rect key={d} x={cx - 3} y={cy - Math.min(w, h) / 4} width="6" height={Math.min(w, h) / 2} rx="3" fill="url(#goldg)" transform={`rotate(${d} ${cx} ${cy})`} />)}
              <circle cx={cx} cy={cy} r="10" fill="url(#goldg)" />
            </g>
          )}
          <rect x="-6" y={h * 0.2} width="10" height="24" rx="3" fill="url(#goldg)" />
          <rect x="-6" y={h * 0.7} width="10" height="24" rx="3" fill="url(#goldg)" />
        </g>
      )
    case 'book':
      return (
        <g>
          <path d={`M4 ${h - 10}L${cx} ${h - 2}L${w - 4} ${h - 10}V10L${cx} 18L4 10Z`} fill="#7a1d14" stroke={GOLD} strokeWidth="2" />
          <path d={`M14 ${h - 18}L${cx} ${h - 10}V24L14 16Z M${w - 14} ${h - 18}L${cx} ${h - 10}V24L${w - 14} 16Z`} fill="#f4ecd8" />
          {[34, 48, 62].map((y) => <path key={y} d={`M24 ${y}H${cx - 10}M${cx + 10} ${y}H${w - 24}`} stroke="#8d7a5a" strokeWidth="2" />)}
        </g>
      )
    case 'starmap':
      return (
        <g>
          <rect width={w} height={h} rx="10" fill="#040a1f" stroke={TEAL} strokeWidth="3" filter="url(#glow)" />
          {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 97) % w} cy={(i * 53) % h} r={i % 4 === 0 ? 2 : 1} fill="#c9d3f0" />)}
          <circle cx={w * 0.22} cy={h * 0.35} r="22" fill="#d9a066" />
          <text x={w * 0.22} y={h * 0.35 + 40} textAnchor="middle" fontSize="13" fill="#c9d3f0">צדק</text>
          <g>
            <ellipse cx={w * 0.5} cy={h * 0.62} rx="34" ry="8" fill="none" stroke="#e8d5a0" strokeWidth="3" />
            <circle cx={w * 0.5} cy={h * 0.62} r="16" fill="#e8d5a0" />
          </g>
          <text x={w * 0.5} y={h * 0.62 + 34} textAnchor="middle" fontSize="13" fill="#c9d3f0">שבתאי</text>
          <circle cx={w * 0.8} cy={h * 0.3} r="14" fill="#e0533f" />
          <text x={w * 0.8} y={h * 0.3 + 32} textAnchor="middle" fontSize="13" fill="#c9d3f0">מאדים</text>
          <path d={`M${w * 0.8 - 40} ${h * 0.3 - 26}l18 12`} stroke={TEAL2} strokeWidth="3" filter="url(#glow)" />
        </g>
      )
    case 'locker':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="#26407a" stroke="#8d9bc4" strokeWidth="3" />
          {[20, 34, 48].map((y) => <rect key={y} x="20" y={y} width={w - 40} height="6" rx="3" fill="#13224a" />)}
          {active ? <rect x="6" y="70" width={w - 12} height={h - 80} fill={INK} /> : null}
          <rect x={cx - 26} y={h * 0.55} width="52" height="26" rx="5" fill={INK} stroke={GOLD} strokeWidth="2" />
          <text x={cx} y={h * 0.55 + 18} textAnchor="middle" fontSize="13" fill={GOLD} fontWeight="700">א·ב·ג</text>
        </g>
      )
    case 'console':
      return (
        <g>
          <path d={`M0 ${h}L20 40H${w - 20}L${w} ${h}Z`} fill="url(#steel)" stroke={TEAL} strokeWidth="2" />
          <rect x="30" y="0" width={w - 60} height="70" rx="6" fill={active ? '#06281f' : '#020611'} stroke={active ? TEAL : '#3a5aa8'} strokeWidth="3" filter={active ? 'url(#glow)' : undefined} />
          {active && <text x={cx} y="42" textAnchor="middle" fontSize="15" fill={TEAL2} fontFamily="monospace">ONLINE</text>}
          {Array.from({ length: 10 }, (_, i) => <rect key={i} x={40 + (i % 5) * ((w - 80) / 5)} y={100 + Math.floor(i / 5) * 26} width="30" height="14" rx="3" fill={['#e0533f', TEAL, GOLD, '#3f7be0', '#3fb36b'][i % 5]} opacity={active ? 0.95 : 0.35} />)}
        </g>
      )
    case 'hatch':
      return (
        <g>
          <rect width={w} height={h} rx={w / 2} fill="url(#steel)" stroke={GOLD} strokeWidth="4" />
          <circle cx={cx} cy={h * 0.32} r={w * 0.28} fill="#040a1f" stroke="#8d9bc4" strokeWidth="4" />
          {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={(i * 37) % (w * 0.4) + cx - w * 0.2} cy={(i * 23) % (w * 0.4) + h * 0.32 - w * 0.2} r="1.5" fill="#c9d3f0" />)}
          <rect x={cx - 34} y={h * 0.62} width="68" height="64" rx="6" fill={INK} stroke={TEAL} strokeWidth="2" />
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={cx - 26 + (i % 3) * 18} y={h * 0.62 + 8 + Math.floor(i / 3) * 18} width="14" height="12" rx="2" fill={TEAL} opacity=".6" />)}
        </g>
      )
    case 'crate':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="#7a5a1e" stroke="#3e2512" strokeWidth="4" />
          <path d={`M0 0L${w} ${h}M${w} 0L0 ${h}`} stroke="#3e2512" strokeWidth="6" opacity=".5" />
          <rect x={cx - 34} y={cy - 22} width="68" height="44" rx="6" fill={INK} stroke={active ? TEAL : GOLD} strokeWidth="3" />
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="18" fill={active ? TEAL2 : GOLD}>{active ? '✓' : '↑↓'}</text>
        </g>
      )
    case 'slot':
      return (
        <g>
          <rect width={w} height={h} rx="10" fill="#0d1838" stroke="#8d9bc4" strokeWidth="3" />
          <rect x={cx - 22} y="20" width="44" height={h - 40} rx="6" fill={INK} stroke={active ? TEAL : '#3a5aa8'} strokeWidth="3" />
          {active && <rect x={cx - 16} y="28" width="32" height={h - 56} rx="4" fill={TEAL} filter="url(#glow)" />}
        </g>
      )
    case 'switches':
      return (
        <g>
          <rect width={w} height={h} rx="8" fill="#0d1838" stroke={active ? TEAL : '#3a5aa8'} strokeWidth="3" />
          {Array.from({ length: 6 }, (_, i) => {
            const x = 18 + i * ((w - 36) / 6)
            const on = active && i % 2 === 1
            return (
              <g key={i}>
                <rect x={x} y="30" width="26" height="60" rx="6" fill="#1b2f61" />
                <rect x={x + 3} y={on ? 34 : 62} width="20" height="24" rx="4" fill={on ? TEAL : '#4a5f98'} filter={on ? 'url(#glow)' : undefined} />
                <text x={x + 13} y="112" textAnchor="middle" fontSize="13" fill="#c9d3f0">{i + 1}</text>
              </g>
            )
          })}
        </g>
      )
    case 'manual':
      return (
        <g>
          <rect width={w} height={h} rx="4" fill="#f4ecd8" stroke="#8d7a5a" strokeWidth="3" />
          <rect x="10" y="10" width={w - 20} height="22" fill="#3f7be0" />
          {[46, 62, 78, 94].map((y) => <path key={y} d={`M20 ${y}H${w - 20}`} stroke="#8d7a5a" strokeWidth="2" />)}
        </g>
      )
    case 'tanks':
      return (
        <g>
          {[0, 1, 2].map((i) => {
            const x = i * (w / 3) + 8
            const tw = w / 3 - 16
            return (
              <g key={i}>
                <rect x={x} y="40" width={tw} height={h - 40} rx={tw / 2} fill="#d9dceb" stroke="#8d9bc4" strokeWidth="2" />
                <rect x={x + tw / 2 - 8} y="20" width="16" height="24" fill="#8d9bc4" />
                <circle cx={x + tw / 2} cy="80" r={tw / 3} fill="#fff" stroke={INK} strokeWidth="2" />
                <text x={x + tw / 2} y="86" textAnchor="middle" fontSize="16" fontWeight="800" fill={INK}>{[12, 7, 23][i]}</text>
              </g>
            )
          })}
        </g>
      )
    case 'painting': {
      const col = FRAME[variant ?? 'red'] ?? GOLD
      return (
        <g>
          <rect width={w} height={h} fill={col} />
          <rect x="10" y="10" width={w - 20} height={h - 20} fill="#1a1a2e" />
          {variant === 'red' && (
            <g>
              <rect x="10" y="10" width={w - 20} height={(h - 20) * 0.6} fill="#f08a4b" />
              <circle cx={cx} cy={h * 0.55} r="22" fill="#ffd166" />
              <rect x="10" y={h * 0.6} width={w - 20} height={h * 0.4 - 10} fill="#7a2e3b" />
            </g>
          )}
          {variant === 'green' && (
            <g>
              <rect x="10" y="10" width={w - 20} height={h - 20} fill="#1d4e6e" />
              <path d={`M10 ${h * 0.7}Q${w * 0.3} ${h * 0.3} ${w * 0.5} ${h * 0.6}T${w - 10} ${h * 0.5}V${h - 10}H10Z`} fill="#e9f3f7" opacity=".85" />
            </g>
          )}
          {variant === 'blue' && (
            <g>
              <rect x="10" y="10" width={w - 20} height={h - 20} fill="#2b2140" />
              {[0.25, 0.5, 0.75].map((f) => <circle key={f} cx={w * f} cy={h * 0.55} r="12" fill="#f2c14e" />)}
              <path d={`M10 ${h * 0.75}H${w - 10}`} stroke="#c9d3f0" strokeWidth="3" />
            </g>
          )}
          <rect x={cx - 26} y={h + 6} width="52" height="14" rx="2" fill="url(#goldg)" />
        </g>
      )
    }
    case 'statues':
      return (
        <g>
          {[0, 1, 2].map((i) => {
            const x = i * (w / 3) + 10
            const sw = w / 3 - 20
            return (
              <g key={i}>
                <rect x={x} y={h - 70} width={sw} height="70" fill="#d9dceb" stroke="#8d9bc4" strokeWidth="2" />
                <text x={x + sw / 2} y={h - 30} textAnchor="middle" fontSize="13" fill={INK} fontWeight="700">{['אריה', 'ורד', 'רקדנית'][i]}</text>
                {i === 0 && <path d={`M${x + 8} ${h - 70}q${sw / 2} -80 ${sw - 16} 0z`} fill="#e9ecf8" />}
                {i === 0 && <circle cx={x + sw / 2} cy={h - 118} r="22" fill="#e9ecf8" />}
                {i === 1 && <path d={`M${x + sw / 2} ${h - 70}V${h - 130}`} stroke="#e9ecf8" strokeWidth="6" />}
                {i === 1 && <circle cx={x + sw / 2} cy={h - 140} r="20" fill="#f4f6ff" />}
                {i === 2 && <path d={`M${x + sw / 2} ${h - 70}l-14 -40 14 -40 14 40z M${x + sw / 2 - 30} ${h - 130}l60 -10`} fill="#f4f6ff" stroke="#f4f6ff" strokeWidth="5" />}
                {i === 2 && <circle cx={x + sw / 2} cy={h - 160} r="12" fill="#f4f6ff" />}
              </g>
            )
          })}
        </g>
      )
    case 'showcase':
      return (
        <g>
          <rect x="10" y={h * 0.55} width={w - 20} height={h * 0.45} fill="url(#wood)" />
          <rect x="0" y="0" width={w} height={h * 0.55} rx="6" fill="rgba(126,232,220,.08)" stroke="#c9d3f0" strokeWidth="2" />
          {!active && [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => <path key={f} d={`M-10 ${h * f}L${w + 10} ${h * f - 30}`} stroke="#ff3b3b" strokeWidth="2" filter="url(#glow)" />)}
          <rect x={cx - 24} y={h * 0.62} width="48" height="22" rx="4" fill={INK} stroke={GOLD} strokeWidth="2" />
          {[0, 1, 2].map((i) => <circle key={i} cx={cx - 12 + i * 12} cy={h * 0.62 + 11} r="4" fill={['#e0533f', '#3f7be0', '#3fb36b'][i]} />)}
          {active && <text x={cx} y={h * 0.32} textAnchor="middle" fontSize="34">🔍</text>}
        </g>
      )
    case 'owl':
      return (
        <g>
          <rect x="10" y={h - 30} width={w - 20} height="30" fill="#6b4524" />
          <ellipse cx={cx} cy={h * 0.5} rx={w * 0.34} ry={h * 0.32} fill="#a87720" stroke="url(#goldg)" strokeWidth="3" />
          <circle cx={cx - 14} cy={h * 0.38} r="12" fill="#fff2c4" />
          <circle cx={cx + 14} cy={h * 0.38} r="12" fill="#fff2c4" />
          <circle cx={cx - 14} cy={h * 0.38} r="5" fill={INK} />
          <circle cx={cx + 14} cy={h * 0.38} r="5" fill={INK} />
          <path d={`M${cx - 5} ${h * 0.46}l5 8 5 -8z`} fill={GOLD} />
          {active && <circle cx={cx} cy={h - 15} r="6" fill={TEAL2} filter="url(#glow)" />}
        </g>
      )
    case 'cabinet':
      return (
        <g>
          <rect width={w} height={h} rx="6" fill="url(#wood)" stroke="#2a180a" strokeWidth="3" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="10" y={10 + i * ((h - 20) / 3)} width={w - 20} height={(h - 20) / 3 - 8} rx="4" fill={active && i === 1 ? INK : '#5a3a1e'} stroke="#2a180a" strokeWidth="2" />
              <rect x={cx - 16} y={10 + i * ((h - 20) / 3) + ((h - 20) / 3 - 8) / 2 - 4} width="32" height="8" rx="4" fill="url(#goldg)" />
            </g>
          ))}
          <rect x={cx - 20} y={h * 0.08} width="40" height="18" rx="3" fill={INK} stroke={GOLD} />
          <text x={cx} y={h * 0.08 + 14} textAnchor="middle" fontSize="11" fill={GOLD}>↔↕</text>
        </g>
      )
    case 'radio':
      return (
        <g>
          <rect width={w} height={h} rx="14" fill="url(#wood)" stroke="#2a180a" strokeWidth="3" />
          <rect x="12" y="12" width={w * 0.5} height={h - 24} rx="8" fill="#c9b37a" />
          {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M18 ${20 + i * ((h - 40) / 5)}H${w * 0.5 + 6}`} stroke="#8d7a5a" strokeWidth="2" />)}
          <circle cx={w * 0.78} cy={h * 0.35} r={Math.min(w, h) * 0.16} fill="#1a1208" stroke="url(#goldg)" strokeWidth="3" />
          <path d={`M${w * 0.78} ${h * 0.35}l${Math.min(w, h) * 0.12} -${Math.min(w, h) * 0.06}`} stroke="#ffd97a" strokeWidth="3" />
          <circle cx={w * 0.68} cy={h * 0.75} r="8" fill="url(#goldg)" />
          <circle cx={w * 0.88} cy={h * 0.75} r="8" fill="url(#goldg)" />
          {active && <circle cx={w * 0.58} cy={h * 0.15} r="5" fill={TEAL} filter="url(#glow)" />}
        </g>
      )
    case 'typewriter':
      return (
        <g>
          <rect x="10" y={h * 0.35} width={w - 20} height={h * 0.62} rx="10" fill="#1a1a22" stroke="#555" strokeWidth="2" />
          <rect x="30" y={h * 0.12} width={w - 60} height={h * 0.2} rx="8" fill="#2b2b33" />
          <rect x={w * 0.2} y="0" width={w * 0.6} height={h * 0.25} fill="#f4ecd8" />
          {[0.06, 0.12, 0.18].map((f) => <path key={f} d={`M${w * 0.25} ${h * f}H${w * 0.75}`} stroke="#8d7a5a" strokeWidth="1.5" />)}
          {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={30 + (i % 8) * ((w - 60) / 7)} cy={h * 0.5 + Math.floor(i / 8) * (h * 0.13)} r="6" fill="#e9ecf8" stroke="#888" />)}
        </g>
      )
    case 'map': {
      if (variant === 'sea' || variant === 'world') {
        const rows = ['א', 'ב', 'ג', 'ד', 'ה']
        return (
          <g>
            <rect width={w} height={h} fill="#cfe3ea" stroke="#6b4524" strokeWidth="6" />
            <path d={`M${w * 0.78} 0C${w * 0.7} ${h * 0.3} ${w * 0.95} ${h * 0.5} ${w * 0.8} ${h}H${w}V0Z`} fill="#d8c79a" />
            <path d={`M0 ${h * 0.1}C${w * 0.15} ${h * 0.3} ${w * 0.05} ${h * 0.6} ${w * 0.18} ${h}H0Z`} fill="#d8c79a" />
            {variant === 'sea' &&
              rows.map((r, i) => (
                <g key={r}>
                  <path d={`M0 ${(i + 1) * (h / 5)}H${w}`} stroke="#5b7f99" strokeWidth="1" opacity=".6" />
                  <text x={w - 10} y={i * (h / 5) + 18} fontSize="13" fontWeight="800" fill="#2a4a66" textAnchor="end">{r}</text>
                </g>
              ))}
            {variant === 'sea' &&
              Array.from({ length: 8 }, (_, i) => (
                <g key={i}>
                  <path d={`M${w - (i + 1) * (w / 8)} 0V${h}`} stroke="#5b7f99" strokeWidth="1" opacity=".6" />
                  <text x={w - i * (w / 8) - w / 16} y={h - 6} fontSize="12" fontWeight="800" fill="#2a4a66" textAnchor="middle">{i + 1}</text>
                </g>
              ))}
            {[0.3, 0.45, 0.6].map((f, i) => <circle key={f} cx={w * f} cy={h * (0.35 + i * 0.12)} r="6" fill="#e0533f" stroke="#7a1d14" />)}
          </g>
        )
      }
      return (
        <g>
          <rect width={w} height={h} fill="#e8d9b0" stroke="#6b4524" strokeWidth="6" />
          <path d={`M10 ${h * 0.7}Q${w * 0.3} ${h * 0.4} ${w * 0.5} ${h * 0.55}T${w - 10} ${h * 0.3}`} fill="none" stroke="#8d7a5a" strokeWidth="2" />
          <path d={`M${w * 0.1} ${h * 0.2}C${w * 0.3} ${h * 0.3} ${w * 0.4} ${h * 0.1} ${w * 0.6} ${h * 0.25}`} fill="none" stroke="#3f7be0" strokeWidth="3" />
          {[0.25, 0.5, 0.75].map((f, i) => (
            <g key={f}>
              <path d={`M${w * 0.08} ${h * 0.85}Q${w * f} ${h * (0.3 + i * 0.15)} ${w * 0.92} ${h * 0.15}`} fill="none" stroke={['#e0533f', '#c97a2b', '#2f8f5b'][i]} strokeWidth="3" strokeDasharray={i === 2 ? '8 6' : undefined} />
              <circle cx={w * f} cy={h * (0.45 + i * 0.07)} r="11" fill="#f4ecd8" stroke="#3e2512" />
              <text x={w * f} y={h * (0.45 + i * 0.07) + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#3e2512">{i + 1}</text>
            </g>
          ))}
          {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M0 ${(i + 1) * (h / 6)}H${w}`} stroke="#b9a777" strokeWidth=".8" />)}
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${(i + 1) * (w / 8)} 0V${h}`} stroke="#b9a777" strokeWidth=".8" />)}
        </g>
      )
    }
    case 'machine':
      return (
        <g>
          <rect x="10" y={h * 0.2} width={w - 20} height={h * 0.8} rx="10" fill="#4a5a6a" stroke="#22303c" strokeWidth="4" />
          {Array.from({ length: 9 }, (_, i) => {
            const c = { x: 50 + (i % 3) * ((w - 100) / 2), y: h * 0.35 + Math.floor(i / 3) * (h * 0.18) }
            return (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={Math.min(w, h) * 0.07} fill="#2b2b33" stroke="#9aa4b4" strokeWidth="3" />
                <path d={`M${c.x} ${c.y}l${Math.min(w, h) * 0.05} 0`} stroke={GOLD} strokeWidth="3" />
              </g>
            )
          })}
          <rect x={w * 0.3} y="0" width={w * 0.4} height={h * 0.22} rx="6" fill="#2b2b33" stroke="#9aa4b4" strokeWidth="2" />
          {[0, 1, 2].map((i) => <circle key={i} cx={w * 0.38 + i * w * 0.12} cy={h * 0.1} r="7" fill={active ? TEAL : '#e0533f'} filter="url(#glow)" />)}
          {active && <rect x="10" y={h * 0.2} width={w - 20} height={h * 0.8} rx="10" fill="#6b5a3e" opacity=".85" />}
        </g>
      )
    case 'phone':
      return (
        <g>
          <path d={`M${w * 0.15} ${h * 0.4}H${w * 0.85}L${w * 0.95} ${h}H${w * 0.05}Z`} fill="#141414" stroke="#444" strokeWidth="2" />
          <circle cx={cx} cy={h * 0.72} r={Math.min(w, h) * 0.18} fill="#e9ecf8" stroke="#444" strokeWidth="2" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2
            return <circle key={i} cx={cx + Math.cos(a) * Math.min(w, h) * 0.12} cy={h * 0.72 + Math.sin(a) * Math.min(w, h) * 0.12} r="3" fill="#141414" />
          })}
          <path d={`M${w * 0.08} ${h * 0.32}Q${cx} ${h * 0.05} ${w * 0.92} ${h * 0.32}`} fill="none" stroke="#141414" strokeWidth={h * 0.14} strokeLinecap="round" />
        </g>
      )
    case 'lamp':
      if (variant === 'signal')
        return (
          <g>
            <rect x={cx - 8} y="0" width="16" height={h * 0.3} fill="#333" />
            <path d={`M${cx - w * 0.4} ${h * 0.3}H${cx + w * 0.4}L${cx + w * 0.3} ${h}H${cx - w * 0.3}Z`} fill="#222" stroke="#555" strokeWidth="2" />
            <circle cx={cx} cy={h * 0.65} r={w * 0.28} fill={active ? '#3fb36b' : '#ff2a2a'} filter="url(#glow)" />
          </g>
        )
      return (
        <g>
          <rect x={cx - 4} y={h * 0.3} width="8" height={h * 0.65} fill="#9aa4b4" />
          <ellipse cx={cx} cy={h - 6} rx={w * 0.35} ry="8" fill="#555" />
          <path d={`M${cx - w * 0.45} ${h * 0.32}L${cx - w * 0.25} 0H${cx + w * 0.25}L${cx + w * 0.45} ${h * 0.32}Z`} fill="#c9d3f0" stroke="#666" strokeWidth="2" />
          <ellipse cx={cx} cy={h * 0.33} rx={w * 0.3} ry="8" fill={active ? '#fff2c4' : '#555'} filter={active ? 'url(#glow)' : undefined} />
        </g>
      )
    case 'ladder':
      return (
        <g>
          <rect x={w * 0.15} y="0" width="10" height={h} fill="#8a6a3a" />
          <rect x={w * 0.85 - 10} y="0" width="10" height={h} fill="#8a6a3a" />
          {Array.from({ length: Math.floor(h / 45) }, (_, i) => <rect key={i} x={w * 0.15} y={20 + i * 45} width={w * 0.7} height="8" fill="#a07d45" />)}
          <rect x="0" y="0" width={w} height="14" fill="#555" />
          {active && <rect x={w * 0.1} y="0" width={w * 0.8} height="10" fill={TEAL} filter="url(#glow)" />}
        </g>
      )
    case 'calendar':
      return (
        <g>
          <rect width={w} height={h} fill="#f4f6ff" stroke="#8d9bc4" strokeWidth="3" />
          <rect width={w} height={h * 0.22} fill="#c0392b" />
          {Array.from({ length: 28 }, (_, i) => <rect key={i} x={8 + (i % 7) * ((w - 16) / 7)} y={h * 0.3 + Math.floor(i / 7) * ((h * 0.65) / 4)} width={(w - 16) / 7 - 3} height={(h * 0.65) / 4 - 4} fill="#e9ecf8" />)}
          <circle cx={8 + 3 * ((w - 16) / 7) + (w - 16) / 14} cy={h * 0.3 + ((h * 0.65) / 4) * 1.5} r={(w - 16) / 10} fill="none" stroke="#e0533f" strokeWidth="3" />
        </g>
      )
    case 'enigma':
      return (
        <g>
          <rect y={h * 0.1} width={w} height={h * 0.9} rx="8" fill="url(#wood)" stroke="#2a180a" strokeWidth="3" />
          <rect x="12" y={h * 0.18} width={w - 24} height={h * 0.25} rx="4" fill="#1a1a22" />
          {[0.35, 0.5, 0.65].map((f, i) => (
            <g key={f}>
              <rect x={w * f - 10} y={h * 0.2} width="20" height={h * 0.2} rx="4" fill="#c9b37a" />
              <text x={w * f} y={h * 0.34} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1a1208">{active ? ['ד', 'ג', 'ם'][i] : '?'}</text>
            </g>
          ))}
          {Array.from({ length: 18 }, (_, i) => <circle key={i} cx={20 + (i % 9) * ((w - 40) / 8)} cy={h * 0.58 + Math.floor(i / 9) * (h * 0.15)} r="6" fill={active && i % 5 === 0 ? '#ffd97a' : '#2b2b33'} filter={active && i % 5 === 0 ? 'url(#glow)' : undefined} />)}
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={20 + i * ((w - 40) / 8)} cy={h * 0.9} r="5" fill="#e9ecf8" />)}
        </g>
      )
    case 'jewelbox':
      return (
        <g>
          <rect y={h * 0.35} width={w} height={h * 0.65} rx="6" fill="#4d1527" stroke="url(#goldg)" strokeWidth="3" />
          <path d={`M0 ${h * 0.4}Q${cx} ${active ? -h * 0.5 : 0} ${w} ${h * 0.4}`} fill="#6b1f36" stroke="url(#goldg)" strokeWidth="3" />
          {active && <circle cx={cx} cy={h * 0.45} r="8" fill={TEAL2} filter="url(#glow)" />}
          <rect x={cx - 20} y={h * 0.6} width="40" height="18" rx="3" fill={INK} stroke={GOLD} />
          <text x={cx} y={h * 0.6 + 14} textAnchor="middle" fontSize="11" fill={GOLD}>א·ב</text>
        </g>
      )
  }
}
