import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

export interface BackgroundLayer {
  key: string
  url: string
  /** GIFs and still images are shown with <img>; videos with a muted <video>. */
  element: 'img' | 'video'
  start: number
  end: number
}

export type BackgroundSync = (nowMs: number, playing: boolean) => void

/**
 * Background files behind the lyrics. Visibility follows the song position
 * (the audio clock, passed in by the player on every frame) — never a timer.
 * A video starts from its beginning when its range starts and loops, like in
 * the exported MP4. Later layers are on top.
 */
export function BackgroundLayers({ layers, syncRef }: { layers: BackgroundLayer[]; syncRef: MutableRefObject<BackgroundSync | null> }) {
  const els = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>())
  const shown = useRef(new Map<string, boolean>())
  const lastNow = useRef(0)

  useEffect(() => {
    syncRef.current = (now, playing) => {
      const jumped = Math.abs(now - lastNow.current) > 1000 // a seek, not normal playback
      lastNow.current = now
      for (const layer of layers) {
        const el = els.current.get(layer.key)
        if (!el) continue
        const visible = now >= layer.start && now < layer.end
        const was = shown.current.get(layer.key) ?? false
        if (visible !== was) {
          el.style.opacity = visible ? '1' : '0'
          shown.current.set(layer.key, visible)
        }
        if (el instanceof HTMLVideoElement) {
          if (visible && (!was || jumped) && el.duration > 0) el.currentTime = ((now - layer.start) / 1000) % el.duration
          if (visible && playing && el.paused) void el.play().catch(() => undefined)
          if ((!visible || !playing) && !el.paused) el.pause()
        }
      }
    }
    return () => {
      syncRef.current = null
    }
  }, [layers, syncRef])

  // One stable ref callback for every layer (a new function per render would
  // detach and re-attach the element, restarting the video at every line).
  // React 19 runs the returned cleanup when the element goes away.
  const attach = useCallback((el: HTMLImageElement | HTMLVideoElement | null) => {
    const key = el?.dataset.bg
    if (!el || !key) return
    els.current.set(key, el)
    return () => {
      els.current.delete(key)
      shown.current.delete(key)
    }
  }, [])

  if (layers.length === 0) return null
  const cls = 'absolute inset-0 h-full w-full object-cover opacity-0'
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" data-testid="background-layers">
      {layers.map((layer) =>
        layer.element === 'img' ? (
          <img key={layer.key} ref={attach} src={layer.url} alt="" className={cls} data-bg={layer.key} />
        ) : (
          <video
            key={layer.key}
            ref={attach}
            src={layer.url}
            className={cls}
            data-bg={layer.key}
            muted
            loop
            playsInline
            preload="auto"
          />
        ),
      )}
    </div>
  )
}
