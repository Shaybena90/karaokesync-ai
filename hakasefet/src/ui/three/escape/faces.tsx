import * as THREE from 'three'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Hotspot } from '../../../escape/types'
import { ObjectArt, SceneDefs } from '../../escape/sceneArt'

/**
 * The detailed 2D artwork of each object becomes the printed face of its 3D
 * model (screens, paintings, panels, keypads…). The SVG is rasterised at the
 * graphics-quality density, so faces stay sharp up to 4K.
 */
const cache = new Map<string, Promise<THREE.Texture>>()

export function faceTexture(h: Hotspot, active: boolean, density: number): Promise<THREE.Texture> {
  const key = `${h.art}|${h.w}|${h.h}|${h.variant ?? ''}|${active}|${density}`
  let p = cache.get(key)
  if (!p) {
    p = rasterise(h, active, density)
    cache.set(key, p)
  }
  return p
}

async function rasterise(h: Hotspot, active: boolean, density: number): Promise<THREE.Texture> {
  const pad = 8
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${h.w + pad * 2} ${h.h + pad * 2}`} width={(h.w + pad * 2) * density} height={(h.h + pad * 2) * density}>
      <SceneDefs />
      <ObjectArt art={h.art} w={h.w} h={h.h} active={active} variant={h.variant} />
    </svg>,
  )
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    // crop the padding so the art fills the face exactly
    t.repeat.set(h.w / (h.w + pad * 2), h.h / (h.h + pad * 2))
    t.offset.set(pad / (h.w + pad * 2), pad / (h.h + pad * 2))
    return t
  } finally {
    URL.revokeObjectURL(url)
  }
}
