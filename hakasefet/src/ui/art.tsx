import type { Category } from '../content/types'

/** Hand-made SVG art for the game: vault, key, room doors. */

export function Vault({ size = 180, opening = false, label }: { size?: number; opening?: boolean; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={label ?? (opening ? 'הכספת נפתחת' : 'כספת נעולה')}
      className={opening ? 'vault-opening' : undefined}
    >
      <defs>
        <linearGradient id="vbody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b4384" />
          <stop offset="1" stopColor="#14214a" />
        </linearGradient>
        <linearGradient id="vgold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset=".5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#a87720" />
        </linearGradient>
        <radialGradient id="vlight">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset=".6" stopColor="#f2c14e" stopOpacity=".6" />
          <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* body */}
      <rect x="18" y="18" width="164" height="164" rx="22" fill="url(#vbody)" stroke="url(#vgold)" strokeWidth="5" />
      {/* inside (visible when open) */}
      <rect x="34" y="34" width="132" height="132" rx="14" fill="#060c22" />
      <g className="vault-burst" opacity={opening ? undefined : 0}>
        <circle cx="100" cy="100" r="70" fill="url(#vlight)" />
      </g>
      <text x="100" y="118" textAnchor="middle" fontSize="44" opacity={opening ? 1 : 0}>💎</text>
      {/* door */}
      <g className="vault-door">
        <rect x="30" y="30" width="140" height="140" rx="16" fill="#1f3470" stroke="#f2c14e" strokeWidth="3" />
        <rect x="40" y="40" width="120" height="120" rx="12" fill="none" stroke="#2f4a92" strokeWidth="2" />
        {/* hinges */}
        <rect x="24" y="52" width="10" height="22" rx="3" fill="url(#vgold)" />
        <rect x="24" y="126" width="10" height="22" rx="3" fill="url(#vgold)" />
        {/* dial */}
        <g className="vault-dial">
          <circle cx="100" cy="100" r="34" fill="#0d1838" stroke="url(#vgold)" strokeWidth="5" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6
            return <line key={i} x1={100 + Math.cos(a) * 24} y1={100 + Math.sin(a) * 24} x2={100 + Math.cos(a) * 30} y2={100 + Math.sin(a) * 30} stroke="#f2c14e" strokeWidth="2" />
          })}
          <circle cx="100" cy="100" r="10" fill="url(#vgold)" />
          <rect x="97" y="70" width="6" height="16" rx="3" fill="#ffe9a8" />
        </g>
        {/* handle */}
        <rect x="146" y="88" width="10" height="24" rx="4" fill="url(#vgold)" />
      </g>
    </svg>
  )
}

export function KeyArt({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="kgold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0bd" />
          <stop offset=".55" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#a87720" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="22" r="13" fill="none" stroke="url(#kgold)" strokeWidth="6" />
      <path d="M29 31 L54 56 M44 46 L50 40 M49 51 L54 46" stroke="url(#kgold)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function RoomIcon({ category, size = 56 }: { category: Category; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0d1838" stroke="#f2c14e" strokeWidth="2" />
      {category === 'sports' && (
        <g>
          <circle cx="32" cy="32" r="16" fill="#f4f6ff" />
          <path d="M32 22 l7 5 -3 8 h-8 l-3 -8z" fill="#13224a" />
          <path d="M32 16v6 M45 27l-6 0 M42 44l-5-6 M22 44l5-6 M19 27h6" stroke="#13224a" strokeWidth="2" />
        </g>
      )}
      {category === 'music' && (
        <g fill="#2ec4b6">
          <path d="M26 18 L46 14 V40" stroke="#2ec4b6" strokeWidth="4" fill="none" />
          <path d="M26 18 V44" stroke="#2ec4b6" strokeWidth="4" />
          <ellipse cx="21" cy="45" rx="7" ry="5.5" />
          <ellipse cx="41" cy="41" rx="7" ry="5.5" />
        </g>
      )}
      {category === 'general' && (
        <g>
          <circle cx="32" cy="32" r="16" fill="#1b5f8f" stroke="#7ee8dc" strokeWidth="2" />
          <path d="M16 32h32 M32 16c-8 8-8 24 0 32 M32 16c8 8 8 24 0 32" stroke="#7ee8dc" strokeWidth="2" fill="none" />
          <path d="M22 22c4 3 6 2 9 4s1 6 4 7 5-1 7 1" stroke="#f2c14e" strokeWidth="2.5" fill="none" />
        </g>
      )}
    </svg>
  )
}

export function Coin({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#f2c14e" stroke="#a87720" strokeWidth="1.5" />
      <path d="M7 6.5h6M7 13.5h6M10 6.5v7" stroke="#7a5310" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Confetti() {
  const colors = ['#f2c14e', '#2ec4b6', '#ff7a6b', '#7ee8dc', '#ffd97a']
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 block h-2.5 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${1.6 + (i % 7) * 0.08}s` }}
        />
      ))}
    </div>
  )
}
