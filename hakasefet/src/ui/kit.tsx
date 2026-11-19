import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({ open, title, children, onClose, labelledBy = 'modal-title' }: { open: boolean; title: string; children: ReactNode; onClose: () => void; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the effect: callers pass a new
  // function on every render (the game re-renders twice a second for its
  // timer), and re-running would steal focus from text fields — which closed
  // the phone keyboard while typing.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    // focus once, when the dialog opens; a field that already has focus keeps it
    if (!el?.contains(document.activeElement)) el?.querySelector<HTMLElement>('[data-autofocus], input, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])')]
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          last.focus()
          e.preventDefault()
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus()
          e.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="card anim-rise max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={labelledBy} className="text-xl font-extrabold">{title}</h2>
          <button className="btn btn-ghost !min-h-10 !px-3" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ProgressBar({ value, label, color = 'gold' }: { value: number; label: string; color?: 'gold' | 'teal' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 w-full overflow-hidden rounded-full bg-black/40">
      <div className={`h-full rounded-full transition-all duration-700 ${color === 'gold' ? 'bg-gradient-to-l from-gold-2 to-gold' : 'bg-gradient-to-l from-teal-2 to-teal'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(id)
  }, [message, onDone])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      {message && <div className="anim-pop rounded-full bg-teal px-5 py-3 font-bold text-ink shadow-xl">{message}</div>}
    </div>
  )
}

export function Loading({ text = 'טוען…' }: { text?: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mist">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
      <p>{text}</p>
    </div>
  )
}

export function ErrorBox({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div role="alert" className="card mx-auto my-8 max-w-md p-6 text-center">
      <div className="mb-2 text-4xl" aria-hidden="true">🔒</div>
      <h2 className="mb-2 text-xl font-extrabold">{title}</h2>
      <p className="mb-4 text-mist">{text}</p>
      {action}
    </div>
  )
}

/**
 * Pointer-driven 3D tilt with a soft glare. Respects reduced motion
 * (the CSS kills the transition and we skip updates).
 */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = () => document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const move = (e: PointerEvent) => {
      if (reduced() || e.pointerType === 'touch') return
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      el.style.setProperty('--ry', `${(x - 0.5) * max}deg`)
      el.style.setProperty('--rx', `${(0.5 - y) * max}deg`)
      el.style.setProperty('--gx', `${x * 100}%`)
      el.style.setProperty('--gy', `${y * 100}%`)
    }
    const leave = () => {
      el.style.setProperty('--ry', '0deg')
      el.style.setProperty('--rx', '0deg')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [max])
  return ref
}

/** A card that tilts in 3D under the pointer. */
export function TiltCard({ className = '', children, max = 6, ...rest }: React.HTMLAttributes<HTMLDivElement> & { max?: number }) {
  const ref = useTilt<HTMLDivElement>(max)
  return (
    <div ref={ref} className={`card tilt ${className}`} {...rest}>
      <div className="tilt-glare" aria-hidden="true" />
      {children}
    </div>
  )
}
