import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GOALIE_BOXES } from '../engine/netView'

export interface Kit {
  jersey: string
  ink: string
}

const mats = new Map<string, THREE.Material>()
function mat(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  const key = color + JSON.stringify(opts)
  let m = mats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts })
    mats.set(key, m)
  }
  return m
}

const numberTextures = new Map<string, THREE.Texture>()
function numberTexture(label: string, kit: Kit) {
  const key = `${label}|${kit.jersey}|${kit.ink}`
  let t = numberTextures.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = kit.jersey
  g.fillRect(0, 0, 128, 128)
  g.font = `900 ${label.length > 2 ? 54 : 84}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 8
  g.strokeStyle = kit.ink === '#fff' ? '#0b0b0b' : '#ffffff'
  g.strokeText(label, 64, 70)
  g.fillStyle = kit.ink
  g.fillText(label, 64, 70)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  numberTextures.set(key, t)
  return t
}

function box(w: number, h: number, d: number, m: THREE.Material, r = 0.03) {
  const mesh = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), m)
  mesh.castShadow = true
  return mesh
}

const UP = new THREE.Vector3(0, 1, 0)
function limb(radius: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 1, 10), m)
  mesh.castShadow = true
  return mesh
}
function placeLimb(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = d.length()
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(UP, d.normalize())
}

export interface Motion {
  puck?: boolean
  shot?: number
  pass?: number
  focus?: THREE.Vector3
  vel?: { x: number; y: number }
  live?: number
}

export type Reaction = 'butterfly' | 'glove' | 'blocker'

export interface Figure {
  root: THREE.Group
  update: (speed: number, dt: number, motion?: Motion) => void
  react?: (kind: Reaction) => void
  setFirstPerson?: (on: boolean) => void
  setHighlight: (on: boolean) => void
  ballAt?: () => THREE.Vector3 | null
}

function highlightRing(radius: number) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.82, radius, 40),
    new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.85, depthWrite: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012
  ring.visible = false
  return ring
}

function sphere(r: number, m: THREE.Material, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m)
  mesh.castShadow = true
  return mesh
}

function oval(rTop: number, rBot: number, h: number, depth: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 20), m)
  mesh.scale.x = depth
  mesh.castShadow = true
  return mesh
}

function cage(r: number, h: number, m: THREE.Material) {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 9, 4, true, 0.25, Math.PI - 0.5), new THREE.MeshStandardMaterial({ color: (m as THREE.MeshStandardMaterial).color, wireframe: true, metalness: 0.6, roughness: 0.3 }))
  return g
}

class Arm {
  upper: THREE.Mesh
  fore: THREE.Mesh
  elbow: THREE.Mesh
  glove: THREE.Object3D
  constructor(parent: THREE.Object3D, sleeve: THREE.Material, glove: THREE.Object3D, r = 0.055) {
    this.upper = limb(r, sleeve)
    this.fore = limb(r * 0.85, sleeve)
    this.elbow = sphere(r * 1.05, sleeve, 10)
    this.glove = glove
    parent.add(this.upper, this.fore, this.elbow, glove)
  }
  place(shoulder: THREE.Vector3, hand: THREE.Vector3, out: THREE.Vector3) {
    const mid = shoulder.clone().lerp(hand, 0.5)
    const span = shoulder.distanceTo(hand)
    const bend = Math.sqrt(Math.max(0, 0.34 * 0.34 - (span / 2) * (span / 2)))
    const elbow = mid.addScaledVector(out, bend)
    placeLimb(this.upper, shoulder, elbow)
    placeLimb(this.fore, elbow, hand)
    this.elbow.position.copy(elbow)
    this.glove.position.copy(hand)
  }
}

export function buildSkater(label: string, kit: Kit, opts: { coach?: boolean } = {}): Figure {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const jersey = mat(kit.jersey, { roughness: 0.75 })
  const trim = mat(kit.ink === '#fff' ? '#f8fafc' : '#111827', { roughness: 0.75 })
  const pants = mat(opts.coach ? '#1f2937' : '#111827', { roughness: 0.65 })
  const black = mat('#0b0b0b', { roughness: 0.45 })
  const holder = mat('#e5e7eb', { roughness: 0.4 })
  const steel = mat('#cbd5e1', { metalness: 0.85, roughness: 0.2 })
  const skin = mat('#f1c7a5', { roughness: 0.8 })
  const stickMat = mat('#1f2937', { roughness: 0.5 })
  const tape = mat('#f8fafc', { roughness: 0.9 })
  const helmetMat = mat(opts.coach ? '#111827' : kit.jersey, { roughness: 0.3, metalness: 0.1 })
  const cageMat = mat('#9ca3af')
  const gloveMat = mat(opts.coach ? '#111827' : kit.jersey, { roughness: 0.6 })

  const HIP = 0.84
  const THIGH = 0.4
  const SHIN = 0.4
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group()
    hip.position.set(0, HIP, side * 0.1)
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, THIGH - 0.12, 4, 12), pants)
    thigh.position.y = -THIGH / 2
    thigh.castShadow = true
    const knee = new THREE.Group()
    knee.position.y = -THIGH
    const kneePad = sphere(0.075, opts.coach ? pants : jersey, 10)
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, SHIN - 0.06, 14), opts.coach ? pants : jersey)
    shin.position.y = -SHIN / 2
    shin.castShadow = true
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.05, 14), trim)
    band.position.y = -SHIN * 0.42
    const foot = new THREE.Group()
    foot.position.y = -SHIN
    const boot = box(0.27, 0.13, 0.11, black, 0.04)
    boot.position.set(0.05, -0.02, 0)
    const hold = box(0.27, 0.05, 0.03, holder, 0.01)
    hold.position.set(0.05, -0.1, 0)
    const blade = box(0.3, 0.025, 0.008, steel, 0)
    blade.position.set(0.05, -0.135, 0)
    foot.add(boot, hold, blade)
    knee.add(kneePad, shin, band, foot)
    hip.add(thigh, knee)
    body.add(hip)
    return { hip, knee, foot, side }
  })

  const torso = new THREE.Group()
  torso.position.set(0, HIP + 0.04, 0)
  body.add(torso)
  const shorts = oval(0.19, 0.2, 0.26, 0.78, pants)
  shorts.position.y = 0.02
  const stripe = oval(0.195, 0.2, 0.035, 0.79, trim)
  stripe.position.y = -0.04
  const shirt = oval(0.23, 0.2, 0.5, 0.68, jersey)
  shirt.position.y = 0.38
  const hem1 = oval(0.205, 0.205, 0.04, 0.69, trim)
  hem1.position.y = 0.2
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 12), jersey)
  shoulders.rotation.x = Math.PI / 2
  shoulders.scale.set(0.9, 1, 1)
  shoulders.position.y = 0.6
  shoulders.castShadow = true
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshStandardMaterial({ map: numberTexture(label, kit), roughness: 0.75, transparent: true }))
  back.position.set(-0.162, 0.42, 0)
  back.rotation.y = -Math.PI / 2
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), skin)
  neck.position.set(0.02, 0.72, 0)
  const head = new THREE.Group()
  head.position.set(0.05, 0.85, 0)
  const helmet = sphere(0.125, helmetMat, 20)
  helmet.scale.set(1.12, 0.95, 0.95)
  helmet.position.y = 0.02
  const face = sphere(0.095, skin, 14)
  face.position.set(0.04, -0.03, 0)
  const ears = box(0.07, 0.07, 0.25, helmetMat, 0.03)
  ears.position.set(0.0, -0.03, 0)
  head.add(helmet, face, ears)
  if (!opts.coach) {
    const mask = cage(0.12, 0.16, cageMat)
    mask.position.set(0.0, -0.05, 0)
    head.add(mask)
  }
  torso.add(shorts, stripe, shirt, hem1, shoulders, back, neck, head)

  const stick = new THREE.Group()
  const shaft = limb(0.016, stickMat)
  const bladeMesh = box(0.3, 0.07, 0.016, stickMat, 0.008)
  const tapeMesh = box(0.16, 0.072, 0.018, tape, 0.005)
  const knob = box(0.04, 0.06, 0.04, tape, 0.01)
  stick.add(shaft, bladeMesh, tapeMesh, knob)
  if (!opts.coach) body.add(stick)
  const placeStick = (top: THREE.Vector3, heel: THREE.Vector3, yaw: number) => {
    placeLimb(shaft, top, heel)
    const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    bladeMesh.position.copy(heel).addScaledVector(dir, 0.14)
    bladeMesh.rotation.set(0, yaw, 0)
    tapeMesh.position.copy(heel).addScaledVector(dir, 0.18)
    tapeMesh.rotation.set(0, yaw, 0)
    knob.position.copy(top)
  }

  const gloveL = box(0.13, 0.11, 0.12, gloveMat, 0.04)
  const gloveR = box(0.13, 0.11, 0.12, gloveMat, 0.04)
  const armL = new Arm(body, jersey, gloveL)
  const armR = new Arm(body, jersey, gloveR)
  const shoulderPt = (side: number) => torso.localToWorld(new THREE.Vector3(0, 0.6, side * 0.2)).applyMatrix4(new THREE.Matrix4().copy(body.matrixWorld).invert())

  const ring = highlightRing(0.75)
  root.add(ring)
  root.scale.setScalar(0.95)
  const hidden: THREE.Object3D[] = [torso, stick, ...legs.map((l) => l.hip), armL.upper, armL.fore, armL.elbow, gloveL, armR.upper, armR.fore, armR.elbow, gloveR]

  const TOP = new THREE.Vector3(0.18, 1.02, -0.22)
  const HEEL = new THREE.Vector3(0.66, 0.04, 0.03)
  const FREE_HEEL = new THREE.Vector3(0.62, 0.08, 0.2)
  let phase = Math.random() * 6
  let dribble = Math.random() * 6
  let amt = 0
  let hold = 0
  const outL = new THREE.Vector3(-0.2, -0.5, -0.85).normalize()
  const outR = new THREE.Vector3(-0.3, -0.6, 0.75).normalize()
  const pose = (dt: number, speed: number, m: Motion) => {
    const target = Math.min(1, speed / 6)
    amt += (target - amt) * Math.min(1, dt * 6)
    phase += dt * (2.6 + speed * 0.75)
    dribble += dt * (5.5 + speed * 0.5)
    const shooting = m.shot !== undefined
    hold += ((m.puck || shooting ? 1 : 0) - hold) * Math.min(1, dt * 5)
    for (const { hip, knee, foot, side } of legs) {
      const s = Math.sin(phase + (side > 0 ? Math.PI : 0))
      const push = Math.max(0, -s)
      hip.rotation.z = 0.5 + s * 0.28 * amt
      hip.rotation.x = side * (0.06 + push * 0.32 * amt)
      knee.rotation.z = -0.95 + push * 0.55 * amt
      foot.rotation.z = -(hip.rotation.z + knee.rotation.z)
      foot.rotation.x = -hip.rotation.x * 0.8
    }
    const stride = Math.sin(phase)
    body.position.y = -0.02 - 0.03 * amt
    torso.rotation.z = -0.35 - 0.22 * amt
    torso.rotation.x = stride * 0.07 * amt
    torso.rotation.y = stride * 0.14 * amt * (1 - hold * 0.6)
    head.rotation.z = 0.3 + 0.2 * amt
    head.rotation.y = -torso.rotation.y * 0.8

    const top = TOP.clone()
    const heel = HEEL.clone().lerp(FREE_HEEL, 1 - hold)
    const sway = Math.sin(dribble) * 0.1 * hold
    heel.z += sway
    heel.x += Math.cos(dribble * 0.5) * 0.04 * hold
    top.z -= sway * 0.35
    top.x += stride * 0.08 * amt * (1 - hold)
    heel.x += stride * 0.06 * amt * (1 - hold)
    let yaw = -0.12 + sway * 0.8
    if (shooting) {
      const k = m.shot!
      const wind = k < 0.7 ? Math.sin((k / 0.7) * (Math.PI / 2)) : Math.max(0, 1 - (k - 0.7) / 0.12)
      const follow = k < 0.7 ? 0 : Math.min(1, (k - 0.7) / 0.12)
      heel.x += -0.5 * wind + 0.3 * follow
      heel.y += 0.22 * wind + 0.4 * follow
      heel.z += 0.3 * wind - 0.2 * follow
      top.x += -0.1 * wind + 0.15 * follow
      yaw += 0.5 * wind - 0.6 * follow
      torso.rotation.y = 0.45 * wind - 0.4 * follow
    }
    if (opts.coach) {
      torso.rotation.set(0, 0, -0.08)
      head.rotation.set(0, 0, 0.08)
    }
    root.updateMatrixWorld(true)
    if (opts.coach) {
      armL.place(shoulderPt(-1), new THREE.Vector3(0.05, 0.92, -0.32), new THREE.Vector3(0, 0, -1))
      armR.place(shoulderPt(1), new THREE.Vector3(0.05, 0.92, 0.32), new THREE.Vector3(0, 0, 1))
      return
    }
    placeStick(top, heel, yaw)
    const sR = shoulderPt(1)
    const freeHand = sR.clone().add(new THREE.Vector3(0.08 - stride * 0.3 * amt, -0.48 + Math.max(0, -stride) * 0.12 * amt, 0.12))
    const stickHand = top.clone().lerp(heel, 0.36)
    armL.place(shoulderPt(-1), top, outL)
    armR.place(sR, freeHand.lerp(stickHand, hold), outR)
  }
  pose(0, 0, {})

  return {
    root,
    setHighlight: (on) => {
      ring.visible = on
    },
    setFirstPerson: (on) => hidden.forEach((m) => (m.visible = !on)),
    update: (speed, dt, motion = {}) => {
      if (dt > 0 || motion.shot !== undefined) pose(Math.max(dt, 1 / 60), speed, motion)
    },
  }
}

export function buildGoalie(label: string, kit: Kit): Figure {
  const root = new THREE.Group()
  const upper = new THREE.Group()
  root.add(upper)
  const jersey = mat(kit.jersey, { roughness: 0.75 })
  const white = mat('#f8fafc', { roughness: 0.55 })
  const trim = mat(kit.jersey, { roughness: 0.5 })
  const dark = mat('#111827', { roughness: 0.6 })
  const stickMat = mat('#6b3f1d', { roughness: 0.6 })
  const cageMat = mat('#1f2937')
  const firstPerson: THREE.Object3D[] = []
  const B = Object.fromEntries(GOALIE_BOXES.map((b) => [b.name, b]))
  const at = (name: string, dx = 0, dy = 0, dz = 0) => new THREE.Vector3(B[name].c[0] + dx, B[name].c[2] + dy, -B[name].c[1] + dz)
  const size = (name: string) => B[name].h.map((h) => h * 2) as [number, number, number]

  const pads = (['padL', 'padR'] as const).map((name) => {
    const [f, l, u] = size(name)
    const knee = at(name, 0, u / 2)
    const pivot = new THREE.Group()
    pivot.position.copy(knee)
    const g = new THREE.Group()
    g.position.y = -u / 2
    pivot.add(g)
    const pad = box(f * 0.9, u, l * 0.95, white, 0.09)
    const face = box(0.02, u * 0.92, l * 0.75, white, 0.01)
    face.position.x = f * 0.45
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, l * 0.9, 14), white)
    roll.rotation.x = Math.PI / 2
    roll.position.set(f * 0.42, 0.04, 0)
    roll.castShadow = true
    const rise = box(f * 0.7, 0.16, l * 0.85, white, 0.06)
    rise.position.set(-0.01, u / 2 + 0.05, 0)
    const toe = box(0.12, 0.08, l * 0.8, white, 0.03)
    toe.position.set(f * 0.4, -u / 2 + 0.04, 0)
    g.add(pad, face, roll, rise, toe)
    for (const y of [-0.3, -0.14, 0.2, 0.3]) {
      const s = box(f * 0.92, 0.03, l * 0.97, trim, 0.01)
      s.position.set(0.004, y, 0)
      g.add(s)
    }
    const skate = box(0.3, 0.08, 0.12, dark, 0.03)
    skate.position.set(0.0, -u / 2 + 0.02, 0)
    g.add(skate)
    root.add(pivot)
    return { pivot, knee, side: name === 'padL' ? 1 : -1 }
  })

  const pants = oval(0.27, 0.25, size('pants')[2] + 0.04, 0.64, dark)
  pants.position.copy(at('pants'))
  const pantsStripe = oval(0.272, 0.272, 0.035, 0.65, trim)
  pantsStripe.position.copy(at('pants', 0, 0.05))
  upper.add(pants, pantsStripe)

  const torso = new THREE.Group()
  torso.position.copy(at('pants', 0, 0.12))
  upper.add(torso)
  const [bf, , bu] = size('body')
  const bodyAt = at('body').sub(torso.position)
  const chest = oval(0.31, 0.27, bu, 0.62, jersey)
  chest.position.copy(bodyAt)
  const hem = oval(0.272, 0.272, 0.04, 0.63, mat(kit.ink === '#fff' ? '#f8fafc' : '#111827'))
  hem.position.copy(bodyAt).add(new THREE.Vector3(0, -bu / 2 + 0.05, 0))
  const caps = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.4, 4, 12), jersey)
  caps.rotation.x = Math.PI / 2
  caps.position.copy(bodyAt).add(new THREE.Vector3(0, bu / 2 - 0.06, 0))
  caps.castShadow = true
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshStandardMaterial({ map: numberTexture(label, kit), transparent: true }))
  num.position.copy(bodyAt).add(new THREE.Vector3(-bf * 0.31 - 0.03, 0.04, 0))
  num.rotation.y = -Math.PI / 2
  const head = new THREE.Group()
  head.position.copy(at('head').sub(torso.position))
  const [hf, hl, hu] = size('head')
  const mask = sphere(1, white, 20)
  mask.scale.set(hf * 0.52, hu * 0.55, hl * 0.5)
  const stripe = box(hf * 0.9, 0.035, hl * 1.02, trim, 0.012)
  stripe.position.y = hu * 0.22
  const bars = cage(hl * 0.5, hu * 0.5, cageMat)
  bars.position.set(0.02, -0.03, 0)
  const chin = box(0.06, 0.05, 0.12, white, 0.02)
  chin.position.set(0.09, -hu * 0.42, 0)
  const neckGuard = box(0.1, 0.06, 0.16, white, 0.02)
  neckGuard.position.set(0.06, -hu * 0.62, 0)
  head.add(mask, stripe, bars, chin, neckGuard)
  torso.add(chest, hem, caps, num, head)
  firstPerson.push(chest, hem, caps, num, head)

  const [gf, gl, gu] = size('glove')
  const glove = new THREE.Group()
  const gloveHome = at('glove')
  const pocket = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(gl, gu) * 0.55, Math.min(gl, gu) * 0.5, gf * 0.7, 20), mat('#f1f5f9', { roughness: 0.6 }))
  pocket.rotation.z = Math.PI / 2
  pocket.scale.set(1, 1, gu / gl)
  pocket.castShadow = true
  const web = box(gf * 0.5, gu * 0.5, gl * 0.35, trim, 0.03)
  web.position.set(0.02, gu * 0.25, -gl * 0.15)
  const cuffG = box(gf * 0.8, 0.12, 0.16, white, 0.04)
  cuffG.position.set(-0.04, -gu * 0.45, 0.06)
  glove.add(pocket, web, cuffG)

  const [kf, kl, ku] = size('blocker')
  const blocker = new THREE.Group()
  const blockerHome = at('blocker')
  const board = box(kf, ku, kl, white, 0.03)
  const blockStripe = box(kf + 0.006, 0.04, kl + 0.006, trim, 0.01)
  blockStripe.position.y = ku * 0.25
  const hand = box(0.12, 0.12, 0.1, white, 0.04)
  hand.position.set(-0.08, 0, 0.02)
  blocker.add(board, blockStripe, hand)

  const [pf, pl, pu] = size('paddle')
  const [lf, ll, lu] = size('blade')
  const stick = new THREE.Group()
  const paddle = box(pf, pu, pl, stickMat, 0.008)
  paddle.position.copy(at('paddle').sub(blockerHome))
  const blade = box(lf, lu, ll, stickMat, 0.012)
  blade.position.copy(at('blade').sub(blockerHome))
  const shaft = limb(0.017, stickMat)
  placeLimb(shaft, at('paddle', 0, B.paddle.h[2]).sub(blockerHome), new THREE.Vector3(-0.06, -0.05, 0))
  stick.add(paddle, blade, shaft)
  upper.add(glove, blocker, stick)

  const armL = new Arm(upper, jersey, new THREE.Group(), 0.085)
  const armR = new Arm(upper, jersey, new THREE.Group(), 0.085)
  firstPerson.push(armL.upper, armL.fore, armL.elbow, armR.upper, armR.fore, armR.elbow)

  const ring = highlightRing(0.9)
  root.add(ring)

  let t = 0
  let shuffle = 0
  let move = 0
  let reaction: { kind: Reaction; t: number } | null = null
  const weight = () => {
    if (!reaction) return 0
    const e = t - reaction.t
    if (e < 0.14) return e / 0.14
    if (e < 1.2) return 1
    if (e < 1.6) return 1 - (e - 1.2) / 0.4
    reaction = null
    return 0
  }
  const pose = (dt: number, speed: number) => {
    t += dt
    move += (Math.min(1, speed / 1.5) - move) * Math.min(1, dt * 8)
    shuffle += dt * 11 * move
    const w = weight()
    const bfly = reaction?.kind === 'butterfly' ? w : 0
    const gl = reaction?.kind === 'glove' ? w : 0
    const bl = reaction?.kind === 'blocker' ? w : 0
    const breathe = Math.sin(t * 2.2) * 0.006
    upper.position.set(0.04 * bfly, -0.4 * bfly + breathe - 0.015 * move, 0)
    torso.rotation.z = -0.1 - 0.08 * bfly
    for (const p of pads) {
      const lift = Math.max(0, Math.sin(shuffle + (p.side > 0 ? 0 : Math.PI))) * 0.035 * move
      p.pivot.position.set(p.knee.x + 0.05 * bfly, p.knee.y - 0.7 * bfly + lift, p.knee.z * (1 - 0.65 * bfly))
      p.pivot.rotation.set(-p.side * 1.3 * bfly, 0, 0.12 * bfly)
    }
    const gUp = gl - 0.25 * bfly
    glove.position.copy(gloveHome).add(new THREE.Vector3(0.08 * gl, 0.42 * gUp - 0.4 * bfly, -0.22 * gl))
    glove.rotation.set(0.4 * gl, 0, 0.2 * gl)
    blocker.position.copy(blockerHome).add(new THREE.Vector3(0.06 * bl, 0.3 * bl - 0.4 * bfly, 0.22 * bl))
    blocker.rotation.set(-0.3 * bl, 0, 0)
    stick.position.copy(blocker.position)
    stick.rotation.copy(blocker.rotation)
    const shoulderL = torso.position.clone().add(bodyAt).add(new THREE.Vector3(0, bu / 2 - 0.08, -0.25))
    const shoulderR = torso.position.clone().add(bodyAt).add(new THREE.Vector3(0, bu / 2 - 0.08, 0.25))
    armL.place(shoulderL, glove.position.clone().add(new THREE.Vector3(-0.1, -0.05, 0.04)), new THREE.Vector3(-0.3, -0.7, -0.6).normalize())
    armR.place(shoulderR, blocker.position.clone().add(new THREE.Vector3(-0.1, 0, -0.02)), new THREE.Vector3(-0.3, -0.7, 0.6).normalize())
  }
  pose(0, 0)

  return {
    root,
    setHighlight: (on) => {
      ring.visible = on
    },
    setFirstPerson: (on) => firstPerson.forEach((m) => (m.visible = !on)),
    react: (kind) => {
      reaction = { kind, t }
    },
    update: (speed, dt) => pose(dt, speed),
  }
}

export function buildPuck() {
  const g = new THREE.Group()
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.025, 24), mat('#050505', { roughness: 0.3 }))
  puck.position.y = 0.0125
  puck.castShadow = true
  g.add(puck)
  return g
}

export function buildCone() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 18), mat('#f97316', { roughness: 0.5 }))
  m.position.y = 0.16
  m.castShadow = true
  const g = new THREE.Group()
  g.add(m)
  return g
}
