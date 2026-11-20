import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Hotspot } from '../../../escape/types'
import { faceTexture } from './faces'
import { labelTexture, woodTexture } from './textures'

/**
 * 3D models for every kind of object, built from primitives. Each model is
 * centred on x, sits with its back at z = 0 (against the wall, front towards
 * +z) and has its vertical centre at y = 0. Moving parts (doors, drawers,
 * lids, levers, liquids, lasers) ease towards their target state every frame.
 */
export interface ObjState {
  active: boolean
  escaped: boolean
  powered: boolean
}

export interface ObjectModel {
  group: THREE.Group
  update(s: ObjState, dt: number, t: number): void
  /** Stands on the floor (true) or hangs on the wall (false); the scene may override it. */
  floor: boolean
  height: number
}

export interface Kit {
  density: number
  shadows: boolean
  mats: ReturnType<typeof makeMaterials>
  track<T extends THREE.Material | THREE.BufferGeometry | THREE.Texture>(x: T): T
}

export function makeMaterials(res: number) {
  const wood = woodTexture(res)
  return {
    steel: new THREE.MeshPhysicalMaterial({ color: 0x223a78, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x0d1838, metalness: 0.7, roughness: 0.45 }),
    gray: new THREE.MeshStandardMaterial({ color: 0x5b6b96, metalness: 0.6, roughness: 0.4 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.22, clearcoat: 0.5 }),
    bronze: new THREE.MeshPhysicalMaterial({ color: 0xa87720, metalness: 1, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, color: 0xffffff, roughness: 0.7, metalness: 0.05 }),
    marble: new THREE.MeshPhysicalMaterial({ color: 0xe9ecf8, roughness: 0.25, clearcoat: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xdfe4f4, roughness: 0.4, metalness: 0.3 }),
    inside: new THREE.MeshStandardMaterial({ color: 0x050a1c, roughness: 0.95 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x6b1f36, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfefff, roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.05, transparent: true, opacity: 0.35 }),
    wood_map: wood,
  }
}

const ease = (cur: number, target: number, dt: number, speed = 5) => cur + (target - cur) * (1 - Math.exp(-speed * dt))

function mesh(kit: Kit, geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number]) {
  const m = new THREE.Mesh(kit.track(geo), mat)
  if (pos) m.position.set(...pos)
  m.castShadow = kit.shadows
  m.receiveShadow = kit.shadows
  return m
}
const box = (kit: Kit, w: number, h: number, d: number, mat: THREE.Material, pos?: [number, number, number], r = 0.02) =>
  mesh(kit, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), mat, pos)

/** A plane printed with the object's 2D artwork; swaps art when the object changes state. */
function face(kit: Kit, h: Hotspot, w: number, hgt: number, opts: { glow?: boolean; transparent?: boolean } = {}) {
  // slightly off-white and matte, so paper does not blow out under spotlights
  const mat = kit.track(new THREE.MeshStandardMaterial({ transparent: opts.transparent ?? true, alphaTest: 0.02, roughness: 0.85, metalness: 0.02, color: 0xd9d9d9 }))
  const plane = mesh(kit, new THREE.PlaneGeometry(w, hgt), mat)
  plane.castShadow = false
  let current: boolean | null = null
  const set = (active: boolean) => {
    if (current === active) return
    current = active
    void faceTexture(h, active, kit.density).then((t) => {
      if (current !== active) return
      mat.map = t
      if (opts.glow) {
        mat.emissiveMap = t
        mat.emissive = new THREE.Color(0xffffff)
        mat.emissiveIntensity = 0.3
      }
      mat.needsUpdate = true
    })
  }
  set(false)
  return { plane, set, mat }
}

function hinge(x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

function shelf(kit: Kit, w: number, y: number, depth: number) {
  const g = new THREE.Group()
  g.add(box(kit, w + 0.3, 0.06, depth + 0.15, kit.mats.darkSteel, [0, y - 0.03, (depth + 0.15) / 2]))
  g.add(box(kit, w + 0.3, 0.02, 0.02, kit.mats.gold, [0, y, depth + 0.15], 0))
  for (const s of [-1, 1]) g.add(box(kit, 0.05, 0.3, 0.05, kit.mats.gold, [s * (w / 2), y - 0.18, 0.15], 0.01))
  return g
}

export function buildObject(h: Hotspot, kit: Kit): ObjectModel {
  const W = h.w / 100
  const H = h.h / 100
  const M = kit.mats
  const g = new THREE.Group()
  const floorArts = new Set(['bed', 'elevator', 'pod', 'door', 'hatch', 'cabinet', 'showcase', 'statues', 'tanks', 'trash', 'crate', 'desk-under', 'console', 'machine', 'ladder'])
  const floor = floorArts.has(h.art) || h.y + h.h >= 520
  let update: ObjectModel['update'] = () => {}
  let height = H

  switch (h.art) {
    case 'door':
    case 'hatch': {
      const D = 0.3
      const isHatch = h.art === 'hatch'
      g.add(box(kit, W + 0.24, 0.16, D, M.gold, [0, H / 2 + 0.04, D / 2]))
      for (const s of [-1, 1]) g.add(box(kit, 0.14, H + 0.1, D, M.gold, [s * (W / 2 + 0.05), 0, D / 2]))
      // light from beyond the exit
      const portal = mesh(kit, new THREE.PlaneGeometry(W, H), kit.track(new THREE.MeshBasicMaterial({ color: 0xfff6d8 })), [0, 0, 0.02])
      g.add(portal)
      const hg = hinge(-W / 2, 0, D * 0.6)
      g.add(hg)
      const slabGeo = isHatch ? new THREE.ExtrudeGeometry(roundedRect(W - 0.04, H - 0.04, (W - 0.04) / 2), { depth: 0.12, bevelEnabled: false }) : new RoundedBoxGeometry(W - 0.04, H - 0.04, 0.12, 2, 0.03)
      const slab = mesh(kit, slabGeo, M.steel, isHatch ? [W / 2, 0, -0.06] : [W / 2, 0, 0])
      hg.add(slab)
      const f = face(kit, h, W - 0.04, H - 0.04)
      f.plane.position.set(W / 2, 0, 0.07)
      hg.add(f.plane)
      let a = 0
      update = (s, dt) => {
        a = ease(a, s.escaped ? -1.75 : 0, dt, 2.5)
        hg.rotation.y = a
      }
      break
    }
    case 'clock': {
      const R = Math.min(W, H) / 2
      const body = mesh(kit, new THREE.CylinderGeometry(R, R, 0.12, 64), M.white)
      body.rotation.x = Math.PI / 2
      body.position.z = 0.06
      g.add(body)
      const rim = mesh(kit, new THREE.TorusGeometry(R, 0.04, 16, 64), M.gold, [0, 0, 0.12])
      g.add(rim)
      const f = face(kit, h, W, H)
      f.plane.position.z = 0.125
      g.add(f.plane)
      break
    }
    case 'trash': {
      const can = mesh(kit, new THREE.CylinderGeometry(W / 2, W * 0.38, H, 32, 1, true), kit.track(new THREE.MeshStandardMaterial({ color: 0x2a3f78, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })), [0, 0, W / 2 + 0.05])
      g.add(can)
      for (let i = 0; i < 4; i++) g.add(mesh(kit, new THREE.IcosahedronGeometry(0.1 + (i % 2) * 0.03, 0), M.white, [(i - 1.5) * 0.09, H / 2 - 0.02 + (i % 2) * 0.05, W / 2 + 0.05 + ((i % 3) - 1) * 0.08]))
      break
    }
    case 'drawer': {
      const D = 0.6
      g.add(box(kit, W, H, D, M.wood, [0, 0, D / 2]))
      const tray = new THREE.Group()
      g.add(tray)
      tray.add(box(kit, W - 0.16, H - 0.16, D - 0.1, M.inside, [0, 0, D / 2 - 0.02]))
      tray.add(box(kit, W - 0.06, H - 0.06, 0.06, M.wood, [0, 0, D + 0.01]))
      const f = face(kit, h, W - 0.06, H - 0.06)
      f.plane.position.set(0, 0, D + 0.045)
      tray.add(f.plane)
      g.add(shelf(kit, W, -H / 2, D))
      let z = 0
      update = (s, dt) => {
        f.set(s.active)
        z = ease(z, s.active ? 0.42 : 0, dt, 4)
        tray.position.z = z
      }
      break
    }
    case 'terminal': {
      const sh = H * 0.72
      const screenMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, roughness: 0.2 }))
      g.add(box(kit, W, sh, 0.16, M.darkSteel, [0, H / 2 - sh / 2, 0.25]))
      const scr = mesh(kit, new THREE.PlaneGeometry(W - 0.12, sh - 0.12), screenMat, [0, H / 2 - sh / 2, 0.335])
      g.add(scr)
      g.add(box(kit, 0.12, H * 0.2, 0.08, M.darkSteel, [0, -H / 2 + H * 0.14, 0.25]))
      g.add(box(kit, W * 0.6, 0.05, 0.35, M.darkSteel, [0, -H / 2 + 0.03, 0.3]))
      g.add(box(kit, W * 0.7, 0.04, 0.22, M.gray, [0, -H / 2 + 0.05, 0.62]))
      g.add(shelf(kit, W, -H / 2, 0.8))
      const waiting = screenTex(kit, ['> מערכת פעילה', '> נדרשת סיסמה', '> ממתין לקלט_'], '#7ee8dc', '#03140f')
      const granted = screenTex(kit, ['> גישה אושרה ✓', '> המערכת פתוחה'], '#7ee8dc', '#03140f')
      const off = screenTex(kit, ['● אין חשמל'], '#3a5aa8', '#020611')
      screenMat.map = off
      let k = 0
      let flick = 0
      update = (s, dt, t) => {
        const target = s.powered ? 1 : 0
        if (target === 1 && k < 0.05) flick = 0.6
        k = ease(k, target, dt, 3)
        flick = Math.max(0, flick - dt)
        const map = !s.powered ? off : s.active ? granted : waiting
        if (screenMat.map !== map) {
          screenMat.map = map
          screenMat.emissiveMap = map
          screenMat.needsUpdate = true
        }
        screenMat.emissive.setScalar(s.powered ? 0.9 * k * (flick > 0 ? 0.5 + 0.5 * Math.sin(t * 60) : 1) : 0.15)
      }
      break
    }
    case 'console': {
      height = H
      const desk = box(kit, W, H * 0.45, 0.9, M.steel, [0, -H / 2 + H * 0.225, 0.45])
      g.add(desk)
      const top = box(kit, W, 0.06, 0.95, M.darkSteel, [0, -H / 2 + H * 0.45 + 0.05, 0.5])
      top.rotation.x = 0.25
      g.add(top)
      const btns: THREE.Mesh[] = []
      const colors = [0xe0533f, 0x2ec4b6, 0xf2c14e, 0x3f7be0, 0x3fb36b]
      for (let i = 0; i < 10; i++) {
        const mat = kit.track(new THREE.MeshStandardMaterial({ color: colors[i % 5], emissive: colors[i % 5], emissiveIntensity: 0.1 }))
        const b = box(kit, 0.16, 0.05, 0.12, mat, [-W / 2 + 0.4 + (i % 5) * ((W - 0.8) / 4), -H / 2 + H * 0.45 + 0.1 + (i < 5 ? 0.06 : 0), 0.35 + (i < 5 ? -0.12 : 0.15)], 0.01)
        b.rotation.x = 0.25
        btns.push(b)
        g.add(b)
      }
      const screenMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000 }))
      g.add(box(kit, W * 0.8, H * 0.42, 0.1, M.darkSteel, [0, H / 2 - H * 0.21, 0.12]))
      g.add(mesh(kit, new THREE.PlaneGeometry(W * 0.8 - 0.1, H * 0.42 - 0.1), screenMat, [0, H / 2 - H * 0.21, 0.175]))
      const on = screenTex(kit, ['מחשב התחנה', 'ONLINE ●'], '#7ee8dc', '#03140f')
      const off = screenTex(kit, ['אין מתח מהמנועים'], '#e0533f', '#020611')
      update = (s, _dt, t) => {
        const map = s.active ? on : off
        if (screenMat.map !== map) {
          screenMat.map = map
          screenMat.emissiveMap = map
          screenMat.needsUpdate = true
        }
        screenMat.emissive.setScalar(s.active ? 0.95 : 0.5 + 0.2 * Math.sin(t * 4))
        btns.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = s.active ? 0.6 + 0.4 * Math.sin(t * 3 + i) : 0.05))
      }
      break
    }
    case 'desk-under': {
      const topY = H / 2
      g.add(box(kit, W, 0.08, 1.0, M.wood, [0, topY, 0.5]))
      for (const sx of [-1, 1]) for (const sz of [0.1, 0.9]) g.add(box(kit, 0.07, H, 0.07, M.wood, [sx * (W / 2 - 0.08), 0, sz], 0.01))
      const note = mesh(kit, new THREE.PlaneGeometry(0.22, 0.18), kit.track(new THREE.MeshStandardMaterial({ map: kit.track(labelTexture('42', { fg: '#2a1d02', bg: '#ffd97a', w: 128, h: 104, size: 48 })), roughness: 0.8 })), [0.3, topY - 0.05, 0.95])
      note.rotation.x = Math.PI / 2 + 0.2
      g.add(note)
      break
    }
    case 'radio':
    case 'typewriter':
    case 'enigma':
    case 'phone': {
      // tabletop objects: a solid body printed with the object's art
      const D = h.art === 'phone' ? 0.35 : h.art === 'radio' ? 0.4 : 0.55
      const mat = h.art === 'phone' || h.art === 'typewriter' ? M.darkSteel : M.wood
      g.add(box(kit, W * 0.96, H * 0.9, D, mat, [0, -H * 0.05, D / 2], 0.04))
      const f = face(kit, h, W, H, { glow: h.art === 'enigma' || h.art === 'radio' })
      f.plane.position.z = D + 0.004
      g.add(f.plane)
      update = (s) => f.set(s.active)
      break
    }
    case 'machine': {
      const D = 1.1
      g.add(box(kit, W, H * 0.8, D, M.gray, [0, -H * 0.1, D / 2], 0.05))
      g.add(box(kit, W * 0.42, H * 0.22, D * 0.6, M.darkSteel, [0, H / 2 - H * 0.11, D * 0.4], 0.03))
      const f = face(kit, h, W, H)
      f.plane.position.z = D + 0.004
      g.add(f.plane)
      const lights = [0, 1, 2].map((i) => {
        const m = mesh(kit, new THREE.SphereGeometry(0.06, 16, 16), kit.track(new THREE.MeshStandardMaterial({ color: 0xe0533f, emissive: 0xe0533f, emissiveIntensity: 1.5 })), [-W * 0.12 + i * W * 0.12, H / 2 - H * 0.1, D * 0.72])
        g.add(m)
        return m
      })
      const cover = mesh(kit, new THREE.BoxGeometry(W + 0.1, H * 0.82, D + 0.1), kit.track(new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.95 })), [0, -H * 0.1, D / 2])
      cover.visible = false
      g.add(cover)
      let k = 0
      update = (s, dt, t) => {
        f.set(s.active)
        lights.forEach((m, i) => {
          const mat = m.material as THREE.MeshStandardMaterial
          const on = s.active ? 0x2ec4b6 : 0xe0533f
          mat.color.set(on)
          mat.emissive.set(on)
          mat.emissiveIntensity = 1 + 0.6 * Math.sin(t * 3 + i)
        })
        // a tarp drops over the machine when it is "active" (covered) in the factory; elsewhere it just powers up
        k = ease(k, s.active && h.id === 'machine' ? 1 : 0, dt, 3)
        cover.visible = k > 0.02
        cover.scale.y = Math.max(0.02, k)
        cover.position.y = -H * 0.1 + (1 - k) * H * 0.4
      }
      break
    }
    case 'lamp': {
      if (h.variant === 'signal') {
        g.add(box(kit, 0.06, H * 0.3, 0.06, M.darkSteel, [0, H / 2 - H * 0.15, 0.25], 0))
        const bulbMat = kit.track(new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2.5 }))
        const bulb = mesh(kit, new THREE.SphereGeometry(W * 0.28, 24, 16), bulbMat, [0, 0, 0.3])
        g.add(bulb)
        g.add(mesh(kit, new THREE.CylinderGeometry(W * 0.32, W * 0.36, 0.08, 24), M.darkSteel, [0, -W * 0.3, 0.3]))
        const light = new THREE.PointLight(0xff2a2a, 4, 5)
        light.position.set(0, 0, 0.6)
        g.add(light)
        update = (s, _dt, t) => {
          const c = s.active ? 0x3fb36b : 0xff2a2a
          bulbMat.color.set(c)
          bulbMat.emissive.set(c)
          const pulse = s.active ? 1 : 0.5 + 0.5 * Math.sin(t * 5)
          bulbMat.emissiveIntensity = 1 + 2 * pulse
          light.color.set(c)
          light.intensity = 1 + 4 * pulse
        }
      } else {
        g.add(mesh(kit, new THREE.CylinderGeometry(0.03, 0.03, H * 0.75, 12), M.gray, [0, -H * 0.1, 0.4]))
        g.add(mesh(kit, new THREE.CylinderGeometry(0.22, 0.26, 0.05, 24), M.darkSteel, [0, -H / 2 + 0.03, 0.4]))
        g.add(mesh(kit, new THREE.ConeGeometry(0.3, 0.35, 24, 1, true), kit.track(new THREE.MeshStandardMaterial({ color: 0xc9d3f0, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide })), [0, H / 2 - 0.2, 0.4]))
        const bulbMat = kit.track(new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0xfff2c4, emissiveIntensity: 0 }))
        g.add(mesh(kit, new THREE.SphereGeometry(0.1, 16, 12), bulbMat, [0, H / 2 - 0.32, 0.4]))
        const light = new THREE.SpotLight(0xfff2c4, 0, 7, 0.9, 0.5, 1.2)
        light.position.set(0, H / 2 - 0.3, 0.4)
        light.target.position.set(0, -H, 2.5)
        g.add(light, light.target)
        update = (s, dt) => {
          bulbMat.emissiveIntensity = ease(bulbMat.emissiveIntensity, s.active ? 3 : 0, dt, 3)
          light.intensity = ease(light.intensity, s.active ? 40 : 0, dt, 3)
        }
      }
      break
    }
    case 'ladder': {
      for (const sx of [-1, 1]) g.add(box(kit, 0.08, H, 0.08, M.wood, [sx * W * 0.35, 0, 0.25], 0.02))
      const rungs = Math.floor(H / 0.4)
      for (let i = 0; i < rungs; i++) g.add(box(kit, W * 0.7, 0.05, 0.06, M.wood, [0, -H / 2 + 0.3 + i * 0.4, 0.25], 0.01))
      // a hatch / light at the top
      const glowMat = kit.track(new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 0 }))
      g.add(box(kit, W, 0.12, 0.6, M.darkSteel, [0, H / 2 + 0.06, 0.3], 0.02))
      const glow = mesh(kit, new THREE.PlaneGeometry(W * 0.9, 0.5), glowMat, [0, H / 2 + 0.01, 0.3])
      glow.rotation.x = Math.PI / 2
      g.add(glow)
      update = (s, dt) => {
        glowMat.emissiveIntensity = ease(glowMat.emissiveIntensity, s.escaped ? 4 : s.active ? 1.2 : 0, dt, 2)
      }
      break
    }
    case 'whiteboard':
    case 'poster':
    case 'calendar':
    case 'map':
    case 'manual':
    case 'starmap':
    case 'painting':
    case 'slot':
    case 'fusebox':
    case 'photo':
    case 'camera':
    case 'board':
    case 'gauges':
    case 'mirror':
    case 'card':
    case 'switches': {
      const D = h.art === 'painting' ? 0.1 : h.art === 'slot' || h.art === 'fusebox' ? 0.22 : h.art === 'switches' ? 0.14 : 0.05
      const frameMat = h.art === 'painting' ? M.gold : h.art === 'map' ? M.wood : h.art === 'whiteboard' || h.art === 'calendar' ? M.white : h.art === 'poster' || h.art === 'manual' ? M.white : M.darkSteel
      g.add(box(kit, W + (h.art === 'painting' ? 0.08 : 0.04), H + (h.art === 'painting' ? 0.08 : 0.04), D, frameMat, [0, 0, D / 2], 0.015))
      const glow = h.art === 'starmap' || h.art === 'slot' || h.art === 'switches' || h.art === 'fusebox'
      const f = face(kit, h, W, H, { glow })
      f.plane.position.z = D + 0.004
      g.add(f.plane)
      if (h.art === 'painting') {
        const plaque = mesh(kit, new THREE.PlaneGeometry(0.5, 0.12), M.gold, [0, -H / 2 - 0.16, 0.03])
        g.add(plaque)
      }
      const light = h.art === 'slot' || h.art === 'fusebox' ? new THREE.PointLight(h.art === 'slot' ? 0x2ec4b6 : 0xf2c14e, 0, 2.5) : null
      if (light) {
        light.position.set(0, 0, D + 0.4)
        g.add(light)
      }
      update = (s, dt) => {
        f.set(s.active)
        if (light) light.intensity = ease(light.intensity, s.active ? 2.2 : 0, dt, 3)
        if (h.art === 'switches') f.mat.emissiveIntensity = s.powered ? 0.3 : 0.06
      }
      break
    }
    case 'vent': {
      g.add(box(kit, W + 0.06, H + 0.06, 0.08, M.gray, [0, 0, 0.04]))
      g.add(mesh(kit, new THREE.PlaneGeometry(W - 0.06, H - 0.06), M.inside, [0, 0, 0.085]))
      const grille = hinge(0, -H / 2, 0.1)
      g.add(grille)
      for (let i = 0; i < 6; i++) grille.add(box(kit, W - 0.1, 0.06, 0.03, M.gray, [0, 0.08 + i * ((H - 0.16) / 5), 0], 0.01))
      const screws = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => {
        const m = mesh(kit, new THREE.SphereGeometry(0.035, 12, 12), M.gold, [sx * (W / 2 - 0.02), sy * (H / 2 - 0.02), 0.11])
        g.add(m)
        return m
      })
      let a = 0
      update = (s, dt) => {
        a = ease(a, s.active ? 1.45 : 0, dt, 3)
        grille.rotation.x = a
        screws.forEach((m) => (m.visible = !s.active))
      }
      break
    }
    case 'safe': {
      const D = 0.75
      g.add(box(kit, W, H, D, M.steel, [0, 0, D / 2], 0.06))
      g.add(box(kit, W - 0.22, H - 0.22, 0.02, M.inside, [0, 0, D + 0.001], 0))
      const glow = new THREE.PointLight(0xffd27a, 0, 3)
      glow.position.set(0, 0, D + 0.1)
      g.add(glow)
      const hg = hinge(-W / 2 + 0.08, 0, D + 0.02)
      g.add(hg)
      hg.add(box(kit, W - 0.16, H - 0.16, 0.1, M.steel, [(W - 0.16) / 2, 0, 0.05], 0.03))
      const f = face(kit, h, W - 0.16, H - 0.16)
      f.plane.position.set((W - 0.16) / 2, 0, 0.102)
      hg.add(f.plane)
      for (const y of [0.25, -0.25]) g.add(box(kit, 0.07, 0.24, 0.12, M.gold, [-W / 2 + 0.04, y * H, D + 0.03], 0.02))
      let a = 0
      update = (s, dt) => {
        const open = s.active || s.escaped
        a = ease(a, open ? -1.9 : 0, dt, 2.2)
        hg.rotation.y = a
        glow.intensity = ease(glow.intensity, open ? 3 : 0, dt, 2)
      }
      break
    }
    case 'book': {
      g.add(box(kit, W * 0.7, 0.5, 0.35, M.wood, [0, -H / 2 + 0.25 - 0.3, 0.3]))
      const f = face(kit, h, W, H, { transparent: true })
      f.plane.rotation.x = -1.0
      f.plane.position.set(0, -H / 2 + 0.05, 0.3)
      g.add(f.plane)
      g.add(shelf(kit, W, -H / 2 - 0.3, 0.6))
      break
    }
    case 'locker':
    case 'cabinet': {
      const D = 0.6
      const mat = h.art === 'locker' ? M.steel : M.wood
      g.add(box(kit, W, H, D, mat, [0, 0, D / 2], 0.03))
      g.add(box(kit, W - 0.1, H - 0.1, 0.02, M.inside, [0, 0, D + 0.001], 0))
      const hg = hinge(-W / 2 + 0.03, 0, D + 0.02)
      g.add(hg)
      hg.add(box(kit, W - 0.06, H - 0.06, 0.05, mat, [(W - 0.06) / 2, 0, 0.025], 0.02))
      const f = face(kit, h, W - 0.06, H - 0.06)
      f.plane.position.set((W - 0.06) / 2, 0, 0.052)
      hg.add(f.plane)
      let a = 0
      update = (s, dt) => {
        a = ease(a, s.active ? -1.8 : 0, dt, 2.4)
        hg.rotation.y = a
      }
      break
    }
    case 'crate': {
      const D = Math.min(H, 0.9)
      g.add(box(kit, W, H, D, M.wood, [0, 0, D / 2], 0.03))
      const lid = hinge(0, H / 2, 0.02)
      g.add(lid)
      lid.add(box(kit, W + 0.04, 0.08, D + 0.04, M.wood, [0, 0.04, D / 2], 0.02))
      const f = face(kit, h, W, H)
      f.plane.position.z = D + 0.004
      g.add(f.plane)
      let a = 0
      update = (s, dt) => {
        f.set(s.active)
        a = ease(a, s.active ? -1.2 : 0, dt, 3)
        lid.rotation.x = a
      }
      break
    }
    case 'mixer': {
      const baseH = 0.55
      g.add(box(kit, W, baseH, 0.7, M.steel, [0, -H / 2 + baseH / 2, 0.35], 0.04))
      const led = mesh(kit, new THREE.SphereGeometry(0.07, 16, 16), kit.track(new THREE.MeshStandardMaterial({ color: 0xe0533f, emissive: 0xe0533f, emissiveIntensity: 1 })), [0, -H / 2 + baseH / 2, 0.72])
      g.add(led)
      const colors = [0xe0533f, 0x3fb36b, 0x3f7be0, 0xf2c14e]
      const tubeH = H - baseH - 0.1
      const liquids: THREE.Mesh[] = []
      colors.forEach((c, i) => {
        const x = -W / 2 + 0.3 + i * ((W - 0.6) / 3)
        g.add(mesh(kit, new THREE.CylinderGeometry(0.12, 0.12, tubeH, 32, 1, true), M.glass, [x, -H / 2 + baseH + tubeH / 2, 0.35]))
        const liq = mesh(kit, new THREE.CylinderGeometry(0.1, 0.1, 1, 32), kit.track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 })), [x, 0, 0.35])
        liq.castShadow = false
        liquids.push(liq)
        g.add(liq)
      })
      g.add(shelf(kit, W, -H / 2, 0.7))
      let k = 0
      update = (s, dt, t) => {
        k = ease(k, s.active ? 1 : 0.25, dt, 2)
        liquids.forEach((l, i) => {
          const hh = Math.max(0.05, tubeH * (k + 0.03 * Math.sin(t * 2 + i)))
          l.scale.y = hh
          l.position.y = -H / 2 + baseH + hh / 2
        })
        const m = led.material as THREE.MeshStandardMaterial
        m.color.set(s.active ? 0x2ec4b6 : 0xe0533f)
        m.emissive.set(s.active ? 0x2ec4b6 : 0xe0533f)
      }
      break
    }
    case 'tanks': {
      const r = W / 6 - 0.06
      for (let i = 0; i < 3; i++) {
        const x = -W / 2 + W / 6 + i * (W / 3)
        g.add(mesh(kit, new THREE.CylinderGeometry(r, r, H - r * 2, 32), M.white, [x, -r / 2, r + 0.05]))
        g.add(mesh(kit, new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.white, [x, H / 2 - r * 1.5, r + 0.05]))
        g.add(box(kit, 0.1, 0.2, 0.1, M.gray, [x, H / 2 - r * 0.4, r + 0.05]))
        const gauge = mesh(kit, new THREE.CircleGeometry(r * 0.55, 32), kit.track(new THREE.MeshStandardMaterial({ map: kit.track(labelTexture(String([12, 7, 23][i]), { fg: '#08122c', bg: '#ffffff', w: 128, h: 128, size: 64 })) })), [x, H / 4, r * 2 + 0.06])
        g.add(gauge)
      }
      break
    }
    case 'statues': {
      const names = ['אריה', 'ורד', 'רקדנית']
      for (let i = 0; i < 3; i++) {
        const x = -W / 2 + W / 6 + i * (W / 3)
        const ph = 0.7
        g.add(box(kit, W / 3 - 0.2, ph, 0.6, M.marble, [x, -H / 2 + ph / 2, 0.45], 0.03))
        const plaque = mesh(kit, new THREE.PlaneGeometry(0.5, 0.14), kit.track(new THREE.MeshStandardMaterial({ map: kit.track(labelTexture(names[i], { fg: '#2a1d02', bg: '#f2c14e', w: 256, h: 72, size: 40 })), metalness: 0.6, roughness: 0.3 })), [x, -H / 2 + ph / 2, 0.751])
        g.add(plaque)
        const baseY = -H / 2 + ph
        if (i === 0) {
          g.add(mesh(kit, new THREE.SphereGeometry(0.28, 32, 24), M.marble, [x, baseY + 0.32, 0.45]))
          g.add(mesh(kit, new THREE.SphereGeometry(0.2, 32, 24), M.marble, [x + 0.12, baseY + 0.62, 0.55]))
          g.add(mesh(kit, new THREE.TorusGeometry(0.2, 0.06, 12, 32), M.marble, [x + 0.12, baseY + 0.62, 0.5]))
        } else if (i === 1) {
          g.add(mesh(kit, new THREE.CylinderGeometry(0.035, 0.05, 0.75, 12), M.marble, [x, baseY + 0.38, 0.45]))
          const bloom = mesh(kit, new THREE.DodecahedronGeometry(0.2, 1), M.marble, [x, baseY + 0.85, 0.45])
          g.add(bloom)
          g.add(mesh(kit, new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.marble, [x + 0.12, baseY + 0.4, 0.45]))
        } else {
          g.add(mesh(kit, new THREE.ConeGeometry(0.22, 0.65, 24), M.marble, [x, baseY + 0.33, 0.45]))
          g.add(mesh(kit, new THREE.CylinderGeometry(0.07, 0.08, 0.35, 12), M.marble, [x, baseY + 0.8, 0.45]))
          g.add(mesh(kit, new THREE.SphereGeometry(0.11, 24, 16), M.marble, [x, baseY + 1.06, 0.45]))
          const arms = mesh(kit, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), M.marble, [x, baseY + 0.92, 0.45])
          arms.rotation.z = 1.2
          g.add(arms)
        }
      }
      break
    }
    case 'showcase': {
      const ph = H * 0.45
      g.add(box(kit, W, ph, 0.8, M.wood, [0, -H / 2 + ph / 2, 0.45], 0.03))
      const glass = box(kit, W - 0.08, H - ph, 0.72, M.glass, [0, -H / 2 + ph + (H - ph) / 2, 0.45], 0.01)
      glass.castShadow = false
      g.add(glass)
      const loupe = new THREE.Group()
      loupe.position.set(0, -H / 2 + ph + 0.3, 0.45)
      loupe.add(mesh(kit, new THREE.TorusGeometry(0.15, 0.03, 12, 32), M.gold))
      const handle = mesh(kit, new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), M.wood, [0.15, -0.22, 0])
      handle.rotation.z = 0.6
      loupe.add(handle)
      g.add(loupe)
      for (const [i, c] of [0xe0533f, 0x3f7be0, 0x3fb36b].entries()) g.add(mesh(kit, new THREE.SphereGeometry(0.05, 16, 16), kit.track(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5 })), [-0.15 + i * 0.15, -H / 2 + ph * 0.6, 0.86]))
      const laserMat = kit.track(new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9 }))
      const lasers = new THREE.Group()
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(kit.track(new THREE.CylinderGeometry(0.008, 0.008, W + 0.8, 6)), laserMat)
        l.rotation.z = Math.PI / 2 + (i % 2 ? 0.25 : -0.25)
        l.position.set(0, -H / 2 + ph + 0.15 + i * ((H - ph - 0.3) / 4), 0.95)
        lasers.add(l)
      }
      g.add(lasers)
      update = (s, dt, t) => {
        laserMat.opacity = ease(laserMat.opacity, s.active ? 0 : 0.75 + 0.2 * Math.sin(t * 9), dt, 6)
        lasers.visible = laserMat.opacity > 0.02
        loupe.visible = !s.active
        loupe.rotation.y = t * 0.6
      }
      break
    }
    case 'owl': {
      g.add(box(kit, W, 0.18, 0.5, M.wood, [0, -H / 2 + 0.09, 0.3]))
      const body = mesh(kit, new THREE.SphereGeometry(0.3, 32, 24), M.bronze, [0, -H / 2 + 0.5, 0.3])
      body.scale.set(1, 1.3, 0.9)
      g.add(body)
      for (const s of [-1, 1]) {
        g.add(mesh(kit, new THREE.SphereGeometry(0.09, 16, 16), M.gold, [s * 0.11, -H / 2 + 0.72, 0.52]))
        g.add(mesh(kit, new THREE.SphereGeometry(0.04, 12, 12), M.inside, [s * 0.11, -H / 2 + 0.72, 0.6]))
        const ear = mesh(kit, new THREE.ConeGeometry(0.06, 0.14, 12), M.bronze, [s * 0.16, -H / 2 + 0.92, 0.3])
        g.add(ear)
      }
      g.add(mesh(kit, new THREE.ConeGeometry(0.04, 0.1, 12), M.gold, [0, -H / 2 + 0.62, 0.58]))
      const engraving = mesh(kit, new THREE.SphereGeometry(0.04, 12, 12), kit.track(new THREE.MeshStandardMaterial({ color: 0x7ee8dc, emissive: 0x7ee8dc, emissiveIntensity: 2 })), [0, -H / 2 + 0.09, 0.56])
      g.add(engraving)
      g.add(shelf(kit, W, -H / 2, 0.6))
      update = (s) => {
        engraving.visible = s.active
      }
      break
    }
    case 'jewelbox': {
      const bh = H * 0.55
      g.add(box(kit, W, bh, 0.55, M.velvet, [0, -H / 2 + bh / 2, 0.3], 0.03))
      g.add(box(kit, W + 0.02, 0.03, 0.57, M.gold, [0, -H / 2 + bh, 0.3], 0.01))
      const gem = mesh(kit, new THREE.OctahedronGeometry(0.08, 0), kit.track(new THREE.MeshStandardMaterial({ color: 0x7ee8dc, emissive: 0x2ec4b6, emissiveIntensity: 1.2 })), [0, -H / 2 + bh + 0.05, 0.3])
      g.add(gem)
      const lid = hinge(0, -H / 2 + bh, 0.03)
      g.add(lid)
      lid.add(box(kit, W + 0.02, 0.1, 0.56, M.velvet, [0, 0.05, 0.28], 0.03))
      g.add(shelf(kit, W, -H / 2, 0.6))
      let a = 0
      update = (s, dt, t) => {
        a = ease(a, s.active ? -1.4 : 0, dt, 3)
        lid.rotation.x = a
        gem.visible = s.active
        gem.rotation.y = t
      }
      break
    }
    default: {
      const f = face(kit, h, W, H)
      f.plane.position.z = 0.02
      g.add(f.plane)
      update = (s) => f.set(s.active)
    }
  }
  return { group: g, update, floor, height }
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  r = Math.min(r, w / 2, h / 2)
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function screenTex(kit: Kit, lines: string[], fg: string, bg: string) {
  const res = Math.max(1, kit.density)
  const c = document.createElement('canvas')
  c.width = 512 * res
  c.height = 320 * res
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = fg
  g.font = `700 ${36 * res}px monospace, Heebo, Arial`
  g.textAlign = 'right'
  g.direction = 'rtl'
  lines.forEach((l, i) => g.fillText(l, c.width - 30 * res, (70 + i * 60) * res))
  // scanlines
  g.fillStyle = 'rgba(0,0,0,.18)'
  for (let y = 0; y < c.height; y += 4 * res) g.fillRect(0, y, c.width, 1.5 * res)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return kit.track(t)
}

/** A small wooden table for tabletop objects standing on the floor. */
export function tableUnder(kit: Kit, w: number, objHeight: number): THREE.Group {
  const t = new THREE.Group()
  const top = 0.85
  const W = Math.max(w + 0.3, 0.9)
  const y0 = -objHeight / 2 - top // floor, relative to the object's centre
  t.add(box(kit, W, 0.06, 0.9, kit.mats.wood, [0, y0 + top - 0.03, 0.45], 0.02))
  for (const sx of [-1, 1]) for (const z of [0.1, 0.8]) t.add(box(kit, 0.06, top - 0.06, 0.06, kit.mats.wood, [sx * (W / 2 - 0.08), y0 + (top - 0.06) / 2, z], 0.01))
  return t
}
