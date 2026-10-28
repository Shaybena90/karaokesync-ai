import { Link } from 'react-router-dom'

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ks-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ks-logo)" />
      <rect x="24" y="11" width="16" height="27" rx="8" fill="#fff" />
      <path d="M17 31a15 15 0 0 0 30 0" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46v7M24 53h16" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 rounded-xl" aria-label="KaraokeSync AI">
      <LogoMark />
      {/* Brand name is always LTR, even inside the RTL layout */}
      <span dir="ltr" className="font-display text-base font-bold tracking-tight whitespace-nowrap sm:text-lg">
        KaraokeSync <span className="text-gradient">AI</span>
      </span>
    </Link>
  )
}
