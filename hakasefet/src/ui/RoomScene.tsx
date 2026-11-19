/** The personal room, drawn in SVG from the equipped items (slot → item id). */
export function RoomScene({ equipped, avatar, className }: { equipped: Record<string, string>; avatar?: string; className?: string }) {
  const wall = equipped.wall ?? 'wall-night'
  const floor = equipped.floor ?? 'floor-wood'
  return (
    <svg viewBox="0 0 320 220" className={className} role="img" aria-label="תצוגה של החדר שלי">
      <defs>
        <pattern id="stars" width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="#162a5c" />
          <circle cx="6" cy="7" r="1.4" fill="#ffe9a8" />
          <circle cx="20" cy="18" r="1" fill="#7ee8dc" />
          <path d="M18 5l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L15 7.3l2-.3z" fill="#f2c14e" />
        </pattern>
        <pattern id="gstripes" width="24" height="10" patternUnits="userSpaceOnUse">
          <rect width="24" height="10" fill="#1b2f61" />
          <rect width="6" height="10" fill="#f2c14e" opacity=".35" />
        </pattern>
        <pattern id="wood" width="40" height="12" patternUnits="userSpaceOnUse">
          <rect width="40" height="12" fill="#6b4524" />
          <path d="M0 11.5h40M20 0v12" stroke="#4e3119" strokeWidth="1" />
        </pattern>
        <pattern id="checker" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#e9ecf8" />
          <rect width="12" height="12" fill="#1b2f61" />
          <rect x="12" y="12" width="12" height="12" fill="#1b2f61" />
        </pattern>
        <radialGradient id="lampglow">
          <stop offset="0" stopColor="#fff2c4" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* wall */}
      <rect width="320" height="160" fill={wall === 'wall-stars' ? 'url(#stars)' : wall === 'wall-gold' ? 'url(#gstripes)' : '#13224a'} />
      {/* floor */}
      <path d="M0 160 H320 V220 H0Z" fill={floor === 'floor-checker' ? 'url(#checker)' : 'url(#wood)'} />
      <rect y="156" width="320" height="6" fill="#0a1430" />

      {/* window */}
      {equipped.window && (
        <g>
          <rect x="196" y="26" width="92" height="72" rx="6" fill={equipped.window === 'window-sea' ? '#3aa6c9' : '#08122c'} stroke="#f2c14e" strokeWidth="4" />
          {equipped.window === 'window-sea' ? (
            <g>
              <circle cx="260" cy="48" r="9" fill="#ffe08a" />
              <path d="M198 74c10-6 20 6 30 0s20 6 30 0 20 6 28 0v22h-88z" fill="#1d6fa0" />
            </g>
          ) : (
            <g fill="#f2c14e">
              <rect x="206" y="64" width="14" height="32" fill="#1b2f61" />
              <rect x="224" y="52" width="18" height="44" fill="#22386f" />
              <rect x="246" y="70" width="12" height="26" fill="#1b2f61" />
              <rect x="262" y="58" width="18" height="38" fill="#22386f" />
              <rect x="228" y="58" width="3" height="3" />
              <rect x="235" y="66" width="3" height="3" />
              <rect x="266" y="64" width="3" height="3" />
              <rect x="272" y="74" width="3" height="3" />
              <circle cx="212" cy="38" r="5" fill="#fff6cf" />
            </g>
          )}
          <path d="M242 26v72M196 62h92" stroke="#f2c14e" strokeWidth="3" />
        </g>
      )}

      {/* poster */}
      {equipped.poster && (
        <g>
          <rect x="36" y="28" width="64" height="78" rx="4" fill="#0a1430" stroke="#f2c14e" strokeWidth="3" />
          {equipped.poster === 'poster-vault' ? (
            <g>
              <rect x="48" y="44" width="40" height="40" rx="6" fill="#1f3470" stroke="#f2c14e" strokeWidth="2" />
              <circle cx="68" cy="64" r="10" fill="none" stroke="#f2c14e" strokeWidth="3" />
              <text x="68" y="98" fontSize="9" fill="#ffe9a8" textAnchor="middle">הכספת</text>
            </g>
          ) : (
            <g stroke="#7ee8dc" strokeWidth="1.5">
              {[48, 56, 64, 72, 80].map((y) => <line key={y} x1="44" y1={y} x2="92" y2={y} />)}
              <circle cx="56" cy="76" r="4" fill="#7ee8dc" />
              <circle cx="76" cy="64" r="4" fill="#7ee8dc" />
              <path d="M60 76V50M80 64V44" />
            </g>
          )}
        </g>
      )}

      {/* shelf */}
      {equipped.shelf && (
        <g>
          <rect x="112" y="92" width="70" height="6" rx="2" fill="#8a5a2e" />
          <path d="M126 92v-14h10v14M128 78c-4 0-6-6-2-8h10c4 2 2 8-2 8" fill="#f2c14e" />
          <path d="M150 92v-20h12v20M151 72c-5 0-7-8-2-10h14c5 2 3 10-2 10" fill="#d9d9e6" />
          <circle cx="174" cy="86" r="6" fill="#ff7a6b" />
        </g>
      )}

      {/* rug */}
      {equipped.rug && (
        equipped.rug === 'rug-royal' ? (
          <g>
            <rect x="96" y="176" width="128" height="34" rx="6" fill="#8e1f2f" stroke="#f2c14e" strokeWidth="3" />
            <rect x="108" y="183" width="104" height="20" rx="4" fill="none" stroke="#f2c14e" strokeWidth="1.5" strokeDasharray="4 3" />
          </g>
        ) : (
          <ellipse cx="160" cy="194" rx="70" ry="16" fill="#2ec4b6" stroke="#7ee8dc" strokeWidth="3" />
        )
      )}

      {/* lamp */}
      {equipped.lamp === 'lamp-desk' && (
        <g>
          <circle cx="40" cy="140" r="40" fill="url(#lampglow)" />
          <rect x="34" y="150" width="12" height="6" fill="#f2c14e" />
          <path d="M40 150V124" stroke="#f2c14e" strokeWidth="3" />
          <path d="M28 126h24l-6-14H34z" fill="#ffd97a" />
        </g>
      )}
      {equipped.lamp === 'lamp-chandelier' && (
        <g>
          <circle cx="160" cy="30" r="46" fill="url(#lampglow)" />
          <path d="M160 0v16" stroke="#f2c14e" strokeWidth="2" />
          <path d="M136 22q24 14 48 0" stroke="#f2c14e" strokeWidth="3" fill="none" />
          {[136, 148, 160, 172, 184].map((x) => (
            <g key={x}>
              <rect x={x - 2} y="18" width="4" height="8" fill="#fff" />
              <path d={`M${x} 12q3 3 0 6q-3-3 0-6`} fill="#ffcf5a" />
            </g>
          ))}
        </g>
      )}

      {/* plant */}
      {equipped.plant === 'plant-cactus-mini' && (
        <g>
          <path d="M268 156l-4-16h28l-4 16z" fill="#c4683b" />
          <rect x="272" y="112" width="12" height="30" rx="6" fill="#3fa36b" />
          <rect x="262" y="120" width="8" height="14" rx="4" fill="#3fa36b" />
          <rect x="286" y="116" width="8" height="12" rx="4" fill="#3fa36b" />
        </g>
      )}
      {equipped.plant === 'plant-monstera' && (
        <g>
          <path d="M262 156l-6-20h40l-6 20z" fill="#e9ecf8" />
          <path d="M276 136c-20-6-26-28-12-36 6 10 10 22 12 36z M276 136c4-22 14-36 30-34-2 16-14 28-30 34z M276 136c-2-26 4-42 2-52 12 8 10 32-2 52z" fill="#2f8f5b" />
        </g>
      )}

      {/* avatar */}
      {avatar && (
        <text x="160" y="186" fontSize="40" textAnchor="middle" aria-hidden="true">{avatar}</text>
      )}
    </svg>
  )
}
