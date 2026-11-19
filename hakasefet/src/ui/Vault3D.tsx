import { useEffect, useRef, useState } from 'react'
import { Vault } from './art'

/**
 * 3D vault (WebGL). three.js loads lazily, so the first screen stays fast; the
 * SVG vault shows while it loads and remains as the fallback without WebGL.
 */
export function Vault3D({ open = false, showcase = false, className = 'h-56 w-full', label }: { open?: boolean; showcase?: boolean; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<{ open(): void; dispose(): void } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el) return
    const reducedMotion =
      document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    import('./three/vaultScene')
      .then(({ createVaultScene, webglAvailable }) => {
        if (cancelled) return
        if (!webglAvailable()) return setState('fallback')
        handle.current = createVaultScene(el, { open: openRef.current, reducedMotion, showcase })
        setState('ready')
      })
      .catch(() => !cancelled && setState('fallback'))
    return () => {
      cancelled = true
      handle.current?.dispose()
      handle.current = null
    }
  }, [showcase])

  useEffect(() => {
    if (open) handle.current?.open()
  }, [open, state])

  const aria = label ?? (open ? 'הכספת נפתחת' : 'כספת נעולה')
  return (
    <div className={`relative ${className}`} role="img" aria-label={aria}>
      <div ref={ref} className="absolute inset-0" data-testid="vault-3d" data-state={state} />
      {state !== 'ready' && (
        <div className={`absolute inset-0 grid place-items-center transition-opacity ${state === 'loading' ? 'opacity-60' : ''}`} aria-hidden="true">
          <Vault size={150} opening={open} label="" />
        </div>
      )}
    </div>
  )
}
