import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * A real-time 3D bank vault: brushed navy steel body, round gold-trimmed door
 * with a combination dial and a spoked wheel. `open()` plays the unlock
 * sequence: dial spins, wheel turns, the door swings out, light pours out and a
 * gem rises. Rendering pauses when the canvas is off-screen or the tab hidden.
 */
export interface VaultHandle {
  open(): void
  dispose(): void
}

export interface VaultOptions {
  open?: boolean
  reducedMotion?: boolean
  /** Turn the vault a bit to show depth (e.g. on the home screen). */
  showcase?: boolean
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const phase = (t: number, start: number, dur: number) => clamp01((t - start) / dur)

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,246,207,1)')
  grad.addColorStop(0.35, 'rgba(255,214,120,.55)')
  grad.addColorStop(1, 'rgba(242,193,78,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createVaultScene(container: HTMLElement, opts: VaultOptions = {}): VaultHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  camera.position.set(0, 0.25, 9)
  camera.lookAt(0, 0, 0)

  // ── lights ──
  scene.add(new THREE.AmbientLight(0x8fa6ff, 0.35))
  const key = new THREE.DirectionalLight(0xffe2a8, 2.4)
  key.position.set(4, 5, 6)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x2ec4b6, 2.2)
  rim.position.set(-5, 2, -4)
  scene.add(rim)
  const fill = new THREE.DirectionalLight(0x6f8cff, 0.8)
  fill.position.set(-3, -2, 5)
  scene.add(fill)

  // ── materials ──
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x1b2f63, metalness: 0.85, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 })
  const doorSteel = new THREE.MeshPhysicalMaterial({ color: 0x223d80, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 })
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.2, clearcoat: 0.4, envMapIntensity: 1.4 })
  const darkGold = new THREE.MeshPhysicalMaterial({ color: 0xb8862b, metalness: 1, roughness: 0.35 })
  const cavityMat = new THREE.MeshStandardMaterial({ color: 0x050a1c, roughness: 0.95, metalness: 0.1 })
  const gemMat = new THREE.MeshPhysicalMaterial({ color: 0x7ee8dc, metalness: 0.1, roughness: 0.02, clearcoat: 1, emissive: 0x1a8f86, emissiveIntensity: 0.6, iridescence: 1, envMapIntensity: 2, flatShading: true })

  const root = new THREE.Group()
  scene.add(root)

  // ── body ──
  const W = 3.2
  const D = 2.4
  const front = D / 2
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, W, D, 6, 0.22), steel)
  root.add(body)
  // brushed panels on the sides of the front face
  const opening = new THREE.Mesh(new THREE.CircleGeometry(1.18, 64), cavityMat)
  opening.position.z = front + 0.005
  root.add(opening)
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.07, 24, 96), gold)
  frame.position.z = front + 0.02
  root.add(frame)
  // corner studs and feet
  for (const [x, y] of [[-1.35, 1.35], [1.35, 1.35], [-1.35, -1.35], [1.35, -1.35]] as const) {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), gold)
    stud.position.set(x, y, front + 0.02)
    root.add(stud)
  }
  for (const x of [-1.1, 1.1]) {
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.18, 1.6, 3, 0.05), darkGold)
    foot.position.set(x, -W / 2 - 0.07, 0)
    root.add(foot)
  }
  // gold edge strip on top
  const crown = new THREE.Mesh(new RoundedBoxGeometry(W * 0.9, 0.08, 0.08, 2, 0.03), gold)
  crown.position.set(0, W / 2 - 0.12, front + 0.02)
  root.add(crown)

  // ── interior light + gem ──
  const glow = new THREE.PointLight(0xffd27a, 0, 6, 1.6)
  glow.position.set(0, 0, front - 0.2)
  root.add(glow)
  const burstTex = glowTexture()
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
  burst.position.set(0, 0, front + 0.1)
  burst.scale.setScalar(0.01)
  root.add(burst)
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), gemMat)
  gem.scale.set(0, 0, 0)
  gem.position.set(0, 0, front + 0.05)
  root.add(gem)

  // ── door (pivots on its left hinge) ──
  const R = 1.16
  const hinge = new THREE.Group()
  hinge.position.set(-R - 0.06, 0, front + 0.16)
  root.add(hinge)
  const door = new THREE.Group()
  door.position.x = R + 0.06
  hinge.add(door)

  const slab = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.28, 96), doorSteel)
  slab.rotation.x = Math.PI / 2
  door.add(slab)
  const doorFront = 0.14
  for (const [r, t] of [[1.06, 0.035], [0.78, 0.025]] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 16, 96), gold)
    ring.position.z = doorFront
    door.add(ring)
  }
  // rivets
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), gold)
    rivet.position.set(Math.cos(a) * 0.92, Math.sin(a) * 0.92, doorFront)
    door.add(rivet)
  }
  // hinges
  for (const y of [0.55, -0.55]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 24), gold)
    h.position.set(-R - 0.02, y, 0)
    door.add(h)
  }
  // combination dial
  const dial = new THREE.Group()
  dial.position.z = doorFront + 0.06
  door.add(dial)
  const dialFace = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.1, 64), gold)
  dialFace.rotation.x = Math.PI / 2
  dial.add(dialFace)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, i % 6 === 0 ? 0.1 : 0.06, 0.02), darkGold)
    tick.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.06)
    tick.rotation.z = a - Math.PI / 2
    dial.add(tick)
  }
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 32), darkGold)
  knob.rotation.x = Math.PI / 2
  knob.position.z = 0.1
  dial.add(knob)
  // spoked wheel
  const wheel = new THREE.Group()
  wheel.position.z = doorFront + 0.2
  door.add(wheel)
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 16), gold)
    spoke.rotation.z = (i * Math.PI) / 3
    wheel.add(spoke)
    for (const s of [1, -1]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 20), gold)
      const a = (i * Math.PI) / 3 + Math.PI / 2
      ball.position.set(Math.cos(a) * 0.75 * s, Math.sin(a) * 0.75 * s, 0)
      wheel.add(ball)
    }
  }

  // ── gold dust ──
  const N = 140
  const pos = new Float32Array(N * 3)
  const speed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 7
    pos[i * 3 + 1] = (Math.random() - 0.5) * 5
    pos[i * 3 + 2] = (Math.random() - 0.5) * 4
    speed[i] = 0.1 + Math.random() * 0.25
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd97a, size: 0.05, map: burstTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }))
  scene.add(dust)

  // ── state & interaction ──
  const reduced = !!opts.reducedMotion
  let openAt: number | null = null
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const onMove = (e: PointerEvent) => {
    const r = container.getBoundingClientRect()
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1
  }
  const onLeave = () => {
    pointer.tx = 0
    pointer.ty = 0
  }
  container.addEventListener('pointermove', onMove)
  container.addEventListener('pointerleave', onLeave)

  const resize = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // keep the whole vault in frame on narrow or wide boxes
    camera.position.z = w / h < 1 ? 9 / (w / h) ** 0.6 : 9
    camera.updateProjectionMatrix()
    if (!running) render(clock.elapsedTime)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  const clock = new THREE.Clock()
  let raf = 0
  let running = false
  let visible = true

  function apply(t: number, openT: number | null) {
    const idleSway = reduced ? 0 : Math.sin(t * 0.45) * (opts.showcase ? 0.32 : 0.18)
    pointer.x += (pointer.tx - pointer.x) * 0.06
    pointer.y += (pointer.ty - pointer.y) * 0.06
    const baseY = opts.showcase ? -0.35 : -0.12
    root.rotation.y = (openT !== null ? 0.28 : baseY + idleSway) + pointer.x * 0.35
    root.rotation.x = 0.08 + pointer.y * 0.18
    root.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.06

    if (openT === null) {
      dial.rotation.z = reduced ? 0 : Math.sin(t * 0.6) * 0.4
      wheel.rotation.z = 0
      hinge.rotation.y = 0
      glow.intensity = 0
      ;(burst.material as THREE.SpriteMaterial).opacity = 0
      gem.scale.setScalar(0)
    } else {
      const s = openT
      dial.rotation.z = easeInOut(phase(s, 0, 0.9)) * Math.PI * 4
      wheel.rotation.z = -easeInOut(phase(s, 0.5, 0.8)) * Math.PI * 1.5
      hinge.rotation.y = -easeInOut(phase(s, 1.2, 1.2)) * 1.95
      const light = phase(s, 1.5, 0.8)
      glow.intensity = light * 7
      const b = phase(s, 1.5, 1.4)
      ;(burst.material as THREE.SpriteMaterial).opacity = Math.sin(b * Math.PI) * 0.95 + light * 0.35
      burst.scale.setScalar(0.5 + b * 4.5)
      const g = phase(s, 1.9, 0.9)
      gem.scale.setScalar(easeOutBack(g) * 1)
      gem.position.z = front + 0.05 + g * 0.6
      gem.rotation.y = t * 1.4
      gem.rotation.x = 0.3
    }

    const p = dustGeo.attributes.position as THREE.BufferAttribute
    if (!reduced) {
      for (let i = 0; i < N; i++) {
        let y = p.getY(i) + speed[i] * 0.008
        if (y > 2.6) y = -2.6
        p.setY(i, y)
      }
      p.needsUpdate = true
    }
    dust.rotation.y = t * 0.03
  }

  function render(t: number) {
    const openT = openAt === null ? null : reduced ? 10 : t - openAt
    apply(t, openT)
    renderer.render(scene, camera)
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    render(clock.getElapsedTime())
  }
  function start() {
    if (running || reduced || !visible || document.hidden) return
    running = true
    loop()
  }
  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting)
    if (visible) start()
    else stop()
  })
  io.observe(container)
  const onVis = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVis)

  if (opts.open) openAt = reduced ? 0 : 0.35
  resize()
  render(0)
  start()

  return {
    open() {
      if (openAt !== null) return
      openAt = clock.getElapsedTime()
      if (reduced) render(0)
    },
    dispose() {
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerleave', onLeave)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
      })
      for (const mat of [steel, doorSteel, gold, darkGold, cavityMat, gemMat, burst.material, dust.material as THREE.Material]) mat.dispose()
      burstTex.dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
