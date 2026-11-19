import * as THREE from 'three'

/**
 * Procedural textures drawn on canvases — no image files to download, sharp
 * at any resolution (the size follows the chosen graphics quality).
 */
export type Theme = 'lab' | 'station' | 'museum'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], color = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 8
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
}

export function wallTexture(theme: Theme, res: number) {
  const S = 512 * res
  const { c, g } = canvas(S, S)
  if (theme === 'lab') {
    g.fillStyle = '#0f1d42'
    g.fillRect(0, 0, S, S)
    const n = 8
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 18 + Math.random() * 6
        g.fillStyle = `rgb(${v - 4},${v + 10},${v + 40})`
        g.fillRect((x * S) / n + 2 * res, (y * S) / n + 2 * res, S / n - 4 * res, S / n - 4 * res)
      }
    noise(g, S, S, 4000 * res)
  } else if (theme === 'station') {
    g.fillStyle = '#0d1736'
    g.fillRect(0, 0, S, S)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 2; x++) {
        const px = (x * S) / 2 + 8 * res
        const py = (y * S) / 4 + 8 * res
        const grd = g.createLinearGradient(px, py, px, py + S / 4)
        grd.addColorStop(0, '#1d2f63')
        grd.addColorStop(1, '#131f45')
        g.fillStyle = grd
        g.fillRect(px, py, S / 2 - 16 * res, S / 4 - 16 * res)
        g.fillStyle = '#3a5aa8'
        for (const [dx, dy] of [[14, 14], [S / 2 - 30 * res, 14], [14, S / 4 - 30 * res], [S / 2 - 30 * res, S / 4 - 30 * res]]) {
          g.beginPath()
          g.arc(px + dx, py + dy, 3 * res, 0, Math.PI * 2)
          g.fill()
        }
      }
    noise(g, S, S, 3000 * res)
  } else {
    // red velvet with a damask-like repeat
    g.fillStyle = '#3b0f1d'
    g.fillRect(0, 0, S, S)
    for (let x = 0; x < S; x += 16 * res) {
      g.fillStyle = x % (32 * res) ? '#43121f' : '#36101b'
      g.fillRect(x, 0, 8 * res, S)
    }
    g.strokeStyle = 'rgba(242,193,78,.08)'
    g.lineWidth = 3 * res
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const cx = (x + 0.5) * (S / 4)
        const cy = (y + 0.5) * (S / 4)
        g.beginPath()
        g.ellipse(cx, cy, 30 * res, 46 * res, 0, 0, Math.PI * 2)
        g.stroke()
      }
    noise(g, S, S, 5000 * res, 0.04)
  }
  return tex(c, [3, 1.5])
}

export function floorTexture(theme: Theme, res: number) {
  const S = 512 * res
  const { c, g } = canvas(S, S)
  if (theme === 'museum') {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 4; x++) {
        const v = 70 + Math.random() * 25
        g.fillStyle = `rgb(${v + 20},${v - 10},${v - 40})`
        g.fillRect(x * (S / 4) + ((y % 2) * S) / 8, y * (S / 16), S / 4 - 2 * res, S / 16 - 2 * res)
      }
    noise(g, S, S, 6000 * res, 0.05)
  } else if (theme === 'station') {
    g.fillStyle = '#0a1430'
    g.fillRect(0, 0, S, S)
    g.strokeStyle = 'rgba(46,196,182,.35)'
    g.lineWidth = 2 * res
    for (let i = 0; i <= 8; i++) {
      g.beginPath()
      g.moveTo((i * S) / 8, 0)
      g.lineTo((i * S) / 8, S)
      g.moveTo(0, (i * S) / 8)
      g.lineTo(S, (i * S) / 8)
      g.stroke()
    }
    noise(g, S, S, 3000 * res)
  } else {
    g.fillStyle = '#1a2547'
    g.fillRect(0, 0, S, S)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = 30 + Math.random() * 10
        g.fillStyle = `rgb(${v},${v + 8},${v + 30})`
        g.fillRect((x * S) / 4 + 3 * res, (y * S) / 4 + 3 * res, S / 4 - 6 * res, S / 4 - 6 * res)
      }
    noise(g, S, S, 4000 * res)
  }
  return tex(c, [4, 4])
}

export function woodTexture(res: number) {
  const S = 256 * res
  const { c, g } = canvas(S, S)
  g.fillStyle = '#5a3a1e'
  g.fillRect(0, 0, S, S)
  for (let y = 0; y < S; y += 2) {
    g.fillStyle = `rgba(${40 + Math.random() * 30},${20 + Math.random() * 15},5,${0.15 + Math.random() * 0.2})`
    g.fillRect(0, y + Math.sin(y * 0.05) * 3, S, 1.5)
  }
  return tex(c, [1, 1])
}

/** A crisp text label (uses the page's Hebrew font). */
export function labelTexture(text: string, opts: { fg?: string; bg?: string; size?: number; res?: number; w?: number; h?: number } = {}) {
  const res = opts.res ?? 2
  const W = (opts.w ?? 256) * res
  const H = (opts.h ?? 64) * res
  const { c, g } = canvas(W, H)
  if (opts.bg) {
    g.fillStyle = opts.bg
    g.fillRect(0, 0, W, H)
  }
  g.fillStyle = opts.fg ?? '#f4f6ff'
  g.font = `800 ${(opts.size ?? 32) * res}px Heebo, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.direction = 'rtl'
  g.fillText(text, W / 2, H / 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Soft round sprite for dust and glows. */
export function dotTexture() {
  const { c, g } = canvas(64, 64)
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,246,207,1)')
  grd.addColorStop(0.4, 'rgba(255,214,120,.4)')
  grd.addColorStop(1, 'rgba(255,214,120,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
