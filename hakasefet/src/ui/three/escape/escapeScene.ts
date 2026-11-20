import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { isActive } from '../../../escape/engine'
import type { RoomDef } from '../../../escape/types'
import { buildObject, makeMaterials, tableUnder, type Kit, type ObjectModel } from './models'
import { dotTexture, floorTexture, wallTexture, type Theme } from './textures'

/**
 * A walk-in 3D escape room. Each scene of the room is one wall; the camera
 * stands in the middle and turns between walls. Objects are placed from the
 * same 800×600 layout the 2D view uses, so both views always match.
 *
 * Quality: 'normal' (no shadows/bloom, DPR ≤ 1.5), 'high' (soft shadows, bloom,
 * DPR ≤ 2), 'ultra' (2048 shadows, MSAA, DPR ≤ 3 — native 4K on 4K screens).
 */
export type Quality = 'normal' | 'high' | 'ultra'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface EscapeSceneHandle {
  update(p: { flags: string[]; escaped: boolean }): void
  setScene(sceneId: string): void
  focus(hotspotId: string | null): void
  /** Screen rectangles (CSS px in the canvas) of the hotspots on the current wall. */
  rects(): Record<string, Rect>
  onSettle(cb: () => void): void
  dispose(): void
}

const ROOM = 13 // room is 13 × 13 m, 6 m high
const HALF = ROOM / 2
const WALL_H = 6
const FLOOR_LINE: Record<Theme, number> = { lab: 440, station: 540, museum: 420, bunker: 460, hq: 450, hut: 450 }
const EYE = 2.1 // eye height (m)
const FOV = 2 * Math.atan(2.9 / HALF) * (180 / Math.PI) // frames the lower 5 m of a wall from the centre

interface Placed {
  id: string
  scene: string
  model: ObjectModel
  bounds: THREE.Box3
  anchor: THREE.Vector3
  out: THREE.Vector3
}

// Scene 1 = front wall, 2 = right, 3 = back, 4 = left (the camera turns clockwise).
const WALLS = [
  { origin: new THREE.Vector3(0, 0, -HALF), right: new THREE.Vector3(1, 0, 0), out: new THREE.Vector3(0, 0, 1), yaw: 0 },
  { origin: new THREE.Vector3(HALF, 0, 0), right: new THREE.Vector3(0, 0, 1), out: new THREE.Vector3(-1, 0, 0), yaw: -Math.PI / 2 },
  { origin: new THREE.Vector3(0, 0, HALF), right: new THREE.Vector3(-1, 0, 0), out: new THREE.Vector3(0, 0, -1), yaw: -Math.PI },
  { origin: new THREE.Vector3(-HALF, 0, 0), right: new THREE.Vector3(0, 0, -1), out: new THREE.Vector3(1, 0, 0), yaw: -Math.PI * 1.5 },
]
const FLAT = new Set(['painting', 'poster', 'whiteboard', 'calendar', 'map', 'manual', 'starmap', 'clock', 'switches', 'slot', 'fusebox', 'vent'])
const TABLETOP = new Set(['typewriter', 'enigma', 'phone', 'radio'])

const THEME_LIGHT: Record<Theme, { key: number; accent: number; ambient: number; fog: number }> = {
  lab: { key: 0xdff4ff, accent: 0x2ec4b6, ambient: 0x6f8cff, fog: 0x050b1f },
  station: { key: 0xbfd4ff, accent: 0x2ec4b6, ambient: 0x4a6cff, fog: 0x030716 },
  museum: { key: 0xffe2a8, accent: 0xf2c14e, ambient: 0xff9a7a, fog: 0x120409 },
  bunker: { key: 0xffd9a0, accent: 0xff9f43, ambient: 0x8a7a6a, fog: 0x0c0a08 },
  hq: { key: 0xffe7b8, accent: 0xf2c14e, ambient: 0xb8a07a, fog: 0x100c06 },
  hut: { key: 0xffdca0, accent: 0xf2c14e, ambient: 0x9a7a5a, fog: 0x0e0905 },
}
const NEON = new Set<Theme>(['lab', 'station'])

/** Vignette + film grain, applied last. */
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.04 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      c.rgb *= mix(0.62, 1.0, v);
      c.rgb += (rand(vUv * 1000.0) - 0.5) * amount;
      gl_FragColor = c;
    }`,
}

export function createEscapeScene(container: HTMLElement, room: RoomDef, opts: { quality: Quality; reducedMotion: boolean }): EscapeSceneHandle {
  const q = opts.quality
  const dpr = Math.min(window.devicePixelRatio || 1, q === 'ultra' ? 3 : q === 'high' ? 2 : 1.5)
  const density = q === 'ultra' ? 4 : q === 'high' ? 3 : 2
  const shadows = q !== 'normal'
  const theme = room.scenes[0].theme as Theme
  const L = THEME_LIGHT[theme]

  const renderer = new THREE.WebGLRenderer({ antialias: q !== 'normal', powerPreference: 'high-performance' })
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  container.appendChild(renderer.domElement)

  const disposables: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x)
    return x
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(L.fog)
  scene.fog = new THREE.Fog(L.fog, 12, 26)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  scene.environmentIntensity = 0.35

  const camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.05, 60)
  camera.position.set(0, EYE, 0)

  // ── room shell ──
  const res = q === 'ultra' ? 4 : q === 'high' ? 2 : 1
  const wallTex = track(wallTexture(theme, res))
  const floorTex = track(floorTexture(theme, res))
  const wallMat = track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.05, bumpMap: wallTex, bumpScale: 0.02 }))
  const floorMat = track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: theme === 'station' ? 0.35 : 0.6, metalness: theme === 'station' ? 0.5 : 0.1 }))
  const ceilMat = track(new THREE.MeshStandardMaterial({ color: 0x0a1228, roughness: 0.9 }))
  const shell = new THREE.Group()
  scene.add(shell)
  const floorM = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM, ROOM)), floorMat)
  floorM.rotation.x = -Math.PI / 2
  floorM.receiveShadow = shadows
  shell.add(floorM)
  const ceil = new THREE.Mesh(track(new THREE.PlaneGeometry(ROOM, ROOM)), ceilMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = WALL_H
  shell.add(ceil)
  const wallGeo = track(new THREE.PlaneGeometry(ROOM, WALL_H))
  for (const [x, z, ry] of [[0, -HALF, 0], [HALF, 0, -Math.PI / 2], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2]] as const) {
    const w = new THREE.Mesh(wallGeo, wallMat)
    w.position.set(x, WALL_H / 2, z)
    w.rotation.y = ry
    w.receiveShadow = shadows
    shell.add(w)
  }
  // glowing accent strips along the floor and the ceiling — the "computerised" look
  const stripMat = track(new THREE.MeshStandardMaterial({ color: L.accent, emissive: L.accent, emissiveIntensity: 0.9 }))
  const stripGeo = track(new THREE.BoxGeometry(ROOM, 0.05, 0.05))
  for (const [x, z, ry] of NEON.has(theme) ? ([[0, -HALF + 0.03, 0], [HALF - 0.03, 0, Math.PI / 2], [0, HALF - 0.03, 0], [-HALF + 0.03, 0, Math.PI / 2]] as const) : [])
    for (const y of [0.04, WALL_H - 0.04]) {
      const s = new THREE.Mesh(stripGeo, stripMat)
      s.position.set(x, y, z)
      s.rotation.y = ry
      shell.add(s)
    }
  // ceiling light panels
  // ceiling lights: neon panels in modern rooms, hanging bulbs in period rooms
  const panelMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: L.key, emissiveIntensity: 1.2 }))
  const panelGeo = NEON.has(theme) ? track(new THREE.BoxGeometry(2.2, 0.05, 0.5)) : track(new THREE.SphereGeometry(0.12, 16, 12))
  const cordMat = track(new THREE.MeshStandardMaterial({ color: 0x111111 }))
  const cordGeo = track(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 6))
  for (const [x, z] of [[-2.5, -3], [2.5, -3], [3, 2.5], [-3, 2.5], [0, 0]] as const) {
    const p = new THREE.Mesh(panelGeo, panelMat)
    p.position.set(x, NEON.has(theme) ? WALL_H - 0.03 : WALL_H - 1.25, z)
    shell.add(p)
    if (!NEON.has(theme)) {
      const cord = new THREE.Mesh(cordGeo, cordMat)
      cord.position.set(x, WALL_H - 0.6, z)
      shell.add(cord)
    }
  }

  // ── lights ──
  const hemi = new THREE.HemisphereLight(L.key, L.ambient, 0.3)
  scene.add(hemi)
  const keyLight = new THREE.SpotLight(L.key, 70, 22, Math.PI / 3.2, 0.6, 1.6)
  keyLight.position.set(1.5, WALL_H - 0.2, 1.5)
  keyLight.target.position.set(2, 1.5, -2)
  keyLight.castShadow = shadows
  keyLight.shadow.mapSize.setScalar(q === 'ultra' ? 2048 : 1024)
  keyLight.shadow.bias = -0.0004
  keyLight.shadow.radius = 4
  scene.add(keyLight, keyLight.target)
  const accent = new THREE.PointLight(L.accent, 8, 12, 1.8)
  accent.position.set(-3, 1, 3)
  scene.add(accent)
  const emergency = new THREE.PointLight(0xff2a2a, 0, 16, 1.5)
  emergency.position.set(0, WALL_H - 0.6, 0)
  scene.add(emergency)
  if (theme === 'museum') {
    for (const x of [-2.75, -0.75, 1.25]) {
      const s = new THREE.SpotLight(0xffe2a8, 60, 9, 0.38, 0.5, 1.5)
      s.position.set(x, WALL_H - 0.3, -HALF + 2.2)
      s.target.position.set(x, 4.2, -HALF)
      scene.add(s, s.target)
    }
  }

  // ── objects ──
  const kit: Kit = { density, shadows, mats: makeMaterials(res), track }
  for (const m of Object.values(kit.mats)) disposables.push(m as { dispose(): void })
  const placed: Placed[] = []
  room.hotspots.forEach((h) => {
    const sceneIdx = Math.max(0, room.scenes.findIndex((s) => s.id === h.scene))
    const wall = WALLS[Math.min(sceneIdx, WALLS.length - 1)]
    const model = buildObject(h, kit)
    const sceneTheme = (room.scenes[sceneIdx]?.theme ?? theme) as Theme
    // objects whose bottom reaches the drawn floor stand on the floor; small tabletop items get a table
    if (!FLAT.has(h.art) && h.y + h.h >= FLOOR_LINE[sceneTheme] - 60) model.floor = true
    let lift = 0
    if (model.floor && TABLETOP.has(h.art)) {
      lift = 0.85
      model.group.add(tableUnder(kit, h.w / 100, model.height))
    }
    const u = (h.x + h.w / 2) / 100 - 4
    // the 2D art draws the floor at FLOOR_LINE; heights are measured from there
    const v = model.floor ? model.height / 2 + lift : Math.max(model.height / 2 + 0.05, (FLOOR_LINE[sceneTheme] - (h.y + h.h / 2)) / 100)
    const pos = wall.origin.clone().addScaledVector(wall.right, u).addScaledVector(wall.out, 0.01)
    pos.y = v
    model.group.position.copy(pos)
    model.group.rotation.y = wall.yaw
    scene.add(model.group)
    model.group.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(model.group)
    placed.push({ id: h.id, scene: h.scene, model, bounds, anchor: bounds.getCenter(new THREE.Vector3()), out: wall.out })
  })

  // ── dust in the light ──
  const N = q === 'normal' ? 120 : 260
  const dustPos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * ROOM
    dustPos[i * 3 + 1] = Math.random() * WALL_H
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * ROOM
  }
  const dustGeo = track(new THREE.BufferGeometry())
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dotTex = track(dotTexture())
  const dust = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ size: 0.04, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: theme === 'museum' ? 0xffd97a : 0xbfefff, opacity: 0.6 })))
  scene.add(dust)

  // ── post-processing ──
  let composer: EffectComposer | null = null
  let grade: ShaderPass | null = null
  if (q !== 'normal') {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q === 'ultra' ? 4 : 0 })
    composer = new EffectComposer(renderer, rt)
    composer.addPass(new RenderPass(scene, camera))
    // ambient occlusion: soft contact shadows in corners and under objects (ultra only — it is costly)
    if (q === 'ultra') {
      const ao = new GTAOPass(scene, camera, 1, 1)
      ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 })
      ao.blendIntensity = 0.85
      composer.addPass(ao)
    }
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), q === 'ultra' ? 0.45 : 0.38, 0.35, 0.92))
    composer.addPass(new OutputPass())
    // cinematic finish: vignette + fine film grain (after tone mapping)
    grade = new ShaderPass(GRADE_SHADER)
    grade.uniforms.amount.value = theme === 'bunker' || theme === 'hq' || theme === 'hut' ? 0.06 : 0.035
    composer.addPass(grade)
  }

  // ── camera rig ──
  let wallIdx = 0
  let yaw = 0
  let targetYaw = 0
  const lookFrom = new THREE.Vector3(0, EYE, 0)
  const camPos = new THREE.Vector3(0, EYE, 0)
  const camTarget = new THREE.Vector3(0, EYE, -HALF)
  const wantPos = camPos.clone()
  const wantTarget = camTarget.clone()
  let focusId: string | null = null
  let settled = true
  const settleCbs: (() => void)[] = []
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const onMove = (e: PointerEvent) => {
    const r = container.getBoundingClientRect()
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1
  }
  container.addEventListener('pointermove', onMove)

  function aimForWall() {
    wantPos.copy(lookFrom)
    wantTarget.copy(lookFrom).add(new THREE.Vector3(-Math.sin(-targetYaw), 0, -Math.cos(-targetYaw)).multiplyScalar(HALF))
  }
  aimForWall()

  let flags: string[] = []
  let escaped = false
  let escapedAt = -1
  const powerFlag = room.darkUntil ?? null

  const clock = new THREE.Clock()
  let raf = 0
  let running = false

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime
    const powered = !powerFlag || flags.includes(powerFlag)
    for (const p of placed) {
      const h = room.hotspots.find((x) => x.id === p.id)!
      p.model.update({ active: isActive(h, flags), escaped, powered }, dt, t)
    }
    // lighting mood: emergency red until the power is back
    const k = 1 - Math.exp(-3 * dt)
    hemi.intensity += ((powered ? 0.3 : 0.08) - hemi.intensity) * k
    keyLight.intensity += ((powered ? 70 : 14) - keyLight.intensity) * k
    scene.environmentIntensity += ((powered ? 0.35 : 0.12) - scene.environmentIntensity) * k
    // period rooms: bare bulbs that flicker now and then
    const flicker = NEON.has(theme) || opts.reducedMotion ? 1 : Math.sin(t * 13) > 0.97 || Math.sin(t * 7.3 + 1) > 0.985 ? 0.55 : 1
    panelMat.emissiveIntensity += ((powered ? 0.9 * flicker : 0.03) - panelMat.emissiveIntensity) * Math.min(1, k * 4)
    if (!NEON.has(theme)) keyLight.intensity *= 0.85 + 0.15 * flicker
    if (grade) grade.uniforms.time.value = t
    emergency.intensity = powered ? Math.max(0, emergency.intensity - dt * 20) : 6 + 5 * Math.sin(t * 3)
    accent.intensity = 8 + (opts.reducedMotion ? 0 : 1.5 * Math.sin(t * 1.3))

    // camera: turn between walls (by angle, so even 180° turns are smooth), dolly to a focused object
    yaw += (targetYaw - yaw) * (1 - Math.exp(-4 * dt))
    camPos.lerp(wantPos, 1 - Math.exp(-4 * dt))
    if (focusId || escaped) camTarget.lerp(wantTarget, 1 - Math.exp(-4 * dt))
    else {
      camTarget.set(camPos.x - Math.sin(-yaw) * HALF, EYE, camPos.z - Math.cos(-yaw) * HALF)
      if (Math.abs(targetYaw - yaw) < 0.002) camTarget.copy(wantTarget)
    }
    if (!opts.reducedMotion) {
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
    }
    const sway = opts.reducedMotion || focusId ? 0 : 1
    camera.position.copy(camPos)
    camera.position.y += sway * Math.sin(t * 0.6) * 0.03
    const look = camTarget.clone()
    const w = WALLS[wallIdx]
    look.addScaledVector(w.right, sway * pointer.x * 0.35).add(new THREE.Vector3(0, -sway * pointer.y * 0.25, 0))
    camera.lookAt(look)

    // escape cinematic: push forward and brighten
    if (escaped) {
      if (escapedAt < 0) escapedAt = t
      const e = Math.min(1, (t - escapedAt) / 2.2)
      renderer.toneMappingExposure = 1.05 + e * e * 2.5
    }

    // dust drifts
    if (!opts.reducedMotion) {
      const pa = dustGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < N; i++) {
        let y = pa.getY(i) + 0.003
        if (y > WALL_H) y = 0
        pa.setY(i, y)
      }
      pa.needsUpdate = true
    }

    const still = Math.abs(targetYaw - yaw) < 0.002 && camTarget.distanceTo(wantTarget) < 0.03 && camPos.distanceTo(wantPos) < 0.01
    if (still && !settled) {
      settled = true
      settleCbs.forEach((cb) => cb())
    } else if (!still) settled = false

    if (composer) composer.render()
    else renderer.render(scene, camera)
  }

  // Adaptive quality: if frames are slow, lower the resolution (and drop bloom)
  // step by step; when nothing moves, render at ~30 fps to save battery.
  let scale = 1
  let slowFor = 0
  let lastRender = 0
  function loop(now: number) {
    raf = requestAnimationFrame(loop)
    const moving = !settled || escaped
    if (!moving && now - lastRender < 32) return
    const t0 = performance.now()
    frame()
    lastRender = now
    const cost = performance.now() - t0
    slowFor = cost > 34 ? slowFor + 1 : Math.max(0, slowFor - 1)
    if (slowFor > 20 && scale > 0.5) {
      slowFor = 0
      scale = Math.max(0.5, scale - 0.25)
      if (scale <= 0.75 && composer) composer = null
      renderer.setPixelRatio(dpr * scale)
      resize()
    }
  }
  function start() {
    if (running) return
    running = true
    clock.getDelta()
    raf = requestAnimationFrame(loop)
  }
  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }
  const onVis = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVis)

  function resize() {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    settleCbs.forEach((cb) => cb())
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()
  // first frame straight away, already facing the first wall
  yaw = targetYaw
  camPos.copy(wantPos)
  camTarget.copy(wantTarget)
  start()

  const v = new THREE.Vector3()
  return {
    update(p) {
      flags = p.flags
      escaped = p.escaped
      if (escaped) {
        const exit = placed.find((x) => room.hotspots.find((h) => h.id === x.id)?.interactions.some((i) => (i.type === 'lock' && i.onSolve.escape) || (i.type === 'needItem' && i.onUse.escape)))
        if (exit) {
          const sceneIdx = room.scenes.findIndex((s) => s.id === exit.scene)
          wallIdx = Math.max(0, sceneIdx)
          targetYaw = WALLS[wallIdx].yaw
          wantTarget.copy(exit.anchor)
          wantPos.copy(exit.anchor).addScaledVector(exit.out, 1.6)
          wantPos.y = Math.max(1.4, exit.anchor.y)
        }
      }
    },
    setScene(sceneId) {
      const idx = Math.max(0, room.scenes.findIndex((s) => s.id === sceneId))
      if (idx === wallIdx && !focusId) return
      wallIdx = Math.min(idx, WALLS.length - 1)
      // turn the short way round
      let t = WALLS[wallIdx].yaw
      while (t - yaw > Math.PI) t -= Math.PI * 2
      while (yaw - t > Math.PI) t += Math.PI * 2
      targetYaw = t
      focusId = null
      aimForWall()
      settled = false
    },
    focus(id) {
      focusId = id
      const p = placed.find((x) => x.id === id)
      if (!p) {
        aimForWall()
      } else {
        wantTarget.copy(p.anchor)
        const size = p.bounds.getSize(v).length()
        wantPos.copy(p.anchor).addScaledVector(p.out, Math.max(2.2, size * 1.4))
        wantPos.y = Math.min(Math.max(p.anchor.y + 0.3, 1.2), WALL_H - 1)
      }
      settled = false
    },
    rects() {
      const out: Record<string, Rect> = {}
      const cw = container.clientWidth
      const ch = container.clientHeight
      camera.updateMatrixWorld()
      const sceneId = room.scenes[wallIdx]?.id
      for (const p of placed) {
        if (p.scene !== sceneId) continue
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        const b = p.bounds
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              v.set(x, y, z).project(camera)
              const sx = ((v.x + 1) / 2) * cw
              const sy = ((1 - v.y) / 2) * ch
              minX = Math.min(minX, sx)
              maxX = Math.max(maxX, sx)
              minY = Math.min(minY, sy)
              maxY = Math.max(maxY, sy)
            }
        out[p.id] = { x: Math.max(0, minX), y: Math.max(0, minY), w: Math.min(cw, maxX) - Math.max(0, minX), h: Math.min(ch, maxY) - Math.max(0, minY) }
      }
      return out
    },
    onSettle(cb) {
      settleCbs.push(cb)
    },
    dispose() {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      container.removeEventListener('pointermove', onMove)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
      })
      for (const d of disposables) d.dispose?.()
      composer?.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
