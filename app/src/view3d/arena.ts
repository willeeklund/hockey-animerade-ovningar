import * as THREE from 'three'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RinkLines } from '../components/RinkLines'
import { DIVIDER, RINK, type Field } from '../model/rink'
import type { Divider, Goal } from '../model/types'
import { GOAL_HEIGHT } from '../engine/netView'

const ICE = '#f3f8fc'
const PX_PER_M = 64

export const to3 = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y)

function iceTexture(field: Field, maxAniso: number) {
  const w = field.halfLength * 2
  const h = field.halfWidth * 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * PX_PER_M)
  canvas.height = Math.round(h * PX_PER_M)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = maxAniso
  const svg = renderToStaticMarkup(
    createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: `${-field.halfLength} ${-field.halfWidth} ${w} ${h}`, width: canvas.width, height: canvas.height },
      createElement(RinkLines, { field }),
    ),
  ).replaceAll('var(--ice)', ICE)
  const img = new Image()
  img.onload = () => {
    const g = canvas.getContext('2d')!
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    tex.needsUpdate = true
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return tex
}

export function outline(field: Field, off: number): THREE.Vector2[] {
  const hx = field.halfLength
  const hy = field.halfWidth
  const corners = [
    { sx: 1, sy: -1, r: field.cornerTop, a0: -Math.PI / 2 },
    { sx: 1, sy: 1, r: field.cornerBottom, a0: 0 },
    { sx: -1, sy: 1, r: field.cornerBottom, a0: Math.PI / 2 },
    { sx: -1, sy: -1, r: field.cornerTop, a0: Math.PI },
  ]
  const pts: THREE.Vector2[] = []
  for (const c of corners) {
    if (c.r <= 0) {
      pts.push(new THREE.Vector2(c.sx * (hx + off), c.sy * (hy + off)))
      continue
    }
    const cx = c.sx * (hx - c.r)
    const cy = c.sy * (hy - c.r)
    const n = 14
    for (let i = 0; i <= n; i++) {
      const a = c.a0 + (i / n) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * (c.r + off), cy + Math.sin(a) * (c.r + off)))
    }
  }
  return pts
}

function crowdTexture(colors: string[]) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#1e2433'
  g.fillRect(0, 0, c.width, c.height)
  const palette = [...colors, ...colors, '#e5e7eb', '#9ca3af', '#f59e0b', '#374151', '#64748b', '#fde68a']
  for (let row = 0; row < 16; row++) {
    const y = row * 16 + 4
    g.fillStyle = row % 2 ? '#2a3142' : '#252c3b'
    g.fillRect(0, y + 8, c.width, 6)
    for (let x = (row % 2) * 6; x < c.width; x += 12) {
      if (Math.random() < 0.12) continue
      g.fillStyle = palette[Math.floor(Math.random() * palette.length)]
      g.fillRect(x, y + 3, 9, 8)
      g.fillStyle = ['#f1c7a5', '#d6a77a', '#8d5a3b', '#f5d0b5'][Math.floor(Math.random() * 4)]
      g.beginPath()
      g.arc(x + 4.5, y + 1.5, 3, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

function instanced(geom: THREE.BufferGeometry, material: THREE.Material, mats: THREE.Matrix4[], shadow = false) {
  const m = new THREE.InstancedMesh(geom, material, Math.max(1, mats.length))
  mats.forEach((x, i) => m.setMatrixAt(i, x))
  m.count = mats.length
  m.castShadow = shadow
  m.receiveShadow = shadow
  return m
}

function wallMatrices(pts: THREE.Vector2[], y0: number, y1: number, thickness: number, keep: (a: THREE.Vector2, b: THREE.Vector2) => boolean) {
  const out: THREE.Matrix4[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const len = a.distanceTo(b)
    if (len < 1e-3 || !keep(a, b)) continue
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(b.y - a.y, b.x - a.x))
    m.compose(new THREE.Vector3((a.x + b.x) / 2, (y0 + y1) / 2, (a.y + b.y) / 2), q, new THREE.Vector3(len + 0.03, y1 - y0, thickness))
    out.push(m)
  }
  return out
}

export function buildArena(field: Field, teamColors: string[], maxAniso: number) {
  const g = new THREE.Group()
  const floorball = field.layout === 'floorball'
  const zone = field.layout === 'zone'

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#141a26', roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.02
  floor.receiveShadow = true
  g.add(floor)

  const ice = new THREE.Mesh(
    new THREE.PlaneGeometry(field.halfLength * 2, field.halfWidth * 2),
    new THREE.MeshStandardMaterial({ map: iceTexture(field, maxAniso), roughness: floorball ? 0.6 : 0.18, metalness: 0.02, alphaTest: 0.5, transparent: false }),
  )
  ice.rotation.x = -Math.PI / 2
  ice.receiveShadow = true
  g.add(ice)

  const T = 0.18
  const pts = outline(field, T / 2)
  const isTop = (a: THREE.Vector2, b: THREE.Vector2) => zone && a.y < -field.halfWidth && b.y < -field.halfWidth
  const boardH = floorball ? 0.5 : 1.07
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const main = (a: THREE.Vector2, b: THREE.Vector2) => !isTop(a, b)
  g.add(instanced(unit, new THREE.MeshStandardMaterial({ color: floorball ? '#f8fafc' : '#fbfbf7', roughness: 0.5 }), wallMatrices(pts, 0.2, boardH, T, main), true))
  g.add(instanced(unit, new THREE.MeshStandardMaterial({ color: floorball ? '#1d4ed8' : '#facc15', roughness: 0.6 }), wallMatrices(pts, 0, 0.2, T + 0.01, main), true))
  g.add(instanced(unit, new THREE.MeshStandardMaterial({ color: floorball ? '#1d4ed8' : '#1e3a8a', roughness: 0.5 }), wallMatrices(pts, boardH, boardH + 0.06, T + 0.06, main)))
  if (zone) g.add(instanced(unit, new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.6 }), wallMatrices(pts, 0, 0.35, 0.25, isTop), true))
  if (!floorball) {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#dbeafe', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide })
    g.add(instanced(unit, glass, wallMatrices(pts, boardH + 0.06, boardH + 1.8, 0.03, main)))
  }

  const crowd = new THREE.MeshStandardMaterial({ map: crowdTexture(teamColors), roughness: 0.9 })
  const back = 4
  const rise = 9
  const depth = 14
  const sides = [
    { len: field.halfLength * 2 + 8, x: 0, y: -(field.halfWidth + back), rot: 0, skip: zone },
    { len: field.halfLength * 2 + 8, x: 0, y: field.halfWidth + back, rot: Math.PI, skip: false },
    { len: field.halfWidth * 2 + 8, x: field.halfLength + back, y: 0, rot: -Math.PI / 2, skip: false },
    { len: field.halfWidth * 2 + 8, x: -(field.halfLength + back), y: 0, rot: Math.PI / 2, skip: false },
  ]
  for (const s of sides) {
    if (s.skip) continue
    const slope = Math.hypot(rise, depth)
    const tex = (crowd.map as THREE.Texture).clone()
    tex.repeat.set(s.len / 24, 1)
    tex.needsUpdate = true
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.len, slope), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
    const holder = new THREE.Group()
    holder.position.set(s.x, 0, s.y)
    holder.rotation.y = s.rot
    plane.position.set(0, 1.4 + rise / 2, -depth / 2)
    plane.rotation.x = -Math.atan2(depth, rise)
    holder.add(plane)
    g.add(holder)
  }

  return g
}

export function buildLights(scene: THREE.Object3D, field: Field) {
  scene.add(new THREE.HemisphereLight('#eef4ff', '#2b3446', 1.6))
  const sun = new THREE.DirectionalLight('#ffffff', 2.0)
  sun.position.set(8, 30, 14)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const s = Math.max(field.halfLength, field.halfWidth) + 2
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 80 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)
  return sun
}

function netTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(32, 0)
  g.lineTo(64, 32)
  g.lineTo(32, 64)
  g.closePath()
  g.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

const GOAL_RED = '#c8102e'
const HALF = RINK.goalHalfWidth
const TOP_DEPTH = 0.45

function baseCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, -HALF),
    new THREE.Vector3(-0.55, 0.02, -HALF * 0.98),
    new THREE.Vector3(-1.0, 0.02, -HALF * 0.6),
    new THREE.Vector3(-RINK.goalDepth, 0.02, 0),
    new THREE.Vector3(-1.0, 0.02, HALF * 0.6),
    new THREE.Vector3(-0.55, 0.02, HALF * 0.98),
    new THREE.Vector3(0, 0.02, HALF),
  ])
}

export function buildGoal(goal: Goal, withCrease: boolean) {
  const g = new THREE.Group()
  g.position.copy(to3(goal.pos.x, goal.pos.y))
  g.rotation.y = -goal.angle
  const red = new THREE.MeshStandardMaterial({ color: GOAL_RED, roughness: 0.35, metalness: 0.3 })
  const white = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 })
  const r = 0.032
  for (const z of [-HALF, HALF]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_HEIGHT, 16), red)
    post.position.set(0, GOAL_HEIGHT / 2, z)
    post.castShadow = true
    g.add(post)
    const side = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, TOP_DEPTH, 10), red)
    side.rotation.z = Math.PI / 2
    side.position.set(-TOP_DEPTH / 2, GOAL_HEIGHT, z)
    g.add(side)
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, HALF * 2 + 2 * r, 16), red)
  bar.rotation.x = Math.PI / 2
  bar.position.set(0, GOAL_HEIGHT, 0)
  bar.castShadow = true
  const backBar = bar.clone()
  backBar.scale.set(0.8, 1, 0.8)
  backBar.position.x = -TOP_DEPTH
  g.add(bar, backBar)
  const base = baseCurve()
  const tube = new THREE.Mesh(new THREE.TubeGeometry(base, 40, 0.025, 8, false), white)
  g.add(tube)

  const N = 40
  const H = GOAL_HEIGHT
  const top = (s: number) => {
    const sideLen = TOP_DEPTH
    const total = sideLen * 2 + HALF * 2
    const d = s * total
    if (d < sideLen) return new THREE.Vector3(-d, H, -HALF)
    if (d < sideLen + HALF * 2) return new THREE.Vector3(-TOP_DEPTH, H, -HALF + (d - sideLen))
    return new THREE.Vector3(-TOP_DEPTH + (d - sideLen - HALF * 2), H, HALF)
  }
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let along = 0
  let prev: THREE.Vector3 | null = null
  for (let i = 0; i <= N; i++) {
    const s = i / N
    const b = base.getPointAt(s)
    const t = top(s)
    if (prev) along += prev.distanceTo(b)
    prev = b
    pos.push(b.x, b.y, b.z, t.x, t.y, t.z)
    const h = b.distanceTo(t)
    uv.push(along / 0.12, 0, along / 0.12, h / 0.12)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  pos.push(0, H, -HALF, -TOP_DEPTH, H, -HALF, 0, H, HALF, -TOP_DEPTH, H, HALF)
  const k = (N + 1) * 2
  uv.push(0, 0, TOP_DEPTH / 0.12, 0, 0, (HALF * 2) / 0.12, TOP_DEPTH / 0.12, (HALF * 2) / 0.12)
  idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3)
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geom.setIndex(idx)
  geom.computeVertexNormals()
  const net = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 }))
  g.add(net)

  if (withCrease) {
    const crease = new THREE.Mesh(
      new THREE.CircleGeometry(RINK.creaseR, 40, -Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#9fd3f2', roughness: 0.3, transparent: true, opacity: 0.85 }),
    )
    crease.rotation.x = -Math.PI / 2
    crease.position.y = 0.004
    crease.receiveShadow = true
    g.add(crease)
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.05, HALF * 2 + 0.3), new THREE.MeshBasicMaterial({ color: GOAL_RED }))
    line.rotation.x = -Math.PI / 2
    line.position.y = 0.005
    g.add(line)
  }
  return g
}

export function buildDivider(d: Divider) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(DIVIDER.length, 0.35, 0.22), new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.6 }))
  m.position.copy(to3(d.pos.x, d.pos.y, 0.175))
  m.rotation.y = -d.angle
  m.castShadow = true
  return m
}
