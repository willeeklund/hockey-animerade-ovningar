import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { FLOORBALL, RINK, type Field } from '../model/rink'
import type { Goal } from '../model/types'
import { GOAL_HEIGHT } from '../engine/netView'
import { lookFor, rngFor } from './kids'

export const HALL = { x0: -26, x1: 26, z0: -21.5, z1: 15, h: 11 }
const W = HALL
const LINE = '#f8fafc'

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function vinyl(base: string) {
  const r = rngFor('vinyl' + base)
  return tex(512, 512, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2)
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'
    for (let x = 0; x < 512; x += 256) g.fillRect(x, 0, 1, 512)
  })
}

function floorRough() {
  const r = rngFor('rough')
  const t = tex(
    256,
    256,
    (g) => {
      g.fillStyle = '#e6e6e6'
      g.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(170,170,170,0.25)'
        g.fillRect(r() * 256, r() * 256, 2 + r() * 30, 1 + r() * 2)
      }
    },
    false,
  )
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const SPONSORS: [string, string, string, string][] = [
  ['Bageri Kanelen', '#f59e0b', '#3b1d0a', 'BRÖD & BULLAR'],
  ['Sportboden', '#1d4ed8', '#ffffff', 'ALLT FÖR INNEBANDY'],
  ['Elfirman Gnistan', '#111827', '#facc15', 'EL · SOL · LADDBOX'],
  ['Hälsans Hus', '#15803d', '#ffffff', 'FYSIOTERAPI'],
  ['Café Lyran', '#fef3c7', '#7c2d12', 'FIKA I HALLEN'],
  ['Snickar-Olles', '#7c2d12', '#fde68a', 'BYGG & RENOVERING'],
  ['Bilverkstan', '#dc2626', '#ffffff', 'SERVICE · DÄCK'],
  ['Frisör Saxen', '#ec4899', '#ffffff', 'DROP IN'],
  ['Måleri Pensel & Co', '#0ea5e9', '#0c1a2b', 'VI MÅLAR ALLT'],
  ['Pizzeria Bella', '#16a34a', '#ffffff', 'BARNMENY 79:-'],
  ['Trädgårdsmästarn', '#4d7c0f', '#ecfccb', 'VÄXTER & JORD'],
  ['IBK Ungdom', '#ffffff', '#c81e1e', 'HEJA HEJA!'],
]

function adTexture(i: number) {
  const [name, bg, fg, sub] = SPONSORS[i % SPONSORS.length]
  return tex(512, 128, (g) => {
    g.fillStyle = '#fbfbf9'
    g.fillRect(0, 0, 512, 128)
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(10, 14, 492, 88, 10)
    g.fill()
    g.fillStyle = fg
    g.font = '900 44px "Arial Black", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(name, 256, 48, 460)
    g.font = '700 18px system-ui, sans-serif'
    g.fillText(sub, 256, 84, 440)
    g.fillStyle = '#e5e7eb'
    g.fillRect(0, 110, 512, 18)
  })
}

function blockWall(color: string) {
  const t = tex(512, 512, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, 512, 512)
    g.strokeStyle = 'rgba(0,0,0,0.08)'
    g.lineWidth = 2
    for (let row = 0; row < 16; row++) {
      const y = row * 32
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(512, y)
      g.stroke()
      for (let x = (row % 2) * 64; x < 512; x += 128) {
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x, y + 32)
        g.stroke()
      }
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function padTexture(color: string) {
  const t = tex(256, 256, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(0, 0, 4, 256)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    g.fillRect(4, 0, 6, 256)
  })
  t.wrapS = THREE.RepeatWrapping
  return t
}

function windowTexture() {
  return tex(512, 128, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 128)
    sky.addColorStop(0, '#dbeafe')
    sky.addColorStop(1, '#f8fafc')
    g.fillStyle = sky
    g.fillRect(0, 0, 512, 128)
    g.fillStyle = 'rgba(148,163,184,0.5)'
    for (let x = 0; x < 512; x += 37) g.fillRect(x, 70 + Math.sin(x) * 8, 22, 60)
    g.fillStyle = '#475569'
    for (let x = 0; x <= 512; x += 64) g.fillRect(x - 3, 0, 6, 128)
    g.fillRect(0, 0, 512, 6)
    g.fillRect(0, 122, 512, 6)
    g.fillRect(0, 62, 512, 4)
  })
}

function scoreboardTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 384
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const draw = (clock: string, home: number, away: number) => {
    const g = c.getContext('2d')!
    g.fillStyle = '#05070b'
    g.fillRect(0, 0, 1024, 384)
    g.strokeStyle = '#1f2937'
    g.lineWidth = 10
    g.strokeRect(5, 5, 1014, 374)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#e5e7eb'
    g.font = '800 52px system-ui, sans-serif'
    g.fillText('HEMMA', 190, 70)
    g.fillText('BORTA', 834, 70)
    g.font = '700 40px ui-monospace, monospace'
    g.fillStyle = '#fbbf24'
    g.fillText('PERIOD 1', 512, 70)
    g.shadowColor = '#ef4444'
    g.shadowBlur = 18
    g.fillStyle = '#ef4444'
    g.font = '900 170px ui-monospace, monospace'
    g.fillText(String(home), 190, 230)
    g.fillText(String(away), 834, 230)
    g.shadowColor = '#facc15'
    g.fillStyle = '#facc15'
    g.font = '900 130px ui-monospace, monospace'
    g.fillText(clock, 512, 220)
    g.shadowBlur = 0
    t.needsUpdate = true
  }
  return { t, draw }
}

function bannerTexture(title: string, sub: string, color: string) {
  return tex(256, 512, (g) => {
    g.fillStyle = color
    g.fillRect(0, 0, 256, 512)
    g.fillStyle = '#facc15'
    g.fillRect(0, 0, 256, 18)
    g.fillRect(0, 494, 256, 18)
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.font = '900 54px "Arial Black", system-ui, sans-serif'
    g.fillText(title, 128, 150, 230)
    g.font = '700 30px system-ui, sans-serif'
    sub.split('\n').forEach((s, i) => g.fillText(s, 128, 240 + i * 44, 230))
    g.beginPath()
    g.arc(128, 420, 40, 0, Math.PI * 2)
    g.strokeStyle = '#facc15'
    g.lineWidth = 8
    g.stroke()
  })
}

function signTexture(text: string, bg: string) {
  return tex(256, 96, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, 256, 96)
    g.fillStyle = '#ffffff'
    g.font = '900 34px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 150, 50)
    g.fillRect(20, 30, 36, 40)
  })
}

function inst(geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], shadow = false) {
  const x = new THREE.InstancedMesh(geo, m, Math.max(1, mats.length))
  mats.forEach((a, i) => x.setMatrixAt(i, a))
  x.count = mats.length
  x.castShadow = shadow
  x.receiveShadow = true
  return x
}

const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0, rx = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))

function lines(field: Field) {
  const g = new THREE.Group()
  const red = new THREE.MeshStandardMaterial({ color: LINE, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const blue = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.85, transparent: true, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  const black = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.85, transparent: true, opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  const flat = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, rot = 0, y = 0.001) => {
    const mm = new THREE.Mesh(geo, m)
    mm.rotation.x = -Math.PI / 2
    mm.rotation.z = rot
    mm.position.set(x, y, z)
    mm.receiveShadow = true
    g.add(mm)
  }
  const rect = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material, w = 0.05) => {
    flat(new THREE.PlaneGeometry(Math.abs(x1 - x0) + w, w), m, (x0 + x1) / 2, z0)
    flat(new THREE.PlaneGeometry(Math.abs(x1 - x0) + w, w), m, (x0 + x1) / 2, z1)
    flat(new THREE.PlaneGeometry(w, Math.abs(z1 - z0)), m, x0, (z0 + z1) / 2)
    flat(new THREE.PlaneGeometry(w, Math.abs(z1 - z0)), m, x1, (z0 + z1) / 2)
  }
  const hx = field.halfLength
  const hz = field.halfWidth
  flat(new THREE.PlaneGeometry(0.05, hz * 2), red, 0, 0)
  flat(new THREE.RingGeometry(FLOORBALL.centerR - 0.025, FLOORBALL.centerR + 0.025, 96), red, 0, 0)
  flat(new THREE.CircleGeometry(0.12, 24), red, 0, 0, 0, 0.0015)
  for (const s of [-1, 1]) {
    rect(s * (hx - 2.85), -2.5, s * (hx - 6.85), 2.5, red)
    rect(s * field.goalLineX, -1.25, s * (field.goalLineX - 1), 1.25, red)
    for (const zz of [-1, 1]) {
      const dot = new THREE.CircleGeometry(0.11, 20)
      flat(dot, red, s * field.goalLineX, zz * (hz - 1.5), 0, 0.0015)
      flat(dot.clone(), red, 0, zz * (hz - 1.5), 0, 0.0015)
    }
    flat(new THREE.PlaneGeometry(0.05, 3), blue, s * (hx - 6), 0)
    for (const zz of [-1, 1]) flat(new THREE.RingGeometry(5.975, 6.025, 48, 1, zz > 0 ? (s > 0 ? Math.PI / 2 : 0) : s > 0 ? Math.PI : -Math.PI / 2, Math.PI / 2), blue, s * hx, zz * 1.5)
    for (let a = -1.6; a <= 1.6; a += 0.16) {
      const seg = new THREE.RingGeometry(8.975, 9.025, 4, 1, a, 0.08)
      flat(seg, blue, s * hx, 0, s > 0 ? Math.PI : 0)
    }
    flat(new THREE.PlaneGeometry(0.05, 0.6), black, s * (hx - 5.8), hz - 0.1)
  }
  for (const s of [-1, 1]) rect(-14, s * 7.5, 14, s * 7.49, black, 0.04)
  return g
}

function sarg(field: Field) {
  const g = new THREE.Group()
  const hx = field.halfLength
  const hz = field.halfWidth
  const r = field.cornerTop
  const H = 0.5
  const T = 0.025
  const white = new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 0.35 })
  const back = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6 })
  const rim = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4 })
  const panel = (x: number, z: number, len: number, yaw: number) => {
    const geo = new THREE.BoxGeometry(len - 0.012, H, T)
    const m = new THREE.Mesh(geo, [white, white, rim, white, white, back])
    m.position.set(x, H / 2, z)
    m.rotation.y = yaw
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len - 0.012, 8), rim)
    top.rotation.z = Math.PI / 2
    top.position.set(0, H / 2, 0)
    m.add(top)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.24), back)
    foot.position.set(len / 2 - 0.02, -H / 2 + 0.16, -0.12)
    foot.castShadow = true
    m.add(foot)
  }
  const along = (x0: number, x1: number, z: number, yaw: number, rotate: boolean) => {
    const total = x1 - x0
    const count = Math.round(total / 2)
    const len = total / count
    for (let i = 0; i < count; i++) {
      const c = x0 + len * (i + 0.5)
      if (rotate) panel(z, c, len, yaw)
      else panel(c, z, len, yaw)
    }
  }
  const o = T / 2
  along(-hx + r, hx - r, -hz - o, 0, false)
  along(-hx + r, hx - r, hz + o, Math.PI, false)
  along(-hz + r, hz - r, hx + o, -Math.PI / 2, true)
  along(-hz + r, hz - r, -hx - o, Math.PI / 2, true)
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const cx = sx * (hx - r)
    const cz = sz * (hz - r)
    const k = 4
    for (let i = 0; i < k; i++) {
      const a0 = (i / k) * (Math.PI / 2)
      const a1 = ((i + 1) / k) * (Math.PI / 2)
      const am = (a0 + a1) / 2
      const px = cx + sx * Math.cos(am) * (r + o)
      const pz = cz + sz * Math.sin(am) * (r + o)
      const len = 2 * (r + o) * Math.sin((a1 - a0) / 2) + 0.02
      const nx = sx * Math.cos(am)
      const nz = sz * Math.sin(am)
      panel(px, pz, len, Math.atan2(nx, nz) + Math.PI)
    }
  }
  return g
}

function netTexture() {
  const t = tex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 28, 64, 8)
    g.fillRect(28, 0, 8, 64)
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function buildFloorballGoal(goal: Goal) {
  const g = new THREE.Group()
  g.position.set(goal.pos.x, 0, goal.pos.y)
  g.rotation.y = -goal.angle
  const HALF = RINK.goalHalfWidth
  const H = GOAL_HEIGHT
  const D = 0.65
  const red = new THREE.MeshStandardMaterial({ color: '#d0102a', roughness: 0.3, metalness: 0.25 })
  const r = 0.028
  const bar = (a: THREE.Vector3, b: THREE.Vector3, rad = r) => {
    const d = b.clone().sub(a)
    const m = new THREE.Mesh(new RoundedBoxGeometry(rad * 2, d.length() + rad * 2, rad * 2, 2, rad * 0.5), red)
    m.position.copy(a).addScaledVector(d, 0.5)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    m.castShadow = true
    g.add(m)
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  for (const z of [-HALF, HALF]) {
    bar(v(0, r, z), v(0, H, z))
    bar(v(0, r, z), v(-D, r, z), r * 0.8)
    bar(v(0, H, z), v(-0.12, H, z), r * 0.8)
    bar(v(-0.12, H, z), v(-D, r, z), r * 0.7)
  }
  bar(v(0, H, -HALF), v(0, H, HALF))
  bar(v(-D, r, -HALF), v(-D, r, HALF), r * 0.8)
  bar(v(-0.12, H, -HALF), v(-0.12, H, HALF), r * 0.6)
  const nt = netTexture()
  const net = new THREE.MeshStandardMaterial({ map: nt, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 })
  const cell = 0.06
  const quad = (pts: THREE.Vector3[]) => {
    const geo = new THREE.BufferGeometry()
    const pos: number[] = []
    const uv: number[] = []
    for (const p of pts) {
      pos.push(p.x, p.y, p.z)
      uv.push((p.z + p.x * 0.3) / cell, (p.y - p.x * 0.4) / cell)
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2])
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, net)
    g.add(m)
  }
  quad([v(-0.12, H, -HALF), v(-0.12, H, HALF), v(-D, 0.01, HALF), v(-D, 0.01, -HALF)])
  for (const z of [-HALF, HALF]) quad([v(0, H, z), v(-0.12, H, z), v(-D, 0.01, z), v(0, 0.01, z)])
  quad([v(0, H, -HALF), v(0, H, HALF), v(-0.12, H, HALF), v(-0.12, H, -HALF)])
  const floorNet = new THREE.Mesh(new THREE.PlaneGeometry(D, HALF * 2), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.9, transparent: true, opacity: 0.55 }))
  floorNet.rotation.x = -Math.PI / 2
  floorNet.position.set(-D / 2, 0.004, 0)
  g.add(floorNet)
  return g
}

interface Person {
  pos: THREE.Vector3
  yaw: number
  scale: number
  seated: boolean
  stand: number
  arms: number
  clap: number
  delay: number
  lean: number
  headYaw: number
  chatter: number
  idleT: number
  shirt: THREE.Color
  team: number
}

function crowd(people: Person[]) {
  const n = people.length
  const unit = (geo: THREE.BufferGeometry, m: THREE.Material, count: number) => {
    const x = new THREE.InstancedMesh(geo, m, count)
    x.castShadow = false
    x.receiveShadow = false
    x.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return x
  }
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
  const torso = unit(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), white, n)
  const head = unit(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), n)
  const hair = unit(new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), n)
  const thigh = unit(new RoundedBoxGeometry(0.3, 0.13, 0.42, 2, 0.05), white, n)
  const shin = unit(new RoundedBoxGeometry(0.26, 0.42, 0.12, 2, 0.04), white, n)
  const arm = unit(new THREE.CapsuleGeometry(0.045, 0.24, 4, 8), white, n * 2)
  const fore = unit(new THREE.CapsuleGeometry(0.04, 0.22, 4, 8), white, n * 2)
  const face = unit(new THREE.CircleGeometry(0.03, 8), new THREE.MeshBasicMaterial({ color: '#1f2937' }), n * 2)
  const r = rngFor('crowd')
  const skinCols: THREE.Color[] = []
  people.forEach((p, i) => {
    const look = lookFor(`fan${i}`, p.scale > 0.85)
    const skin = new THREE.Color(look.skin)
    skinCols.push(skin)
    torso.setColorAt(i, p.shirt)
    head.setColorAt(i, skin)
    hair.setColorAt(i, new THREE.Color(r() < 0.12 ? ['#1d4ed8', '#c81e1e', '#111827', '#facc15'][Math.floor(r() * 4)] : look.hair))
    const pants = new THREE.Color(['#1e3a8a', '#1f2937', '#334155', '#0f172a', '#a8a29e', '#3f6212'][Math.floor(r() * 6)])
    thigh.setColorAt(i, pants)
    shin.setColorAt(i, pants)
    for (const s of [0, 1]) {
      arm.setColorAt(i * 2 + s, p.shirt)
      fore.setColorAt(i * 2 + s, r() < 0.3 ? skin : p.shirt)
      face.setColorAt(i * 2 + s, new THREE.Color('#1f2937'))
    }
  })
  const group = new THREE.Group()
  group.add(torso, head, hair, thigh, shin, arm, fore, face)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p3 = new THREE.Vector3()
  const s3 = new THREE.Vector3()
  const base = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const set = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx = 1, sy = 1, sz = 1) => {
    local.compose(p3.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s3.set(sx, sy, sz))
    m.multiplyMatrices(base, local)
    mesh.setMatrixAt(i, m)
  }
  let cheerT = -99
  let cheerKind: 'goal' | 'save' = 'goal'
  let t = 0
  const update = (dt: number, focus: THREE.Vector3 | null) => {
    t += dt
    const since = t - cheerT
    people.forEach((p, i) => {
      const local = since - p.delay
      const goal = cheerKind === 'goal' && local > 0 && local < 3.4
      const save = cheerKind === 'save' && local > 0 && local < 1.6
      p.idleT -= dt
      if (p.idleT < 0) {
        p.idleT = 2 + Math.random() * 8
        p.chatter = Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0
        p.clap = Math.random() < 0.06 ? 1.5 : 0
      }
      p.clap = Math.max(0, p.clap - dt)
      const wantStand = goal ? 1 : save ? 0.35 : p.seated ? 0 : 1
      p.stand += (wantStand - p.stand) * (1 - Math.exp(-dt * (goal ? 7 : 4)))
      const wantArms = goal ? 1 : 0
      p.arms += (wantArms - p.arms) * (1 - Math.exp(-dt * 8))
      p.lean += ((save ? 0.25 : 0) - p.lean) * (1 - Math.exp(-dt * 5))
      let want = 0
      if (focus) {
        const dx = focus.x - p.pos.x
        const dz = focus.z - p.pos.z
        want = Math.atan2(dx, dz) - p.yaw
        want = Math.atan2(Math.sin(want), Math.cos(want))
        want = THREE.MathUtils.clamp(want, -1.2, 1.2)
      }
      if (p.chatter) want = p.chatter * 1.1
      p.headYaw += (want - p.headYaw) * (1 - Math.exp(-dt * 3))
      base.compose(p.pos, q.setFromAxisAngle(p3.set(0, 1, 0), p.yaw), s3.setScalar(p.scale))
      const st = p.stand
      const hipY = THREE.MathUtils.lerp(0.45, 0.88, st)
      const bounce = goal ? Math.abs(Math.sin(local * 9 + i)) * 0.06 * st : 0
      const lean = p.lean
      set(thigh, i, 0, hipY, THREE.MathUtils.lerp(0.18, 0.02, st), THREE.MathUtils.lerp(0, -1.45, st), 0, 0)
      set(shin, i, 0, THREE.MathUtils.lerp(0.22, 0.24, st), THREE.MathUtils.lerp(0.4, 0.04, st), 0, 0, 0)
      const ty = hipY + 0.33 + bounce
      set(torso, i, 0, ty, 0.03 + lean * 0.3, lean, 0, 0, 1, 1, 0.75)
      const hy = ty + 0.36
      const hz = 0.03 + lean * 0.42
      set(head, i, 0, hy, hz, 0, p.headYaw, 0)
      set(hair, i, -0.0, hy + 0.012, hz - 0.012, -0.25, p.headYaw, 0)
      for (const s of [-1, 1]) {
        const k = i * 2 + (s > 0 ? 1 : 0)
        set(face, k, Math.sin(p.headYaw) * 0.095 + s * 0.035 * Math.cos(p.headYaw), hy + 0.015, hz + Math.cos(p.headYaw) * 0.095 - s * 0.035 * Math.sin(p.headYaw), 0, p.headYaw, 0, 0.3, 0.3, 1)
        const clap = p.clap > 0 || save ? Math.sin(t * 16 + i) * 0.12 : 0
        const up = p.arms
        const ax = s * 0.2
        const ay = ty + 0.12
        const shoulderUp = -2.8 * up
        set(arm, k, ax + s * 0.03 * up, ay + 0.12 * up, 0.06, THREE.MathUtils.lerp(-0.5 - (p.clap > 0 ? 0.6 : 0), shoulderUp, up), 0, s * (0.18 + 0.25 * up))
        const fy = THREE.MathUtils.lerp(ay - 0.12, ay + 0.52, up)
        const fz = THREE.MathUtils.lerp(0.27 + (p.clap > 0 || save ? 0.06 : 0), 0.1, up)
        set(fore, k, ax * THREE.MathUtils.lerp(0.55 - clap, 1.4, up) + s * (Math.sin(local * 10 + i) * 0.06 * up), fy, fz, THREE.MathUtils.lerp(-1.4, -0.2, up), 0, -s * THREE.MathUtils.lerp(0.6, 0.15, up))
      }
    })
    for (const x of [torso, head, hair, thigh, shin, arm, fore, face]) x.instanceMatrix.needsUpdate = true
  }
  update(0.016, null)
  const cheer = (kind: 'goal' | 'save') => {
    cheerT = t
    cheerKind = kind
    people.forEach((p) => (p.delay = Math.random() * (kind === 'goal' ? 0.5 : 0.25)))
  }
  return { group, update, cheer }
}

function bleacherPeople(teamColors: string[]) {
  const r = rngFor('seats')
  const people: Person[] = []
  const rows = 7
  const depth = 0.85
  const rise = 0.42
  const front = -12.9
  const casual = ['#1f2937', '#334155', '#7f1d1d', '#065f46', '#0f766e', '#a16207', '#e5e7eb', '#475569', '#9a3412', '#6d28d9', '#be123c', '#f8fafc', '#0369a1']
  const seats: THREE.Matrix4[] = []
  const seatCols: THREE.Color[] = []
  for (let row = 0; row < rows; row++) {
    const z = front - depth * (row + 0.5)
    const y = rise * (row + 1)
    for (let x = -18.75; x <= 18.75; x += 0.5) {
      if (Math.abs(x) < 0.6 || Math.abs(Math.abs(x) - 11) < 0.6) continue
      seats.push(M(x, y + 0.03, z + 0.12))
      seatCols.push(new THREE.Color(row % 2 ? '#1d4ed8' : '#2563eb'))
      const center = 1 - Math.min(1, Math.abs(x) / 22)
      if (r() < 0.3 + center * 0.35 - row * 0.02) {
        const team = r() < 0.5 ? 0 : 1
        const fan = r() < 0.35
        const kid = r() < 0.18
        people.push({
          pos: new THREE.Vector3(x + (r() - 0.5) * 0.06, y - 0.38 + 0.03, z + 0.1),
          yaw: 0,
          scale: kid ? 0.72 : 0.92 + r() * 0.12,
          seated: r() > 0.04,
          stand: 0,
          arms: 0,
          clap: 0,
          delay: 0,
          lean: 0,
          headYaw: 0,
          chatter: 0,
          idleT: r() * 6,
          shirt: new THREE.Color(fan ? teamColors[team] : casual[Math.floor(r() * casual.length)]),
          team,
        })
      }
    }
  }
  return { people, seats, seatCols, rows, depth, rise, front }
}

function benchPeople(teamColors: string[]) {
  const r = rngFor('bench')
  const people: Person[] = []
  for (const [team, x0] of [
    [0, -9],
    [1, 3.5],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      if (r() < 0.25) continue
      people.push({
        pos: new THREE.Vector3(x0 + i * 1.1 + (r() - 0.5) * 0.2, 0.04, 12.1),
        yaw: Math.PI,
        scale: 0.66 + r() * 0.05,
        seated: true,
        stand: 0,
        arms: 0,
        clap: 0,
        delay: 0,
        lean: 0,
        headYaw: 0,
        chatter: 0,
        idleT: r() * 4,
        shirt: new THREE.Color(teamColors[team]),
        team,
      })
    }
  }
  return people
}

export interface Hall {
  group: THREE.Group
  sun: THREE.DirectionalLight
  update: (dt: number, focus: THREE.Vector3 | null, clock: number) => void
  cheer: (kind: 'goal' | 'save') => void
}

export function buildHall(field: Field, teamColors: string[], maxAniso: number): Hall {
  const g = new THREE.Group()
  const fw = W.x1 - W.x0
  const fd = W.z1 - W.z0
  const outer = vinyl('#4a6488')
  outer.wrapS = outer.wrapT = THREE.RepeatWrapping
  outer.anisotropy = maxAniso
  outer.repeat.set(fw / 4, fd / 4)
  const rough = floorRough()
  rough.repeat.set(fw / 6, fd / 6)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshStandardMaterial({ map: outer, roughness: 0.8, roughnessMap: rough, metalness: 0 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set((W.x0 + W.x1) / 2, 0, (W.z0 + W.z1) / 2)
  floor.receiveShadow = true
  g.add(floor)
  const hx = field.halfLength
  const hz = field.halfWidth
  const cr = field.cornerTop
  const shape = new THREE.Shape()
  shape.moveTo(-hx + cr, -hz)
  shape.lineTo(hx - cr, -hz)
  shape.quadraticCurveTo(hx, -hz, hx, -hz + cr)
  shape.lineTo(hx, hz - cr)
  shape.quadraticCurveTo(hx, hz, hx - cr, hz)
  shape.lineTo(-hx + cr, hz)
  shape.quadraticCurveTo(-hx, hz, -hx, hz - cr)
  shape.lineTo(-hx, -hz + cr)
  shape.quadraticCurveTo(-hx, -hz, -hx + cr, -hz)
  const courtGeo = new THREE.ShapeGeometry(shape, 12)
  const uv = courtGeo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4)
  const inner = vinyl('#2f6fc0')
  inner.wrapS = inner.wrapT = THREE.RepeatWrapping
  inner.anisotropy = maxAniso
  const court = new THREE.Mesh(courtGeo, new THREE.MeshStandardMaterial({ map: inner, roughness: 0.9, roughnessMap: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
  court.rotation.x = -Math.PI / 2
  court.position.y = 0.0005
  court.receiveShadow = true
  g.add(court)
  g.add(lines(field))
  g.add(sarg(field))

  const padBlue = padTexture('#2c4f86')
  const wallTex = blockWall('#ecebe6')
  const walls: { x: number; z: number; len: number; yaw: number }[] = [
    { x: 0, z: W.z0, len: fw, yaw: 0 },
    { x: 0, z: W.z1, len: fw, yaw: Math.PI },
    { x: W.x0, z: (W.z0 + W.z1) / 2, len: fd, yaw: Math.PI / 2 },
    { x: W.x1, z: (W.z0 + W.z1) / 2, len: fd, yaw: -Math.PI / 2 },
  ]
  for (const w of walls) {
    const holder = new THREE.Group()
    holder.position.set(w.x, 0, w.z)
    holder.rotation.y = w.yaw
    const pt = padBlue.clone()
    pt.repeat.set(w.len / 1.2, 1)
    pt.needsUpdate = true
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w.len, 2.2), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 }))
    pad.position.set(0, 1.1, 0.06)
    pad.receiveShadow = true
    const wt = wallTex.clone()
    wt.repeat.set(w.len / 4, (W.h - 2.2) / 4)
    wt.needsUpdate = true
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(w.len, W.h - 2.2), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.9 }))
    upper.position.set(0, 2.2 + (W.h - 2.2) / 2, 0)
    upper.receiveShadow = true
    const kick = new THREE.Mesh(new THREE.BoxGeometry(w.len, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 }))
    kick.position.set(0, 0.05, 0.1)
    holder.add(pad, upper, kick)
    if (Math.abs(w.yaw) < 0.1 || Math.abs(w.yaw - Math.PI) < 0.1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w.len - 6, 1.7), new THREE.MeshBasicMaterial({ map: windowTexture(), toneMapped: false }))
      ;(win.material as THREE.MeshBasicMaterial).map!.wrapS = THREE.RepeatWrapping
      ;(win.material as THREE.MeshBasicMaterial).map!.repeat.set((w.len - 6) / 8, 1)
      win.position.set(0, W.h - 1.6, 0.02)
      holder.add(win)
    }
    g.add(holder)
  }

  const ceilMat = new THREE.MeshStandardMaterial({ color: '#d8dbe0', roughness: 0.95, side: THREE.FrontSide })
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), ceilMat)
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set((W.x0 + W.x1) / 2, W.h, (W.z0 + W.z1) / 2)
  g.add(ceiling)
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.5, metalness: 0.6 })
  const truss: THREE.Matrix4[] = []
  for (let x = -24; x <= 24; x += 6) {
    truss.push(M(x, W.h - 0.25, (W.z0 + W.z1) / 2, 0.14, 0.14, fd))
    truss.push(M(x, W.h - 1.2, (W.z0 + W.z1) / 2, 0.12, 0.12, fd - 1))
    for (let z = W.z0 + 0.5; z < W.z1 - 1; z += 1.5) {
      truss.push(M(x, W.h - 0.72, z + 0.375, 0.06, 1.15, 0.06, 0, 0, z % 3 < 1.5 ? 0.66 : -0.66))
    }
  }
  for (let z = W.z0 + 3; z < W.z1; z += 4.5) truss.push(M(0, W.h - 0.25, z, fw, 0.1, 0.1))
  g.add(inst(new THREE.BoxGeometry(1, 1, 1), steel, truss))
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 2.2, roughness: 0.4 })
  const lampFrame = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.5 })
  const lamps: THREE.Matrix4[] = []
  const frames: THREE.Matrix4[] = []
  for (let x = -21; x <= 21; x += 6) {
    for (const z of [-16, -10, -4, 2, 8, 13]) {
      lamps.push(M(x, W.h - 1.32, z, 1.2, 0.04, 0.5))
      frames.push(M(x, W.h - 1.28, z, 1.3, 0.08, 0.6))
    }
  }
  g.add(inst(new THREE.BoxGeometry(1, 1, 1), lampFrame, frames), inst(new THREE.BoxGeometry(1, 1, 1), lampMat, lamps))

  const bl = bleacherPeople(teamColors)
  const steps: THREE.Matrix4[] = []
  for (let row = 0; row < bl.rows; row++) {
    const z = bl.front - bl.depth * (row + 0.5)
    const y = bl.rise * (row + 1)
    steps.push(M(0, y / 2, z, 39, y, bl.depth))
  }
  g.add(inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.85 }), steps, false))
  const nose: THREE.Matrix4[] = []
  for (let row = 0; row < bl.rows; row++) nose.push(M(0, bl.rise * (row + 1) + 0.005, bl.front - bl.depth * row - 0.03, 39, 0.02, 0.06))
  g.add(inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.6 }), nose))
  const seatGeo = new RoundedBoxGeometry(0.42, 0.06, 0.4, 2, 0.02)
  const backGeo = new RoundedBoxGeometry(0.42, 0.34, 0.05, 2, 0.02)
  const seats = inst(seatGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), bl.seats)
  const backs = inst(
    backGeo,
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    bl.seats.map((m) => m.clone().multiply(M(0, 0.18, -0.2, 1, 1, 1, 0, 0, -0.12))),
  )
  bl.seatCols.forEach((c, i) => {
    seats.setColorAt(i, c)
    backs.setColorAt(i, c)
  })
  g.add(seats, backs)
  const railMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3, metalness: 0.8 })
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 39, 10), railMat)
  rail.rotation.z = Math.PI / 2
  rail.position.set(0, 1.25, bl.front + 0.05)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(39, 0.8), new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.18, roughness: 0.05 }))
  glass.position.set(0, 0.84, bl.front + 0.05)
  const posts: THREE.Matrix4[] = []
  for (let x = -19.5; x <= 19.5; x += 1.5) posts.push(M(x, 0.62, bl.front + 0.05, 0.04, 1.24, 0.04))
  g.add(rail, glass, inst(new THREE.BoxGeometry(1, 1, 1), railMat, posts))
  const stairs: THREE.Matrix4[] = []
  for (const x of [0, -11, 11]) {
    for (let k = 0; k < bl.rows * 2; k++) {
      stairs.push(M(x, (bl.rise / 2) * (k + 1) - 0.02, bl.front - (bl.depth / 2) * (k + 0.5), 1.0, 0.04, bl.depth / 2))
    }
  }
  g.add(inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.7 }), stairs))

  const benchMat = new THREE.MeshStandardMaterial({ color: '#b08350', roughness: 0.6 })
  for (const x0 of [-9.6, 2.9]) {
    const top = new THREE.Mesh(new RoundedBoxGeometry(6, 0.06, 0.36, 2, 0.02), benchMat)
    top.position.set(x0 + 3, 0.42, 12.2)
    top.castShadow = true
    top.receiveShadow = true
    g.add(top)
    for (const dx of [0.3, 3, 5.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.32), railMat)
      leg.position.set(x0 + dx, 0.2, 12.2)
      g.add(leg)
    }
    const bottles: THREE.Matrix4[] = []
    for (let i = 0; i < 6; i++) bottles.push(M(x0 + 0.5 + i * 0.22, 0.12, 11.75, 1, 1, 1))
    g.add(inst(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), new THREE.MeshStandardMaterial({ color: x0 < 0 ? teamColors[0] : teamColors[1], roughness: 0.3 }), bottles))
  }

  const ribMat = new THREE.MeshStandardMaterial({ color: '#c89a5e', roughness: 0.55 })
  const ribs: THREE.Matrix4[] = []
  const ribPosts: THREE.Matrix4[] = []
  for (let x = -22; x <= 22; x += 1.0) {
    if (Math.abs(x) < 3) continue
    ribPosts.push(M(x - 0.45, 1.3, W.z1 - 0.12, 0.08, 2.6, 0.08))
    for (let y = 0.15; y < 2.6; y += 0.15) ribs.push(M(x, y, W.z1 - 0.14, 1, 1, 1, 0, Math.PI / 2))
  }
  g.add(inst(new THREE.CylinderGeometry(0.018, 0.018, 0.86, 8), ribMat, ribs), inst(new THREE.BoxGeometry(1, 1, 1), ribMat, ribPosts))

  const sb = scoreboardTexture()
  sb.draw('15:00', 0, 0)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 4.2), [
    new THREE.MeshStandardMaterial({ color: '#111827' }),
    new THREE.MeshStandardMaterial({ color: '#111827' }),
    new THREE.MeshStandardMaterial({ color: '#111827' }),
    new THREE.MeshStandardMaterial({ color: '#111827' }),
    new THREE.MeshStandardMaterial({ color: '#111827' }),
    new THREE.MeshStandardMaterial({ color: '#111827' }),
  ])
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ map: sb.t, toneMapped: false }))
  screen.rotation.y = Math.PI / 2
  screen.position.set(0.11, 0, 0)
  board.add(screen)
  board.position.set(W.x0 + 0.2, 5.2, -2)
  g.add(board)

  const backboard = (x: number, dir: number) => {
    const grp = new THREE.Group()
    grp.position.set(x, 7.2, (W.z0 + W.z1) / 2 - 3)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 1.8), new THREE.MeshPhysicalMaterial({ color: '#f8fafc', transparent: true, opacity: 0.5, roughness: 0.1 }))
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.59), new THREE.MeshBasicMaterial({ color: '#f97316', wireframe: true }))
    edge.position.y = -0.2
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4 }))
    hoop.position.set(dir * 0.28, -0.45, 0)
    hoop.rotation.x = Math.PI / 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), steel)
    arm.position.set(-dir * 0.6, 0.3, 0)
    grp.add(plate, edge, hoop, arm)
    grp.rotation.z = dir * 0.35
    g.add(grp)
  }
  backboard(W.x0 + 1.4, 1)
  backboard(W.x1 - 1.4, -1)

  const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.6), new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.5, metalness: 0.3 }))
  door.rotation.y = -Math.PI / 2
  door.position.set(W.x1 - 0.07, 1.3, 7)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('UTGÅNG', '#15803d'), toneMapped: false }))
  sign.rotation.y = -Math.PI / 2
  sign.position.set(W.x1 - 0.08, 2.95, 7)
  const sign2 = sign.clone()
  sign2.rotation.y = Math.PI / 2
  sign2.position.set(W.x0 + 0.08, 2.95, -12)
  g.add(door, sign, sign2)

  const banners: [string, string, string][] = [
    ['IBK', 'Distrikts-\nmästare\nP12 2024', '#1e3a8a'],
    ['IBK', 'Seriesegrare\nF11 2025', '#7f1d1d'],
    ['HEJA', 'Alla barn\nspelar!', '#065f46'],
    ['IBK', 'Cupvinnare\nP10 2025', '#1e3a8a'],
  ]
  banners.forEach(([a, b, c], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshStandardMaterial({ map: bannerTexture(a, b, c), roughness: 0.85, side: THREE.DoubleSide }))
    m.position.set(-9 + i * 6, W.h - 3.3, W.z1 - 0.12)
    m.rotation.y = Math.PI
    g.add(m)
  })
  const wallAds: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: adTexture(i + 3), roughness: 0.6 }))
    m.position.set(W.x1 - 0.06, 3.4, -16 + i * 6.5)
    m.rotation.y = -Math.PI / 2
    if (Math.abs(m.position.z - 7) < 2.5) continue
    wallAds.push(m)
    g.add(m)
  }

  const fans = crowd([...bl.people, ...benchPeople(teamColors)])
  g.add(fans.group)

  g.add(new THREE.HemisphereLight('#fff8ee', '#b48a5a', 1.25))
  const sun = new THREE.DirectionalLight('#fffaf2', 1.7)
  sun.position.set(6, 30, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  const s = Math.max(field.halfLength, field.halfWidth) + 2
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 60 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.015
  sun.shadow.radius = 4
  g.add(sun, sun.target)

  let lastClock = ''
  return {
    group: g,
    sun,
    update: (dt, focus, clock) => {
      fans.update(dt, focus)
      const left = Math.max(0, 15 * 60 - Math.floor(clock))
      const txt = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
      if (txt !== lastClock) {
        lastClock = txt
        sb.draw(txt, 0, 0)
      }
    },
    cheer: fans.cheer,
  }
}
