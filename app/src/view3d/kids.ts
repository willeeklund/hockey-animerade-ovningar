import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Figure, Kit, Motion, Reaction } from './figures'

type Rng = () => number

export function rngFor(seed: string): Rng {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt))

const SKIN = ['#f7d7c4', '#f2c9ad', '#ecbf9f', '#e3ae8a', '#d39b74', '#bf8560', '#9c6542', '#7a4a2e', '#5e3820']
const SKIN_WEIGHTS = [3, 4, 4, 3, 2, 2, 1.4, 1, 0.8]
const HAIR = ['#e6cb86', '#d9b56a', '#c79a52', '#a8743c', '#7a4e2a', '#553420', '#36241a', '#1c1512', '#9c4526', '#c4683a']
const HAIR_WEIGHTS = [2.5, 3, 2.5, 2, 2.4, 2, 1.6, 1.2, 0.6, 0.5]
const IRIS = ['#4f86c6', '#6fa3d6', '#5f8a6a', '#7c8f9c', '#6b4a2b', '#4a2f1c', '#2f1d12']
const GOGGLES = ['#111827', '#f8fafc', '#facc15', '#22c55e', '#f97316', '#ec4899', '#0ea5e9']
const SHOES = [
  ['#f8fafc', '#2563eb'],
  ['#111827', '#f97316'],
  ['#f8fafc', '#ef4444'],
  ['#d9f99d', '#111827'],
  ['#e5e7eb', '#16a34a'],
  ['#1e3a8a', '#f8fafc'],
  ['#fda4af', '#f8fafc'],
] as const

type HairStyle = 'short' | 'buzz' | 'fringe' | 'ponytail' | 'bun' | 'curly' | 'long' | 'side'

export interface Look {
  skin: string
  hair: string
  iris: string
  style: HairStyle
  freckles: boolean
  hand: 1 | -1
  height: number
  goggles: string
  shoe: readonly [string, string]
  tie: string
  beard: boolean
}

function weighted<T>(r: Rng, xs: readonly T[], ws: readonly number[]) {
  const total = ws.reduce((a, b) => a + b, 0)
  let x = r() * total
  for (let i = 0; i < xs.length; i++) {
    x -= ws[i]
    if (x <= 0) return xs[i]
  }
  return xs[xs.length - 1]
}

export function lookFor(seed: string, adult = false): Look {
  const r = rngFor(seed)
  const skinI = SKIN.indexOf(weighted(r, SKIN, SKIN_WEIGHTS))
  const dark = skinI >= 6
  const hair = dark ? pick(r, ['#1c1512', '#2a1b13', '#36241a']) : weighted(r, HAIR, HAIR_WEIGHTS)
  const styles: HairStyle[] = adult ? ['short', 'buzz', 'side', 'ponytail', 'bun', 'short'] : ['short', 'fringe', 'ponytail', 'buzz', 'bun', 'curly', 'long', 'side', 'ponytail', 'short']
  const style = dark && r() < 0.4 ? 'curly' : pick(r, styles)
  return {
    skin: SKIN[skinI],
    hair,
    iris: dark ? pick(r, ['#4a2f1c', '#2f1d12', '#6b4a2b']) : pick(r, IRIS),
    style,
    freckles: !dark && r() < (hair === '#9c4526' || hair === '#c4683a' ? 0.85 : 0.22),
    hand: r() < 0.62 ? -1 : 1,
    height: adult ? lerp(1.22, 1.33, r()) : lerp(0.93, 1.06, r()),
    goggles: pick(r, GOGGLES),
    shoe: pick(r, SHOES),
    tie: pick(r, ['#ec4899', '#facc15', '#22d3ee', '#f8fafc', '#a855f7', '#111827']),
    beard: adult && (style === 'short' || style === 'buzz' || style === 'side') && r() < 0.45,
  }
}

const mats = new Map<string, THREE.Material>()
function cached<M extends THREE.Material>(key: string, make: () => M): M {
  let m = mats.get(key) as M | undefined
  if (!m) {
    m = make()
    mats.set(key, m)
  }
  return m
}

const shade = (c: string, k: number) => {
  const col = new THREE.Color(c)
  return k < 0 ? col.lerp(new THREE.Color('#000000'), -k) : col.lerp(new THREE.Color('#ffffff'), k)
}
const hex = (c: THREE.Color) => `#${c.getHexString()}`

function fabric(color: string, map?: THREE.Texture, rough = 0.85) {
  return cached(`fabric|${color}|${map?.uuid ?? ''}|${rough}`, () => new THREE.MeshPhysicalMaterial({ color: map ? '#ffffff' : color, map, roughness: rough, sheen: 0.7, sheenRoughness: 0.7, sheenColor: shade(map ? '#ffffff' : color, 0.35) }))
}
function skinMat(color: string, map?: THREE.Texture) {
  return cached(`skin|${color}|${map?.uuid ?? ''}`, () => new THREE.MeshPhysicalMaterial({ color: map ? '#ffffff' : color, map, roughness: 0.58, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff8c6b') }))
}
function plastic(color: string, rough = 0.35) {
  return cached(`plastic|${color}|${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough }))
}
function hairMat(color: string) {
  return cached(`hair|${color}`, () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: hairTexture(color), roughness: 0.6, sheen: 1, sheenRoughness: 0.35, sheenColor: shade(color, 0.45) }))
}

const textures = new Map<string, THREE.Texture>()
function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = textures.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.userData.shared = true
  textures.set(key, t)
  return t
}

function hairTexture(color: string) {
  const t = canvasTexture(`hairtex|${color}`, 512, 256, (g) => {
    const r = rngFor(color)
    g.fillStyle = color
    g.fillRect(0, 0, 512, 256)
    for (let i = 0; i < 1400; i++) {
      const x = r() * 512
      const light = r() < 0.5
      g.strokeStyle = hex(shade(color, light ? 0.18 + r() * 0.2 : -0.2 - r() * 0.25)) + (light ? '88' : 'aa')
      g.lineWidth = 0.6 + r() * 1.4
      g.beginPath()
      const y0 = r() * 60
      g.moveTo(x, y0)
      g.bezierCurveTo(x + (r() - 0.5) * 10, y0 + 80, x + (r() - 0.5) * 14, y0 + 160, x + (r() - 0.5) * 18, y0 + 200 + r() * 56)
      g.stroke()
    }
  })
  t.wrapS = THREE.RepeatWrapping
  return t
}

function faceTexture(look: Look) {
  return canvasTexture(`face|${look.skin}|${look.freckles}`, 512, 256, (g) => {
    g.fillStyle = look.skin
    g.fillRect(0, 0, 512, 256)
    const blush = hex(shade(look.skin, -0.12).lerp(new THREE.Color('#e0605a'), 0.35))
    for (const dx of [-44, 44]) {
      const grad = g.createRadialGradient(256 + dx, 158, 2, 256 + dx, 158, 34)
      grad.addColorStop(0, blush + 'aa')
      grad.addColorStop(1, blush + '00')
      g.fillStyle = grad
      g.fillRect(256 + dx - 40, 118, 80, 80)
    }
    const brow = g.createLinearGradient(0, 70, 0, 120)
    brow.addColorStop(0, hex(shade(look.skin, -0.05)) + '00')
    brow.addColorStop(1, hex(shade(look.skin, -0.1)) + '55')
    g.fillStyle = brow
    g.fillRect(200, 100, 112, 22)
    if (look.freckles) {
      const r = rngFor(look.skin + 'freckles')
      g.fillStyle = hex(shade(look.skin, -0.32)) + 'aa'
      for (let i = 0; i < 70; i++) {
        const x = 256 + (r() - 0.5) * 120
        const y = 140 + (r() - 0.5) * 36 - Math.abs(x - 256) * 0.1
        g.beginPath()
        g.ellipse(x, y, 1.2 + r() * 1.3, 1 + r(), 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

function eyeTexture(iris: string) {
  return canvasTexture(`eye|${iris}`, 256, 128, (g) => {
    g.fillStyle = '#f3efe9'
    g.fillRect(0, 0, 256, 128)
    const cx = 128
    const cy = 64
    const grad = g.createRadialGradient(cx, cy, 4, cx, cy, 22)
    grad.addColorStop(0, hex(shade(iris, -0.3)))
    grad.addColorStop(0.45, iris)
    grad.addColorStop(0.85, hex(shade(iris, 0.15)))
    grad.addColorStop(1, hex(shade(iris, -0.55)))
    g.fillStyle = grad
    g.beginPath()
    g.ellipse(cx, cy, 22, 23, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#0a0705'
    g.beginPath()
    g.ellipse(cx, cy, 9, 9.5, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = hex(shade(iris, 0.35)) + '66'
    g.lineWidth = 1
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      g.beginPath()
      g.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10)
      g.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20)
      g.stroke()
    }
    const corner = g.createLinearGradient(0, 0, 256, 0)
    corner.addColorStop(0.3, '#d9a8a000')
    corner.addColorStop(0.36, '#d9a8a000')
    corner.addColorStop(0.62, '#00000000')
    g.fillStyle = corner
    g.fillRect(0, 0, 256, 128)
  })
}

function jerseyTexture(label: string, kit: Kit, design: number, goalie: boolean) {
  return canvasTexture(`jersey|${label}|${kit.jersey}|${kit.ink}|${design}|${goalie}`, 1024, 512, (g) => {
    const base = kit.jersey
    const trim = kit.ink === '#fff' ? '#f8fafc' : '#111827'
    const deep = hex(shade(base, -0.28))
    g.fillStyle = base
    g.fillRect(0, 0, 1024, 512)
    if (design === 0) {
      g.fillStyle = deep
      for (const x of [0, 512, 1024]) g.fillRect(x - 46, 0, 92, 512)
      g.fillStyle = trim
      for (const x of [0, 512, 1024]) {
        g.fillRect(x - 50, 0, 6, 512)
        g.fillRect(x + 44, 0, 6, 512)
      }
    } else if (design === 1) {
      g.fillStyle = deep
      g.fillRect(0, 0, 1024, 92)
      g.fillStyle = trim
      g.fillRect(0, 92, 1024, 10)
    } else {
      g.save()
      g.fillStyle = trim
      g.translate(256, 220)
      g.rotate(-0.42)
      g.fillRect(-300, -26, 600, 52)
      g.restore()
      g.fillStyle = deep
      for (const x of [0, 512, 1024]) g.fillRect(x - 30, 0, 60, 512)
    }
    g.fillStyle = trim
    g.fillRect(0, 0, 1024, 14)
    g.fillRect(0, 498, 1024, 14)
    const text = (s: string, x: number, y: number, size: number) => {
      g.save()
      g.translate(x, y)
      g.scale(0.82, 1)
      g.font = `900 ${size}px "Arial Black", system-ui, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      g.lineWidth = size * 0.09
      g.strokeStyle = kit.ink === '#fff' ? '#0b0b0b' : '#ffffff'
      g.strokeText(s, 0, 0)
      g.fillStyle = kit.ink
      g.fillText(s, 0, 0)
      g.restore()
    }
    text(label, 768, goalie ? 210 : 220, label.length > 2 ? 120 : 190)
    text(label, 205, 170, label.length > 2 ? 44 : 64)
    g.fillStyle = trim
    g.beginPath()
    g.arc(300, 150, 30, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = base
    g.beginPath()
    g.arc(300, 150, 23, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = trim
    g.font = '900 20px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('IBK', 300, 151)
  })
}

function adTexture(kind: number) {
  return canvasTexture(`stickgfx|${kind}`, 256, 32, (g) => {
    const cols = [
      ['#111827', '#facc15', '#f8fafc'],
      ['#f8fafc', '#2563eb', '#111827'],
      ['#ef4444', '#111827', '#f8fafc'],
      ['#111827', '#22d3ee', '#a3e635'],
      ['#7c3aed', '#f8fafc', '#facc15'],
    ][kind % 5]
    g.fillStyle = cols[0]
    g.fillRect(0, 0, 256, 32)
    g.fillStyle = cols[1]
    for (let x = 30; x < 220; x += 46) {
      g.beginPath()
      g.moveTo(x, 32)
      g.lineTo(x + 22, 0)
      g.lineTo(x + 34, 0)
      g.lineTo(x + 12, 32)
      g.fill()
    }
    g.fillStyle = cols[2]
    g.fillRect(150, 12, 70, 8)
    g.fillStyle = '#111111'
    g.fillRect(0, 0, 34, 32)
  })
}

function bladeTexture(color: string) {
  return canvasTexture(`blade|${color}`, 256, 64, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, 256, 64)
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 2; j++) {
        g.beginPath()
        g.ellipse(34 + i * 24 + (j ? 12 : 0), 20 + j * 22, 7, 6, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

function ballTexture() {
  return canvasTexture('ball', 512, 256, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 512, 256)
    const n = 26
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n
      const rr = Math.sqrt(1 - y * y)
      const a = i * 2.39996
      const x = Math.cos(a) * rr
      const z = Math.sin(a) * rr
      const theta = Math.acos(y)
      let u = Math.atan2(z, -x) / (Math.PI * 2)
      if (u < 0) u += 1
      const px = u * 512
      const py = (theta / Math.PI) * 256
      const sx = 15 / Math.max(0.25, Math.sin(theta))
      for (const off of [-512, 0, 512]) {
        const grad = g.createRadialGradient(px + off, py, 2, px + off, py, 15)
        grad.addColorStop(0, '#c7ccd3')
        grad.addColorStop(0.75, '#e2e5e9')
        grad.addColorStop(1, '#f3f4f6')
        g.fillStyle = grad
        g.beginPath()
        g.ellipse(px + off, py, sx, 15, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  })
}

const UP = new THREE.Vector3(0, 1, 0)
function seg(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a)
  const len = Math.max(1e-4, d.length())
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.scale.set(1, len, 1)
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len))
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const x = new THREE.Mesh(geo, m)
  x.castShadow = shadow
  return x
}

function ellipsoid(rx: number, ry: number, rz: number, m: THREE.Material, seg = 20) {
  const x = mesh(new THREE.SphereGeometry(1, seg, Math.max(10, Math.round(seg * 0.7))), m)
  x.scale.set(rx, ry, rz)
  return x
}

function lathe(profile: [number, number][], m: THREE.Material, depth: number, segs = 40) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)))
  const geo = new THREE.LatheGeometry(curve.getSpacedPoints(28), segs)
  const x = mesh(geo, m)
  x.scale.x = depth
  return x
}

function hairShell(r: number, phiStart: number, phiLen: number, thetaLen: number, rough: number, seed: number, curls = false) {
  const geo = new THREE.SphereGeometry(r, 48, 28, phiStart, phiLen, 0, thetaLen)
  const p = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = v.clone().normalize()
    const theta = Math.acos(clamp(n.y, -1, 1))
    const phi = Math.atan2(n.z, -n.x)
    let d = curls
      ? 0.5 + 0.5 * Math.sin(n.x * 47 + seed) * Math.sin(n.y * 53 + seed * 2) * Math.sin(n.z * 41)
      : 0.55 + 0.3 * Math.sin(phi * 26 + seed + theta * 5) + 0.15 * Math.sin(phi * 61 - theta * 13 + seed * 3)
    const edge = smooth(thetaLen * 0.82, thetaLen, theta)
    d = d * (1 - edge) - edge * 0.25
    v.addScaledVector(n, d * rough)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

function solveArm(S: THREE.Vector3, H: THREE.Vector3, pole: THREE.Vector3, U: number, F: number, out: THREE.Vector3) {
  const d = H.clone().sub(S)
  let len = d.length()
  const dir = d.divideScalar(len || 1)
  const reach = U + F
  if (len >= reach * 0.995) return out.copy(S).addScaledVector(dir, (U * len) / reach)
  len = Math.max(len, Math.abs(U - F) + 0.01)
  const a = (U * U - F * F + len * len) / (2 * len)
  const h = Math.sqrt(Math.max(0, U * U - a * a))
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir))
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0)
  perp.normalize()
  return out.copy(S).addScaledVector(dir, a).addScaledVector(perp, h)
}

interface Arm {
  sleeve: THREE.Mesh
  upper: THREE.Mesh
  elbow: THREE.Mesh
  fore: THREE.Mesh
  wrist: THREE.Mesh
  hand: THREE.Group
  cap: THREE.Mesh
  U: number
  F: number
  parts: THREE.Object3D[]
}

function buildArm(parent: THREE.Object3D, sleeveMat: THREE.Material, skin: THREE.Material, handMat: THREE.Material, opts: { long: boolean; bulk: number; U: number; F: number }): Arm {
  const k = opts.bulk
  const cyl = (r0: number, r1: number, m: THREE.Material) => mesh(new THREE.CylinderGeometry(r0, r1, 1, 14), m)
  const sleeve = cyl(0.044 * k, 0.042 * k, sleeveMat)
  const upper = cyl(0.034 * k, 0.03 * k, opts.long ? sleeveMat : skin)
  const elbow = mesh(new THREE.SphereGeometry(0.031 * k, 12, 10), opts.long ? sleeveMat : skin)
  const fore = cyl(0.03 * k, 0.024 * k, opts.long ? sleeveMat : skin)
  const wrist = mesh(new THREE.SphereGeometry(0.024 * k, 10, 8), opts.long ? sleeveMat : skin)
  const cap = mesh(new THREE.SphereGeometry(0.043 * k, 16, 12), sleeveMat)
  const hand = new THREE.Group()
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.05, 0.034, 3, 0.016), handMat)
  palm.position.y = -0.03
  palm.rotation.z = Math.PI / 2
  palm.castShadow = true
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.024, 4, 8), handMat)
  thumb.position.set(0.018, -0.022, 0.012)
  thumb.rotation.x = 0.5
  hand.add(palm, thumb)
  if (opts.bulk > 1.15) hand.scale.setScalar(1.35)
  const parts = [sleeve, upper, elbow, fore, wrist, cap, hand]
  parent.add(...parts)
  return { sleeve, upper, elbow, fore, wrist, hand, cap, U: opts.U, F: opts.F, parts }
}

const _e = new THREE.Vector3()
const _m = new THREE.Matrix4()
function placeArm(arm: Arm, S: THREE.Vector3, H: THREE.Vector3, pole: THREE.Vector3, handUp?: THREE.Vector3) {
  const E = solveArm(S, H, pole, arm.U, arm.F, _e)
  const dirU = E.clone().sub(S).normalize()
  seg(arm.upper, S, E)
  seg(arm.sleeve, S, S.clone().addScaledVector(dirU, 0.12))
  arm.cap.position.copy(S)
  arm.elbow.position.copy(E)
  seg(arm.fore, E, H)
  arm.wrist.position.copy(H)
  arm.hand.position.copy(H)
  const fwd = H.clone().sub(E).normalize()
  const up = (handUp ?? pole).clone().addScaledVector(fwd, -(handUp ?? pole).dot(fwd)).normalize()
  const side = new THREE.Vector3().crossVectors(fwd, up)
  _m.makeBasis(side, fwd.clone().negate(), up)
  arm.hand.quaternion.setFromRotationMatrix(_m)
}

interface Leg {
  side: number
  hip: THREE.Group
  knee: THREE.Group
  foot: THREE.Group
  parts: THREE.Object3D[]
}

interface Dims {
  THIGH: number
  SHIN: number
  ANKLE: number
  HIP_W: number
  SHOULDER_Y: number
  SHOULDER_Z: number
  HEAD_Y: number
  U: number
  F: number
}

const KID: Dims = { THIGH: 0.34, SHIN: 0.33, ANKLE: 0.078, HIP_W: 0.074, SHOULDER_Y: 0.31, SHOULDER_Z: 0.148, HEAD_Y: 0.505, U: 0.225, F: 0.205 }

function buildLeg(parent: THREE.Object3D, side: number, d: Dims, m: { skin: THREE.Material; shorts: THREE.Material; sock: THREE.Material; sockBand: THREE.Material; shoe: THREE.Material; sole: THREE.Material; accent: THREE.Material; pants?: THREE.Material; kneePad?: THREE.Material }): Leg {
  const hip = new THREE.Group()
  hip.position.set(0, 0, side * d.HIP_W)
  parent.add(hip)
  const long = !!m.pants
  const thigh = mesh(new THREE.CapsuleGeometry(long ? 0.07 : 0.049, d.THIGH - 0.05, 6, 14), long ? m.pants! : m.skin)
  thigh.position.y = -d.THIGH / 2
  const leg = mesh(new THREE.CylinderGeometry(0.071, 0.067, 0.15, 18, 1, true), m.shorts)
  leg.position.y = -0.06
  ;(leg.material as THREE.Material).side = THREE.DoubleSide
  const knee = new THREE.Group()
  knee.position.y = -d.THIGH
  const kneeBall = mesh(new THREE.SphereGeometry(long ? 0.058 : 0.044, 14, 12), long ? m.pants! : m.skin)
  const shinGeo = new THREE.CylinderGeometry(long ? 0.062 : 0.043, long ? 0.05 : 0.032, d.SHIN - 0.035, 16)
  const shin = mesh(shinGeo, long ? m.pants! : m.sock)
  shin.position.y = -d.SHIN / 2 - 0.01
  const calf = ellipsoid(0.034, 0.075, 0.036, long ? m.pants! : m.sock, 14)
  calf.position.set(-0.012, -0.11, 0)
  knee.add(kneeBall, shin, calf)
  if (!long) {
    const band = mesh(new THREE.CylinderGeometry(0.046, 0.045, 0.03, 16), m.sockBand)
    band.position.y = -0.055
    const band2 = mesh(new THREE.CylinderGeometry(0.045, 0.044, 0.012, 16), m.sock)
    band2.position.y = -0.085
    knee.add(band, band2)
  }
  if (m.kneePad) {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.15, 0.12, 3, 0.03), m.kneePad)
    pad.position.set(0.045, -0.02, 0)
    pad.castShadow = true
    knee.add(pad)
  }
  const foot = new THREE.Group()
  foot.position.y = -d.SHIN
  const upper = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.075, 0.084, 4, 0.032), m.shoe)
  upper.position.set(0.048, -0.034, 0)
  upper.castShadow = true
  const toe = ellipsoid(0.05, 0.03, 0.041, m.shoe, 14)
  toe.position.set(0.12, -0.045, 0)
  const sole = new THREE.Mesh(new RoundedBoxGeometry(0.218, 0.022, 0.09, 2, 0.009), m.sole)
  sole.position.set(0.05, -0.07, 0)
  sole.castShadow = true
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.022, 0.088, 2, 0.008), m.accent)
  stripe.position.set(0.03, -0.03, 0)
  stripe.rotation.z = 0.5
  const collar = mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.04, 14), m.shoe)
  collar.position.set(-0.004, -0.008, 0)
  foot.add(upper, toe, sole, stripe, collar)
  knee.add(foot)
  hip.add(thigh, knee)
  if (!long) hip.add(leg)
  return { side, hip, knee, foot, parts: [hip] }
}

function legIK(leg: Leg, d: Dims, fx: number, fy: number, fz: number, pitch: number) {
  const T = d.THIGH
  const S = d.SHIN
  const ab = Math.atan2(-fz, -fy)
  const r = Math.hypot(fy, fz)
  const dist = clamp(Math.hypot(fx, r), 0.12, T + S - 1e-4)
  const a = Math.atan2(fx, r)
  const alpha = Math.acos(clamp((T * T + dist * dist - S * S) / (2 * T * dist), -1, 1))
  const beta = Math.acos(clamp((T * T + S * S - dist * dist) / (2 * T * S), -1, 1))
  leg.hip.rotation.set(ab, 0, a + alpha)
  leg.knee.rotation.set(0, 0, -(Math.PI - beta))
  leg.foot.rotation.set(-ab, 0, -(a + alpha) + (Math.PI - beta) + pitch)
}

interface Head {
  group: THREE.Group
  eyes: THREE.Mesh[]
  lids: THREE.Mesh[]
  lowLids: THREE.Mesh[]
  mouth: THREE.Mesh
  ponytail: THREE.Group | null
}

const R = 0.09
const SX = 1.05
const SY = 1.1
const SZ = 0.94

function surfaceX(y: number, z: number) {
  return SX * R * Math.sqrt(Math.max(0, 1 - (y / (SY * R)) ** 2 - (z / (SZ * R)) ** 2))
}

function buildHead(look: Look, opts: { goggles: boolean; helmet?: { shell: string; cage: string }; adult: boolean }): Head {
  const group = new THREE.Group()
  group.rotation.order = 'YZX'
  const skinPlain = skinMat(look.skin)
  const skull = mesh(new THREE.SphereGeometry(R, 48, 32), skinMat(look.skin, faceTexture(look)))
  skull.scale.set(SX, SY, SZ)
  const jaw = ellipsoid(0.058, 0.055, 0.064, skinPlain, 24)
  jaw.position.set(opts.adult ? 0.024 : 0.02, -0.048, 0)
  if (opts.adult) jaw.scale.set(0.062, 0.06, 0.066)
  group.add(skull, jaw)

  const earMat = skinMat(hex(shade(look.skin, -0.05)))
  for (const s of [-1, 1]) {
    const ear = ellipsoid(0.013, 0.026, 0.009, earMat, 14)
    ear.position.set(-0.004, -0.008, s * SZ * R * 0.98)
    ear.rotation.z = -0.15
    ear.rotation.x = s * 0.25
    const inner = ellipsoid(0.007, 0.016, 0.004, skinMat(hex(shade(look.skin, -0.2))), 10)
    inner.position.set(0.002, 0, s * 0.005)
    ear.add(inner)
    inner.scale.set(0.55, 0.6, 0.45)
    group.add(ear)
  }

  const eyeR = opts.adult ? 0.0122 : 0.0136
  const eyeY = 0.006
  const eyeZ = 0.032
  const eyeX = surfaceX(eyeY, eyeZ) - eyeR * 0.5
  const eyeMat = cached(`eye|${look.iris}`, () => new THREE.MeshPhysicalMaterial({ map: eyeTexture(look.iris), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }))
  const lidMat = skinMat(hex(shade(look.skin, -0.04)))
  const lashMat = plastic('#1a1210', 0.8)
  const eyes: THREE.Mesh[] = []
  const lids: THREE.Mesh[] = []
  const lowLids: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const socket = ellipsoid(eyeR * 1.15, eyeR * 1.05, eyeR * 1.25, skinMat(hex(shade(look.skin, -0.14))), 12)
    socket.position.set(eyeX - eyeR * 0.35, eyeY, s * eyeZ)
    socket.castShadow = false
    const eye = mesh(new THREE.SphereGeometry(eyeR, 24, 16), eyeMat, false)
    eye.position.set(eyeX, eyeY, s * eyeZ)
    const lid = mesh(new THREE.SphereGeometry(eyeR * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat, false)
    lid.position.copy(eye.position)
    const lash = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.1, 0.0011, 4, 24), lashMat)
    lash.rotation.x = Math.PI / 2
    lid.add(lash)
    const low = mesh(new THREE.SphereGeometry(eyeR * 1.06, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat, false)
    low.position.copy(eye.position)
    low.rotation.z = 0.25
    group.add(socket, eye, lid, low)
    eyes.push(eye)
    lids.push(lid)
    lowLids.push(low)
    const brow = mesh(new THREE.CapsuleGeometry(opts.adult ? 0.0042 : 0.0034, 0.024, 4, 8), hairMat(hex(shade(look.hair, -0.25))), false)
    brow.rotation.x = Math.PI / 2
    brow.rotation.y = s * 0.18
    brow.position.set(surfaceX(0.03, eyeZ) + 0.002, 0.03, s * (eyeZ + 0.002))
    group.add(brow)
  }

  const noseMat = skinMat(hex(shade(look.skin, 0.03)))
  const bridge = mesh(new THREE.CylinderGeometry(0.005, 0.0075, 0.026, 10), noseMat)
  seg(bridge, new THREE.Vector3(surfaceX(0.004, 0) - 0.002, 0.004, 0), new THREE.Vector3(surfaceX(-0.016, 0) + 0.008, -0.016, 0))
  bridge.scale.set(1, bridge.scale.y, 1)
  const tip = ellipsoid(opts.adult ? 0.012 : 0.0095, opts.adult ? 0.01 : 0.0085, opts.adult ? 0.012 : 0.0105, noseMat, 14)
  tip.position.set(surfaceX(-0.017, 0) + (opts.adult ? 0.009 : 0.0055), -0.017, 0)
  group.add(bridge, tip)
  for (const s of [-1, 1]) {
    const wing = ellipsoid(0.006, 0.0055, 0.006, noseMat, 10)
    wing.position.set(surfaceX(-0.02, 0.008) + 0.0015, -0.02, s * 0.0078)
    const hole = ellipsoid(0.0022, 0.0012, 0.002, skinMat(hex(shade(look.skin, -0.45))), 8)
    hole.position.set(tip.position.x - 0.003, -0.0245, s * 0.0042)
    group.add(wing, hole)
  }

  const lipCol = hex(shade(look.skin, -0.18).lerp(new THREE.Color('#c25a5a'), 0.38))
  const mouthY = -0.043
  const mouthX = surfaceX(mouthY, 0) - 0.006
  const smileGeo = new THREE.TorusGeometry(0.034, 0.0017, 6, 24, 0.75)
  smileGeo.rotateZ(-Math.PI / 2 - 0.375)
  smileGeo.rotateY(-Math.PI / 2)
  const smile = mesh(smileGeo, plastic(hex(shade(lipCol, -0.45)), 0.6), false)
  smile.position.set(mouthX + 0.0045, mouthY + 0.034, 0)
  const lower = ellipsoid(0.006, 0.0042, 0.0125, skinMat(lipCol), 14)
  lower.position.set(mouthX + 0.002, mouthY - 0.0055, 0)
  const upperLip = ellipsoid(0.005, 0.003, 0.0135, skinMat(hex(shade(lipCol, -0.08))), 14)
  upperLip.position.set(mouthX + 0.0025, mouthY + 0.0025, 0)
  const mouth = ellipsoid(0.004, 0.006, 0.0105, plastic('#3a1212', 0.9), 12)
  mouth.position.set(mouthX + 0.003, mouthY - 0.001, 0)
  mouth.scale.y = 0.0001
  group.add(smile, lower, upperLip, mouth)

  const hm = hairMat(look.hair)
  const seed = rngFor(look.hair + look.style)() * 10
  const cranium = new THREE.Group()
  cranium.scale.set(SX, SY, SZ)
  group.add(cranium)
  let ponytail: THREE.Group | null = null
  const style = opts.helmet ? 'buzz' : look.style
  const r = R
  const front = (theta: number) => mesh(hairShell(r * 1.045, Math.PI - 1.15, 2.3, theta, 0.006, seed), hm)
  const sides = (phi: number, theta: number, thick = 0.007) => mesh(hairShell(r * 1.035, -phi, phi * 2, theta, thick, seed + 1), hm)
  if (style === 'buzz') {
    cranium.add(mesh(hairShell(r * 1.012, 0, Math.PI * 2, 0.4 * Math.PI, 0.0015, seed), hm), sides(1.62, 0.6 * Math.PI, 0.0015))
  } else if (style === 'curly') {
    cranium.add(mesh(hairShell(r * 1.09, 0, Math.PI * 2, 0.42 * Math.PI, 0.024, seed, true), hm), mesh(hairShell(r * 1.08, -1.7, 3.4, 0.64 * Math.PI, 0.022, seed + 2, true), hm))
  } else {
    const fringeTheta = style === 'fringe' || style === 'long' ? 0.375 * Math.PI : style === 'side' ? 0.33 * Math.PI : 0.3 * Math.PI
    cranium.add(mesh(hairShell(r * 1.05, 0, Math.PI * 2, 0.3 * Math.PI, 0.009, seed), hm), front(fringeTheta), sides(style === 'short' || style === 'side' ? 1.5 : 1.72, style === 'short' || style === 'side' ? 0.62 * Math.PI : 0.66 * Math.PI))
    if (style === 'side') {
      const swoop = mesh(hairShell(r * 1.06, Math.PI - 0.2, 1.2, 0.36 * Math.PI, 0.01, seed + 4), hm)
      cranium.add(swoop)
    }
  }
  if (style === 'ponytail' || style === 'bun') {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 18), plastic(look.tie, 0.5))
    if (style === 'bun') {
      const bun = ellipsoid(0.04, 0.036, 0.042, hm, 18)
      bun.position.set(-0.075, 0.075, 0)
      tie.position.set(-0.062, 0.06, 0)
      tie.rotation.set(0, Math.PI / 2, 0.9)
      group.add(bun, tie)
    } else {
      ponytail = new THREE.Group()
      ponytail.position.set(-0.092, 0.04, 0)
      const tail = lathe(
        [
          [0.001, 0.0],
          [0.016, -0.015],
          [0.026, -0.06],
          [0.022, -0.12],
          [0.012, -0.17],
          [0.001, -0.195],
        ],
        hm,
        0.8,
        18,
      )
      tail.position.set(-0.014, 0, 0)
      tie.rotation.x = Math.PI / 2
      tie.position.set(-0.008, -0.006, 0)
      ponytail.add(tail, tie)
      group.add(ponytail)
    }
  }
  if (style === 'long') {
    const back = mesh(new THREE.CylinderGeometry(r * 0.98, r * 1.02, 0.15, 24, 4, true, Math.PI * 0.62, Math.PI * 0.76), hm)
    back.position.set(-0.006, -0.08, 0)
    back.scale.set(1.0, 1, 0.98)
    ;(back.material as THREE.Material).side = THREE.DoubleSide
    const band = mesh(new THREE.SphereGeometry(r * 1.065, 40, 6, 0, Math.PI * 2, 0.27 * Math.PI, 0.05 * Math.PI), plastic(look.tie, 0.6))
    cranium.add(band)
    group.add(back)
  }
  if (look.beard) {
    const beard = mesh(hairShell(r * 1.02, Math.PI - 1.4, 2.8, Math.PI * 0.4, 0.003, seed), hairMat(hex(shade(look.hair, -0.15))))
    beard.rotation.z = Math.PI
    beard.position.y = -0.02
    cranium.add(beard)
  }

  if (opts.goggles && !opts.helmet) {
    const gr = R * 1.13
    const ph0 = Math.PI - 0.8
    const ph1 = Math.PI + 0.8
    const th0 = 0.41 * Math.PI
    const th1 = 0.545 * Math.PI
    const lensMat = cached('lens', () => new THREE.MeshPhysicalMaterial({ color: '#dbeafe', transparent: true, opacity: 0.16, roughness: 0.04, clearcoat: 1, depthWrite: false }))
    const goggles = new THREE.Group()
    goggles.scale.set(SX, SY, SZ)
    const lens = new THREE.Mesh(new THREE.SphereGeometry(gr, 32, 8, ph0, ph1 - ph0, th0, th1 - th0), lensMat)
    lens.renderOrder = 3
    const pt = (phi: number, theta: number, rr = gr) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * rr, Math.cos(theta) * rr, Math.sin(phi) * Math.sin(theta) * rr)
    const border: THREE.Vector3[] = []
    for (let i = 0; i <= 16; i++) border.push(pt(lerp(ph0, ph1, i / 16), th0))
    for (let i = 1; i <= 4; i++) border.push(pt(ph1, lerp(th0, th1, i / 4)))
    for (let i = 1; i <= 16; i++) {
      const ph = lerp(ph1, ph0, i / 16)
      const dip = Math.exp(-(((ph - Math.PI) / 0.16) ** 2)) * 0.06 * Math.PI
      border.push(pt(ph, th1 - dip))
    }
    for (let i = 1; i < 4; i++) border.push(pt(ph0, lerp(th1, th0, i / 4)))
    const frameMat = plastic(look.goggles, 0.4)
    const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(border, true), 90, 0.0028, 6, true), frameMat)
    frame.castShadow = true
    const strap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 40, 4, ph1 - 0.05, Math.PI * 2 - (ph1 - ph0) + 0.1, 0.46 * Math.PI, 0.05 * Math.PI), plastic('#1f2937', 0.8))
    goggles.add(lens, frame, strap)
    group.add(goggles)
  }

  if (opts.helmet) {
    const shell = new THREE.Group()
    shell.scale.set(SX, SY, SZ)
    const hs = mesh(new THREE.SphereGeometry(R * 1.24, 40, 24, Math.PI + 0.95, Math.PI * 2 - 1.9, 0, 0.7 * Math.PI), plastic(opts.helmet.shell, 0.3))
    ;(hs.material as THREE.Material).side = THREE.DoubleSide
    const top = mesh(new THREE.SphereGeometry(R * 1.245, 40, 12, 0, Math.PI * 2, 0, 0.26 * Math.PI), plastic(opts.helmet.shell, 0.3))
    shell.add(hs, top)
    const cageMat = cached(`cage|${opts.helmet.cage}`, () => new THREE.MeshStandardMaterial({ color: opts.helmet!.cage, roughness: 0.3, metalness: 0.7 }))
    const cr = R * 1.32
    const cp = (phi: number, y: number) => {
      const yy = clamp(y / (cr * SY), -0.98, 0.98)
      const th = Math.acos(yy)
      return new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * cr * SX, y, Math.sin(phi) * Math.sin(th) * cr * SZ)
    }
    const bars: THREE.Vector3[][] = []
    for (const y of [0.06, 0.03, 0.0, -0.03, -0.06, -0.09]) {
      const span = y > 0.04 ? 0.9 : 1.05
      bars.push(Array.from({ length: 12 }, (_, i) => cp(lerp(Math.PI - span, Math.PI + span, i / 11), y)))
    }
    for (const ph of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) bars.push(Array.from({ length: 8 }, (_, i) => cp(Math.PI + ph, lerp(0.075, -0.1, i / 7))))
    for (const b of bars) {
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(b), 24, 0.0024, 5, false), cageMat)
      t.castShadow = true
      group.add(t)
    }
    const chinCup = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.11, 3, 0.012), plastic(opts.helmet.shell, 0.35))
    chinCup.position.set(0.1, -0.11, 0)
    const throat = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.08, 0.13, 3, 0.012), plastic(opts.helmet.shell, 0.35))
    throat.position.set(0.075, -0.16, 0)
    throat.rotation.z = -0.25
    group.add(shell, chinCup, throat)
  }
  return { group, eyes, lids, lowLids, mouth, ponytail }
}

interface Rig {
  root: THREE.Group
  body: THREE.Group
  hips: THREE.Group
  pelvis: THREE.Group
  chest: THREE.Group
  neck: THREE.Mesh
  head: Head
  legs: Leg[]
  arms: Arm[]
  ring: THREE.Mesh
  dims: Dims
  stick: Stick | null
}

interface Stick {
  group: THREE.Group
  shaft: THREE.Mesh
  grip: THREE.Mesh
  blade: THREE.Group
  len: number
}

function buildStick(look: Look, len: number): Stick {
  const group = new THREE.Group()
  const r = rngFor(look.skin + look.hair + 'stick')
  const kind = Math.floor(r() * 5)
  const tex = adTexture(kind).clone()
  tex.userData.shared = false
  tex.wrapS = THREE.RepeatWrapping
  tex.rotation = Math.PI / 2
  tex.repeat.set(1, 1)
  tex.needsUpdate = true
  const shaft = mesh(new THREE.CylinderGeometry(0.0125, 0.0115, 1, 10), cached(`shaft|${kind}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 })))
  const grip = mesh(new THREE.CylinderGeometry(0.0145, 0.0135, 1, 10), plastic(pick(r, ['#111827', '#f8fafc', '#ef4444', '#22c55e']), 0.9))
  const blade = new THREE.Group()
  const bladeCol = pick(r, ['#f8fafc', '#111827', '#facc15', '#22d3ee', '#f97316', '#ef4444'])
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(0.24, 0)
  shape.quadraticCurveTo(0.27, 0.005, 0.27, 0.035)
  shape.quadraticCurveTo(0.265, 0.07, 0.23, 0.072)
  shape.lineTo(0.03, 0.068)
  shape.quadraticCurveTo(0.0, 0.07, -0.005, 0.04)
  shape.lineTo(0, 0)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 })
  geo.translate(0, 0, -0.003)
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    p.setZ(i, p.getZ(i) + (x / 0.27) ** 2 * 0.028)
  }
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.27, p.getY(i) / 0.072)
  geo.computeVertexNormals()
  const bladeMat = cached(`blade|${bladeCol}`, () => new THREE.MeshStandardMaterial({ map: bladeTexture(bladeCol), roughness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide }))
  const bm = new THREE.Mesh(geo, bladeMat)
  bm.castShadow = true
  const neck = mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.06, 8), plastic(bladeCol, 0.4))
  neck.position.set(-0.006, 0.05, 0)
  neck.rotation.z = 0.35
  blade.add(bm, neck)
  group.add(shaft, grip, blade)
  return { group, shaft, grip, blade, len }
}

function placeStick(st: Stick, heel: THREE.Vector3, top: THREE.Vector3, toe: THREE.Vector3, face: number) {
  seg(st.shaft, heel.clone().add(new THREE.Vector3(0, 0.06, 0)), top)
  const dir = top.clone().sub(heel).normalize()
  seg(st.grip, top.clone().addScaledVector(dir, -0.2), top.clone().addScaledVector(dir, 0.01))
  st.blade.position.copy(heel)
  const yaw = Math.atan2(-toe.z, toe.x)
  st.blade.rotation.set(0, yaw, 0)
  st.blade.scale.set(1, 1, face)
}

function highlightRing(radius: number) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 48), new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.85, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012
  ring.visible = false
  return ring
}

interface Outfit {
  shirt: THREE.Material
  sleeve: THREE.Material
  shorts: THREE.Material
  sock: THREE.Material
  sockBand: THREE.Material
  hand: THREE.Material
  pants?: THREE.Material
  kneePad?: THREE.Material
  longSleeves: boolean
  bulk: number
  collar: THREE.Material
}

function buildRig(look: Look, outfit: Outfit, opts: { adult: boolean; goggles: boolean; helmet?: { shell: string; cage: string }; stickLen: number | null; ring: number }): Rig {
  const d = KID
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const skin = skinMat(look.skin)
  const hips = new THREE.Group()
  const pelvis = new THREE.Group()
  body.add(hips, pelvis)
  const shorts = lathe(
    [
      [0.118, -0.08],
      [0.124, -0.02],
      [0.12, 0.04],
      [0.112, 0.08],
    ],
    outfit.pants ?? outfit.shorts,
    0.74,
  )
  pelvis.add(shorts)
  const shoe = plastic(look.shoe[0], 0.45)
  const legs = [-1, 1].map((s) =>
    buildLeg(hips, s, d, { skin, shorts: outfit.shorts, sock: outfit.sock, sockBand: outfit.sockBand, shoe, sole: plastic('#e7e1d6', 0.7), accent: plastic(look.shoe[1], 0.4), pants: outfit.pants, kneePad: outfit.kneePad }),
  )
  const chest = new THREE.Group()
  body.add(chest)
  const b = outfit.bulk
  const shirt = lathe(
    [
      [0.12 * b, -0.12],
      [0.123 * b, -0.05],
      [0.119 * b, 0.02],
      [0.124 * b, 0.1],
      [0.132 * b, 0.19],
      [0.133 * b, 0.25],
      [0.125 * b, 0.3],
      [0.098 * b, 0.345],
      [0.058, 0.37],
      [0.042, 0.378],
    ],
    outfit.shirt,
    0.66,
    48,
  )
  shirt.rotation.y = 0
  const collar = mesh(new THREE.TorusGeometry(0.043, 0.008, 8, 24), outfit.collar)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.372
  collar.scale.set(0.85, 1, 1)
  chest.add(shirt, collar)
  const neck = mesh(new THREE.CylinderGeometry(0.031, 0.036, 0.1, 14), skin)
  neck.position.set(0.004, 0.41, 0)
  chest.add(neck)
  const head = buildHead(look, { goggles: opts.goggles, helmet: opts.helmet, adult: opts.adult })
  head.group.position.set(0.012, d.HEAD_Y, 0)
  if (opts.adult) head.group.scale.setScalar(0.86)
  chest.add(head.group)
  const arms = [-1, 1].map(() => buildArm(body, outfit.sleeve, skin, outfit.hand, { long: outfit.longSleeves, bulk: outfit.bulk, U: d.U, F: d.F }))
  const stick = opts.stickLen ? buildStick(look, opts.stickLen) : null
  if (stick) body.add(stick.group)
  const ring = highlightRing(opts.ring)
  root.add(ring)
  root.scale.setScalar(look.height)
  return { root, body, hips, pelvis, chest, neck, head, legs, arms, ring, dims: d, stick }
}

function makeOutfit(kit: Kit, label: string, role: 'player' | 'goalie' | 'coach', look: Look): Outfit {
  const design = Math.abs(Math.round(new THREE.Color(kit.jersey).getHSL({ h: 0, s: 0, l: 0 }).h * 7)) % 3
  const trim = kit.ink === '#fff' ? '#f8fafc' : '#111827'
  if (role === 'coach') {
    const jacket = kit.jersey
    return {
      shirt: fabric(jacket, undefined, 0.7),
      sleeve: fabric(jacket, undefined, 0.7),
      shorts: fabric('#1f2937'),
      pants: fabric('#1f2937', undefined, 0.75),
      sock: fabric('#1f2937'),
      sockBand: fabric('#1f2937'),
      hand: skinMat(look.skin),
      longSleeves: true,
      bulk: 1.12,
      collar: fabric('#f8fafc'),
    }
  }
  const tex = jerseyTexture(label, kit, design, role === 'goalie')
  const shortsCol = new THREE.Color(kit.jersey).getHSL({ h: 0, s: 0, l: 0 }).l > 0.45 ? '#111827' : hex(shade(kit.jersey, -0.55))
  if (role === 'goalie') {
    return {
      shirt: fabric('', tex, 0.8),
      sleeve: fabric(kit.jersey, undefined, 0.8),
      shorts: fabric('#1f2937'),
      pants: fabric('#1f2937', undefined, 0.75),
      sock: fabric('#1f2937'),
      sockBand: fabric('#1f2937'),
      hand: plastic('#1f2937', 0.75),
      kneePad: plastic('#e5e7eb', 0.5),
      longSleeves: true,
      bulk: 1.18,
      collar: fabric(trim),
    }
  }
  return {
    shirt: fabric('', tex),
    sleeve: fabric(kit.jersey),
    shorts: fabric(shortsCol),
    sock: fabric(kit.jersey),
    sockBand: fabric(trim),
    hand: skinMat(look.skin),
    longSleeves: false,
    bulk: 1,
    collar: fabric(trim),
  }
}

interface FaceState {
  blinkIn: number
  blink: number
  yaw: number
  pitch: number
  eyeYaw: number
  eyePitch: number
  sacc: number
  saccYaw: number
  saccPitch: number
  mouth: number
  tailZ: number
  tailX: number
  tailVZ: number
  tailVX: number
}

function newFace(r: Rng): FaceState {
  return { blinkIn: 1 + r() * 3, blink: 0, yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0, sacc: r() * 2, saccYaw: 0, saccPitch: 0, mouth: 0, tailZ: 0.25, tailX: 0, tailVZ: 0, tailVX: 0 }
}

const _w = new THREE.Vector3()
function animateFace(rig: Rig, f: FaceState, live: number, look: THREE.Vector3 | null, open: number, accel: { x: number; z: number }, bounce: number) {
  const h = rig.head
  f.blinkIn -= live
  if (f.blinkIn <= 0) {
    f.blink = 0.16
    f.blinkIn = 1.6 + Math.random() * 3.6
  }
  f.blink = Math.max(0, f.blink - live)
  const closed = f.blink > 0 ? Math.sin((f.blink / 0.16) * Math.PI) : 0
  let wantYaw = 0
  let wantPitch = -0.05
  if (look) {
    rig.chest.updateWorldMatrix(true, false)
    _w.copy(look)
    rig.chest.worldToLocal(_w)
    const hp = rig.head.group.position
    const dx = _w.x - hp.x
    const dy = _w.y - hp.y
    const dz = _w.z - hp.z
    wantYaw = Math.atan2(-dz, dx)
    wantPitch = Math.atan2(dy, Math.hypot(dx, dz))
  }
  const yawLim = 1.15
  const headYaw = clamp(wantYaw, -yawLim, yawLim)
  const headPitch = clamp(wantPitch * 0.75, -0.6, 0.35)
  f.yaw = approach(f.yaw, headYaw, 7, live)
  f.pitch = approach(f.pitch, headPitch, 7, live)
  h.group.rotation.y = f.yaw
  h.group.rotation.z = f.pitch
  f.sacc -= live
  if (f.sacc <= 0) {
    f.sacc = 0.4 + Math.random() * 1.6
    f.saccYaw = (Math.random() - 0.5) * 0.18
    f.saccPitch = (Math.random() - 0.5) * 0.1
  }
  f.eyeYaw = approach(f.eyeYaw, clamp(wantYaw - f.yaw + f.saccYaw, -0.45, 0.45), 25, live)
  f.eyePitch = approach(f.eyePitch, clamp(wantPitch - f.pitch + f.saccPitch, -0.35, 0.3), 25, live)
  for (const e of h.eyes) {
    e.rotation.set(0, f.eyeYaw, f.eyePitch, 'YZX')
  }
  const lidOpen = 0.95 + f.eyePitch * 0.35
  for (const l of h.lids) l.rotation.z = lerp(lidOpen, -0.32, closed)
  for (const l of h.lowLids) l.rotation.z = lerp(0.22 + Math.min(0, f.eyePitch) * 0.4, 0.1, closed)
  f.mouth = approach(f.mouth, open, 8, live)
  h.mouth.scale.y = Math.max(0.0001, 0.006 * f.mouth)
  if (h.ponytail) {
    const k = 70
    const c = 7
    const fz = -accel.x * 1.6 + bounce
    const fx = accel.z * 1.6
    f.tailVZ += (-k * (f.tailZ - 0.3) - c * f.tailVZ + fz * 8) * live
    f.tailVX += (-k * f.tailX - c * f.tailVX + fx * 8) * live
    f.tailZ += f.tailVZ * live
    f.tailX += f.tailVX * live
    f.tailZ = clamp(f.tailZ, -0.6, 1.3)
    f.tailX = clamp(f.tailX, -0.8, 0.8)
    h.ponytail.rotation.set(f.tailX - f.yaw * 0.3, 0, -f.tailZ)
  }
}

function shoulderAt(rig: Rig, side: number, out: THREE.Vector3) {
  out.set(0, rig.dims.SHOULDER_Y, side * rig.dims.SHOULDER_Z)
  rig.chest.localToWorld(out)
  return rig.body.worldToLocal(out)
}

function toLocal(rig: Rig, w: THREE.Vector3, out: THREE.Vector3) {
  out.copy(w)
  return rig.body.worldToLocal(out)
}

interface GaitState {
  phase: number
  vx: number
  vz: number
  ax: number
  az: number
  prevH: number | null
  turn: number
  moving: number
  run: number
  ready: number
  carry: number
  twoHand: number
  dribble: number
  idle: number
  sway: number
}

const BALL_R = 0.048

export function buildKidPlayer(seed: string, label: string, kit: Kit, opts: { coach?: boolean } = {}): Figure {
  const adult = !!opts.coach
  const look = lookFor(seed, adult)
  const outfit = makeOutfit(kit, label, adult ? 'coach' : 'player', look)
  const stickLen = adult ? 0.98 : 0.86
  const rig = buildRig(look, outfit, { adult, goggles: !adult, stickLen, ring: 0.62 })
  if (adult) {
    rig.root.scale.setScalar(look.height)
  }
  const d = rig.dims
  const r = rngFor(seed + 'motion')
  const face = newFace(r)
  const g: GaitState = { phase: r(), vx: 0, vz: 0, ax: 0, az: 0, prevH: null, turn: 0, moving: 0, run: 0, ready: 0, carry: 0, twoHand: 1, dribble: r() * 6, idle: r() * 10, sway: 0 }
  const b = look.hand
  const ballLocal = new THREE.Vector3()
  const ballWorld = new THREE.Vector3()
  let showBall = false
  const focusLocal = new THREE.Vector3()
  const standY = d.THIGH + d.SHIN + d.ANKLE - 0.006

  const pose = (anim: number, live: number, m: Motion) => {
    const root = rig.root
    const h = -root.rotation.y
    if (m.vel) {
      const lx = m.vel.x * Math.cos(h) + m.vel.y * Math.sin(h)
      const lz = -m.vel.x * Math.sin(h) + m.vel.y * Math.cos(h)
      const valid = Math.hypot(lx, lz) < 14
      if (valid && anim > 0) {
        const nvx = approach(g.vx, lx, 10, anim)
        const nvz = approach(g.vz, lz, 10, anim)
        g.ax = approach(g.ax, (nvx - g.vx) / anim, 6, anim)
        g.az = approach(g.az, (nvz - g.vz) / anim, 6, anim)
        g.vx = nvx
        g.vz = nvz
      } else if (valid && anim === 0 && live > 0 && g.prevH === null) {
        g.vx = lx
        g.vz = lz
      }
    }
    if (g.prevH !== null && anim > 0) {
      let dh = h - g.prevH
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      g.turn = approach(g.turn, clamp(dh / anim, -4, 4), 6, anim)
    }
    g.prevH = h
    const v = Math.hypot(g.vx, g.vz)
    const dirX = v > 0.05 ? g.vx / v : 1
    const dirZ = v > 0.05 ? g.vz / v : 0
    g.moving = approach(g.moving, smooth(0.12, 0.55, v), 8, Math.max(anim, live * 0.3))
    g.run = approach(g.run, smooth(1.5, 3.3, v), 5, Math.max(anim, live * 0.3))
    const mv = g.moving
    const run = g.run
    const carrying = !!m.puck || m.shot !== undefined || m.pass !== undefined
    g.carry = approach(g.carry, carrying ? 1 : 0, 7, Math.max(anim, live))
    const focusDist = m.focus ? toLocal(rig, m.focus, focusLocal).length() : 99
    const wantReady = adult ? 0 : clamp(1 - (focusDist - 3) / 8, 0, 1) * (1 - run * 0.7)
    g.ready = approach(g.ready, wantReady, 3, Math.max(anim, live))
    const twoHandWant = Math.max(g.carry, g.ready > 0.35 ? 1 : 0, run < 0.3 ? 0.85 : 0) * (adult ? 0 : 1)
    g.twoHand = approach(g.twoHand, twoHandWant, 6, Math.max(anim, live))

    const cadence = clamp(1.9 + 0.45 * v, 1.9, 4.6)
    const f = cadence / 2
    g.phase = (g.phase + anim * f * (mv > 0.02 ? 1 : 0)) % 1
    const duty = lerp(0.6, 0.31, smooth(1.4, 4.5, v))
    let L = Math.min((v * duty) / f, 0.64)
    L *= mv
    const crouch = 0.045 * g.ready + 0.06 * g.carry + 0.02 * run
    let hipY = standY - crouch
    const reachMax = (d.THIGH + d.SHIN) * 0.985
    const maxHip = d.ANKLE + Math.sqrt(Math.max(0.05, reachMax * reachMax - (L / 2) ** 2))
    hipY = Math.min(hipY, maxHip)
    const bobAmp = lerp(0.01, 0.026, run) * mv
    const bob = Math.cos(2 * Math.PI * 2 * (g.phase - duty / 2)) * bobAmp * lerp(1, -1, run)
    g.idle += live
    const breathe = Math.sin(g.idle * (1.6 + run * 2.2)) * 0.006
    g.sway = Math.sin(g.idle * 0.7) * (1 - mv) * 0.02
    hipY += bob
    rig.hips.position.set(0, hipY, g.sway * 0.5)
    rig.pelvis.position.copy(rig.hips.position)
    const stanceW = lerp(0.1, 0.15, g.ready) + 0.02 * g.carry
    for (const leg of rig.legs) {
      const s = leg.side
      const p = (g.phase + (s < 0 ? 0 : 0.5)) % 1
      let travel: number
      let lift = 0
      let pitch = 0
      if (p < duty) {
        const t = p / duty
        travel = L * (0.5 - t)
        pitch = lerp(0.15, -0.45, smooth(0.55, 1, t)) * mv
      } else {
        const t = (p - duty) / (1 - duty)
        const e = t * t * (3 - 2 * t)
        travel = L * (-0.5 + e) - Math.sin(Math.PI * t) * (1 - t) * 0.22 * run * mv
        lift = Math.sin(Math.PI * Math.pow(t, 0.8)) * lerp(0.07, 0.24, run) * mv
        pitch = lerp(-0.7, 0.25, t) * mv
      }
      let x = 0.025 + 0.03 * g.ready + dirX * travel
      let z = s * stanceW + dirZ * travel
      if (s * z < 0.035) z = s * 0.035
      if (mv < 0.5 && g.ready > 0.3) x += s * b * 0.06 * g.ready
      const y = d.ANKLE + lift
      legIK(leg, d, x, y - hipY, z - s * d.HIP_W - g.sway * 0.5, pitch)
    }
    const legFwd = Math.cos(2 * Math.PI * g.phase)
    rig.pelvis.rotation.set(0, -0.14 * legFwd * mv * (dirX >= 0 ? 1 : -1), 0)

    let lean = 0.06 + 0.1 * run * Math.max(0, dirX) + 0.16 * g.ready + 0.42 * g.carry - 0.08 * run * Math.max(0, -dirX)
    lean += clamp(g.ax * 0.03, -0.12, 0.15)
    let twist = 0.16 * legFwd * mv * (1 - g.twoHand * 0.7) * (dirX >= 0 ? 1 : -1)
    let roll = clamp(g.turn * v * 0.045, -0.3, 0.3) + 0.1 * run * dirZ
    if (adult) {
      lean = 0.03 + 0.05 * run
      roll *= 0.5
    }

    const swingKind = m.shot !== undefined ? 'shot' : m.pass !== undefined ? 'pass' : null
    const sk = m.shot ?? m.pass ?? 0
    const release = swingKind === 'shot' ? 0.7 : 0.55
    const wind = swingKind ? (sk < release ? Math.sin((sk / release) * (Math.PI / 2)) : Math.max(0, 1 - (sk - release) / 0.14)) : 0
    const follow = swingKind ? (sk < release ? 0 : Math.min(1, (sk - release) / 0.14) * (1 - smooth(0.85, 1, sk) * 0.5)) : 0
    const power = swingKind === 'shot' ? 1 : 0.55
    twist += b * (-0.55 * wind + 0.5 * follow) * power
    lean += 0.08 * wind * power - 0.05 * follow
    rig.chest.position.set(0, hipY + 0.04, g.sway * 0.5)
    rig.chest.rotation.set(roll, twist, -lean, 'YXZ')
    rig.chest.scale.set(1, 1 + breathe, 1 + breathe * 0.6)
    rig.root.updateMatrixWorld(true)

    const sL = shoulderAt(rig, -1, new THREE.Vector3())
    const sR = shoulderAt(rig, 1, new THREE.Vector3())
    const shoulder = (side: number) => (side < 0 ? sL : sR)
    const topSide = -b
    const botSide = b

    g.dribble += anim * lerp(6.5, 9, run) * (carrying ? 1 : 0.3)
    const sim = m.focus && carrying ? toLocal(rig, m.focus, ballLocal) : ballLocal.set(0.75, BALL_R, 0)
    const amp = lerp(0.13, 0.05, run) * (swingKind ? 0 : 1)
    const ballX = lerp(0.56, 0.62, run)
    const bz = Math.sin(g.dribble) * amp + b * 0.06 * (1 - Math.abs(Math.sin(g.dribble)))
    const ball = new THREE.Vector3(ballX + Math.cos(g.dribble * 2) * 0.03, BALL_R, clamp(sim.z, -0.3, 0.3) * 0.2 + bz)
    const sideOfBall = Math.tanh(Math.cos(g.dribble) * 3.5)
    const toe = new THREE.Vector3(1, 0, -b * 0.28).normalize()
    let center = new THREE.Vector3()
    const bladeFace = 1
    if (swingKind) {
      const start = new THREE.Vector3(0.58, BALL_R, b * 0.08)
      const back = new THREE.Vector3(-0.42, 0.0, b * 0.24).multiplyScalar(power)
      const through = new THREE.Vector3(0.45, swingKind === 'shot' ? 0.62 : 0.16, -b * 0.06)
      center = start.clone().addScaledVector(back, wind).addScaledVector(through, follow)
      center.y = Math.max(BALL_R, center.y)
      if (sk < release) ball.copy(center).add(new THREE.Vector3(0.0, 0, -b * (BALL_R + 0.014)))
      toe.set(1, 0, -b * (0.25 - 0.6 * follow)).normalize()
    } else {
      center.copy(ball).add(new THREE.Vector3(0.01, 0.0, sideOfBall * (BALL_R + 0.016)))
      center.y = BALL_R + 0.03 * (1 - sideOfBall * sideOfBall)
    }
    const ready = new THREE.Vector3(0.5 + Math.sin(g.idle * 1.3) * 0.03, BALL_R, b * 0.2 + Math.sin(g.idle * 0.9) * 0.04)
    const blend = g.carry
    const bladeC = ready.clone().lerp(center, blend)
    const heel2 = bladeC.clone().addScaledVector(toe, -0.12)
    heel2.y = Math.max(0.004, bladeC.y - BALL_R)

    const st = rig.stick!
    const stickTopWant = new THREE.Vector3(0.14 - 0.06 * g.carry, hipY + 0.2 + 0.06 * g.carry, topSide * 0.04)
    const up2 = stickTopWant.clone().sub(heel2).normalize()
    const top2 = heel2.clone().addScaledVector(up2, st.len)
    const swingArm = lerp(0.12, 0.34, run) * mv
    const topShoulder = shoulder(topSide)
    const oneTop = topShoulder.clone().add(new THREE.Vector3(0.1 + (topSide > 0 ? legFwd : -legFwd) * swingArm * 0.5, -0.36 + 0.06 * run, topSide * 0.02 - topSide * 0.05))
    const oneDir = new THREE.Vector3(0.62, -0.74, b * 0.26).normalize()
    const heel1 = oneTop.clone().addScaledVector(oneDir, st.len)
    heel1.y = Math.max(0.04, heel1.y)
    const k2 = g.twoHand
    const heel = heel1.clone().lerp(heel2, k2)
    const top = oneTop.clone().lerp(top2, k2)
    const shaftDir = top.clone().sub(heel).normalize()
    if (adult) {
      const sHand = shoulder(1).clone().add(new THREE.Vector3(0.12, -0.42, 0.06))
      top.copy(sHand)
      heel.copy(sHand).add(new THREE.Vector3(0.3, -sHand.y + 0.01, 0.22))
      shaftDir.copy(top).sub(heel).normalize()
    }
    placeStick(st, heel, top.clone().addScaledVector(shaftDir, 0.02), toe, bladeFace)
    const botGrip = heel.clone().addScaledVector(shaftDir, st.len - 0.27)
    const topGrip = top.clone().addScaledVector(shaftDir, -0.03)

    const freeSwing = (side: number) => {
      const w = (side > 0 ? legFwd : -legFwd) * swingArm
      return shoulder(side)
        .clone()
        .add(new THREE.Vector3(0.05 + 0.27 * Math.sin(w * 2.2), -0.4 + 0.18 * run + 0.1 * Math.max(0, w * 2), side * (0.06 + 0.02 * run)))
    }
    const poleOut = (side: number) => new THREE.Vector3(-0.6, -0.4, side * 0.7)
    if (adult) {
      placeArm(rig.arms[1], shoulder(1), topGrip, poleOut(1))
      placeArm(rig.arms[0], shoulder(-1), freeSwing(-1).add(new THREE.Vector3(0, 0.02, 0)), poleOut(-1))
    } else {
      const topArm = rig.arms[topSide < 0 ? 0 : 1]
      const botArm = rig.arms[botSide < 0 ? 0 : 1]
      placeArm(topArm, shoulder(topSide), topGrip, poleOut(topSide), shaftDir)
      const freeHand = freeSwing(botSide)
      const botTarget = freeHand.lerp(botGrip, smooth(0.15, 0.85, k2))
      placeArm(botArm, shoulder(botSide), botTarget, poleOut(botSide), k2 > 0.5 ? shaftDir : undefined)
    }

    showBall = carrying && !(swingKind && sk >= release)
    if (showBall) {
      ballWorld.copy(ball)
      rig.body.localToWorld(ballWorld)
    }
    const lookAt = m.focus ? m.focus.clone() : null
    if (lookAt && carrying && !swingKind) {
      const ahead = new THREE.Vector3(4, 1.1, 0)
      rig.body.localToWorld(ahead)
      lookAt.lerp(ahead, 0.55 + 0.25 * Math.sin(g.idle * 0.8))
    }
    if (lookAt && swingKind && sk < release) lookAt.copy(ballWorld)
    animateFace(rig, face, live, lookAt, 0.25 * run + 0.6 * follow * power + 0.2 * wind, { x: g.ax, z: g.az }, Math.sin(4 * Math.PI * g.phase) * run * 6)
  }
  pose(0, 0.016, {})

  let firstPerson = false
  return {
    root: rig.root,
    setHighlight: (on) => {
      rig.ring.visible = on
    },
    setFirstPerson: (on) => {
      if (on === firstPerson) return
      firstPerson = on
      rig.body.visible = !on
    },
    update: (_speed, dt, motion = {}) => pose(dt, motion.live ?? dt, motion),
    ballAt: () => (showBall ? ballWorld.clone() : null),
  }
}

export function buildKidGoalie(seed: string, label: string, kit: Kit): Figure {
  const look = lookFor(seed)
  const outfit = makeOutfit(kit, label, 'goalie', look)
  const rig = buildRig(look, outfit, { adult: false, goggles: false, helmet: { shell: kit.jersey === '#111827' ? '#f8fafc' : kit.jersey, cage: '#111827' }, stickLen: null, ring: 0.8 })
  const d = rig.dims
  const r = rngFor(seed + 'gk')
  const face = newFace(r)
  let t = r() * 10
  let kneel = 1
  let shuffle = 0
  let move = 0
  let reaction: { kind: Reaction; t: number } | null = null
  const weight = () => {
    if (!reaction) return 0
    const e = t - reaction.t
    if (e < 0.12) return e / 0.12
    if (e < 1.1) return 1
    if (e < 1.5) return 1 - (e - 1.1) / 0.4
    reaction = null
    return 0
  }
  const focusLocal = new THREE.Vector3()
  const standY = d.THIGH + d.SHIN + d.ANKLE

  const pose = (anim: number, live: number, speed: number, m: Motion) => {
    t += live
    const w = weight()
    const bfly = reaction?.kind === 'butterfly' ? w : 0
    const gl = reaction?.kind === 'glove' ? w : 0
    const bl = reaction?.kind === 'blocker' ? w : 0
    const dist = m.focus ? toLocal(rig, m.focus, focusLocal).setY(0).length() : 5
    const wantKneel = w > 0 || dist < (kneel > 0.5 ? 13 : 10) ? 1 : 0
    kneel = approach(kneel, wantKneel, wantKneel ? 9 : 3, live)
    move = approach(move, clamp(speed / 1.2, 0, 1), 8, live)
    shuffle += Math.max(anim, 0) * 9 * move
    const breathe = Math.sin(t * 2.1) * 0.005

    const kneelHip = 0.4 - 0.06 * bfly
    const standHip = standY - 0.2
    const hipY = lerp(standHip, kneelHip, kneel) + breathe
    rig.hips.position.set(0, hipY, 0)
    rig.pelvis.position.copy(rig.hips.position)
    for (const leg of rig.legs) {
      const s = leg.side
      const lift = Math.max(0, Math.sin(shuffle + (s < 0 ? 0 : Math.PI))) * 0.04 * move
      const kn = {
        hx: -s * (0.12 + 0.06 * bfly) - s * lift * 0.4,
        hy: s * (0.95 + 0.25 * bfly),
        hz: 0.1 - lift,
        k: -(Math.PI / 2 + 0.1),
      }
      const sx = 0.06
      const sz = s * 0.27
      const fx = sx
      const fy = d.ANKLE - hipY
      const fz = sz - s * d.HIP_W
      legIK(leg, d, fx, fy, fz, 0)
      const st = { hx: leg.hip.rotation.x, hz: leg.hip.rotation.z, k: leg.knee.rotation.z, fx: leg.foot.rotation.x, fz: leg.foot.rotation.z }
      const k = kneel
      leg.hip.rotation.set(lerp(st.hx, kn.hx, k), lerp(0, kn.hy, k), lerp(st.hz, kn.hz, k))
      leg.knee.rotation.z = lerp(st.k, kn.k, k)
      leg.foot.rotation.set(lerp(st.fx, 0, k), 0, lerp(st.fz, -Math.PI / 2 - 0.15, k))
    }
    const side = gl - bl
    const lean = lerp(0.5, 0.1, kneel) + 0.08 * bfly
    rig.chest.position.set(0, hipY + 0.04, 0)
    rig.chest.rotation.set(-side * 0.35, 0, -lean, 'YXZ')
    rig.chest.scale.set(1, 1 + breathe, 1)
    rig.root.updateMatrixWorld(true)
    for (const arm of rig.arms) {
      const s = arm === rig.arms[0] ? -1 : 1
      const S = shoulderAt(rig, s, new THREE.Vector3())
      const reachUp = s < 0 ? gl : bl
      const kneelHand = new THREE.Vector3(0.14, hipY + 0.2 - 0.1 * bfly + 0.42 * reachUp, s * (0.42 + 0.1 * bfly + 0.1 * reachUp))
      const standHand = new THREE.Vector3(0.34, hipY - 0.02, s * 0.24)
      const H = standHand.lerp(kneelHand, kneel)
      placeArm(arm, S, H, new THREE.Vector3(-0.3, -0.8, s * 0.5), new THREE.Vector3(1, 0.2, 0))
    }
    animateFace(rig, face, live, m.focus ?? null, 0.15 + 0.5 * w, { x: 0, z: 0 }, 0)
  }
  pose(0, 0.016, 0, {})

  const head = rig.head.group
  const upper = [rig.chest, ...rig.arms.flatMap((a) => a.parts)]
  let firstPerson = false
  return {
    root: rig.root,
    setHighlight: (on) => {
      rig.ring.visible = on
    },
    setFirstPerson: (on) => {
      if (on === firstPerson) return
      firstPerson = on
      head.visible = !on
      upper.forEach((o) => (o.visible = !on))
    },
    react: (kind) => {
      reaction = { kind, t }
    },
    update: (speed, dt, motion = {}) => pose(dt, motion.live ?? dt, speed, motion),
  }
}

export function buildBall() {
  const g = new THREE.Group()
  const ball = mesh(new THREE.SphereGeometry(BALL_R, 28, 20), cached('ball', () => new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.12 })))
  ball.position.y = BALL_R
  g.add(ball)
  g.userData.ball = ball
  return g
}

const _axis = new THREE.Vector3()
const _rq = new THREE.Quaternion()
export function rollTo(g: THREE.Object3D, x: number, y: number, z: number) {
  const ball = g.userData.ball as THREE.Mesh | undefined
  const dx = x - g.position.x
  const dz = z - g.position.z
  const dist = Math.hypot(dx, dz)
  if (ball && dist > 1e-5 && dist < 3) {
    _axis.set(dz, 0, -dx).normalize()
    _rq.setFromAxisAngle(_axis, dist / (BALL_R * g.scale.x))
    ball.quaternion.premultiply(_rq)
  }
  g.position.set(x, y, z)
}

