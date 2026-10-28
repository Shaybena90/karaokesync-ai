import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'
const variants = {
  primary:
    'bg-gradient-to-l from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-blue-500',
  ghost: 'glass text-white hover:bg-white/10',
  danger: 'border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20',
}
type Variant = keyof typeof variants

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 sm:p-7 ${className}`}>{children}</div>
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const tones = {
    error: 'border-red-400/30 bg-red-500/10 text-red-100',
    info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-gradient-to-l from-violet-500 to-sky-400 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
