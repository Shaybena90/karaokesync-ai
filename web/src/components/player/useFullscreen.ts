import { useCallback, useEffect, useState, type RefObject } from 'react'

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }

/**
 * Real fullscreen where the browser supports it for any element (desktop,
 * Android, iPad). iPhone Safari only allows fullscreen for <video>, so there
 * we fall back to a fixed full-viewport layout ("pseudo" fullscreen).
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false)
  const [pseudo, setPseudo] = useState(false)

  useEffect(() => {
    const doc = document as FsDocument
    const onChange = () => setNative(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // Pseudo mode: lock page scroll and allow Escape to leave.
  useEffect(() => {
    if (!pseudo) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPseudo(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [pseudo])

  const toggle = useCallback(async () => {
    const doc = document as FsDocument
    const el = ref.current as FsElement | null
    if (!el) return
    if (native) {
      await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      return
    }
    if (pseudo) {
      setPseudo(false)
      return
    }
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      else setPseudo(true)
    } catch {
      setPseudo(true)
    }
  }, [ref, native, pseudo])

  return { isFullscreen: native || pseudo, pseudo, toggle }
}
