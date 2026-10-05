import { DIVIDER } from '../model/rink'
import type { Divider, Vec } from '../model/types'
import { add, clamp, dist, dot, fromAngle, len, mul, norm, sub } from './vec'

export interface Wall {
  a: Vec
  b: Vec
  chain: number
}

export interface Chain {
  start: Vec
  end: Vec
  center: Vec
}

export interface WallSet {
  walls: Wall[]
  chains: Chain[]
}

const JOIN_DISTANCE = 0.4
const AVOID_CLEARANCE = 0.9
const AROUND_END = 1.5
const LOOKAHEAD = 6
const PUCK_CLEARANCE = DIVIDER.thickness / 2 + 0.05

export function dividerEnds(d: Divider): [Vec, Vec] {
  const half = fromAngle(d.angle, DIVIDER.length / 2)
  return [sub(d.pos, half), add(d.pos, half)]
}

export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-9) return a
  return add(a, mul(ab, clamp(dot(sub(p, a), ab) / l2, 0, 1)))
}

function cross(a: Vec, b: Vec) {
  return a.x * b.y - a.y * b.x
}

function segmentsIntersect(p1: Vec, p2: Vec, q1: Vec, q2: Vec) {
  const d1 = cross(sub(q2, q1), sub(p1, q1))
  const d2 = cross(sub(q2, q1), sub(p2, q1))
  const d3 = cross(sub(p2, p1), sub(q1, p1))
  const d4 = cross(sub(p2, p1), sub(q2, p1))
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function segmentDistance(p1: Vec, p2: Vec, q1: Vec, q2: Vec) {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0
  return Math.min(
    dist(p1, closestOnSegment(p1, q1, q2)),
    dist(p2, closestOnSegment(p2, q1, q2)),
    dist(q1, closestOnSegment(q1, p1, p2)),
    dist(q2, closestOnSegment(q2, p1, p2)),
  )
}

export function buildWalls(dividers: Divider[]): WallSet {
  const segs = dividers.map(dividerEnds)
  const parent = segs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const near = segs[i].some((p) => segs[j].some((q) => dist(p, q) < JOIN_DISTANCE))
      if (near) parent[find(i)] = find(j)
    }
  }
  const roots = [...new Set(segs.map((_, i) => find(i)))]
  const chains: Chain[] = roots.map((r) => {
    const pts = segs.flatMap((s, i) => (find(i) === r ? s : []))
    let best: [Vec, Vec] = [pts[0], pts[1]]
    for (const p of pts) for (const q of pts) if (dist(p, q) > dist(best[0], best[1])) best = [p, q]
    return { start: best[0], end: best[1], center: mul(add(best[0], best[1]), 0.5) }
  })
  const walls = segs.map(([a, b], i) => ({ a, b, chain: roots.indexOf(find(i)) }))
  return { walls, chains }
}

function beyondChainEnd(p: Vec, c: Chain) {
  const axis = sub(c.end, c.start)
  const l = len(axis)
  if (l < 1e-6) return false
  const t = dot(sub(p, c.start), axis) / l
  return t < -0.3 || t > l + 0.3
}

export function avoidWalls(pos: Vec, target: Vec, ws: WallSet): Vec {
  let blocking: Wall | null = null
  let nearest = Infinity
  for (const w of ws.walls) {
    const d = dist(pos, closestOnSegment(pos, w.a, w.b))
    if (d > LOOKAHEAD || d >= nearest) continue
    if (segmentDistance(pos, target, w.a, w.b) >= AVOID_CLEARANCE) continue
    if (beyondChainEnd(pos, ws.chains[w.chain])) continue
    blocking = w
    nearest = d
  }
  if (!blocking) return target
  const c = ws.chains[blocking.chain]
  const end = dist(pos, c.start) + dist(c.start, target) <= dist(pos, c.end) + dist(c.end, target) ? c.start : c.end
  const out = norm(sub(end, c.center))
  return add(end, mul(len(out) > 0 ? out : norm(sub(end, pos)), AROUND_END))
}

export function pushOutOfWalls(pos: Vec, vel: Vec, ws: WallSet, radius: number): { pos: Vec; vel: Vec } {
  const minDist = DIVIDER.thickness / 2 + radius
  for (const w of ws.walls) {
    const c = closestOnSegment(pos, w.a, w.b)
    const d = dist(pos, c)
    if (d >= minDist) continue
    const along = norm(sub(w.b, w.a))
    const side = { x: -along.y, y: along.x }
    const n = d > 1e-6 ? mul(sub(pos, c), 1 / d) : dot(vel, side) > 0 ? mul(side, -1) : side
    pos = add(c, mul(n, minDist))
    const into = dot(vel, n)
    if (into < 0) vel = sub(vel, mul(n, into))
  }
  return { pos, vel }
}

export function bounceOffWalls(prev: Vec, next: Vec, vel: Vec, ws: WallSet, restitution: number): Vec | null {
  for (const w of ws.walls) {
    if (segmentDistance(prev, next, w.a, w.b) >= PUCK_CLEARANCE) continue
    const along = norm(sub(w.b, w.a))
    let n = { x: -along.y, y: along.x }
    if (dot(sub(prev, w.a), n) < 0) n = mul(n, -1)
    const into = dot(vel, n)
    if (into >= 0) continue
    return sub(vel, mul(n, (1 + restitution) * into))
  }
  return null
}

export function wallBlocks(a: Vec, b: Vec, ws: WallSet) {
  return ws.walls.some((w) => segmentDistance(a, b, w.a, w.b) < 0.3)
}
