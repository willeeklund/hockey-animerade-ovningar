import type { Vec } from '../model/types'
import { add, clamp, dist, dot, len, lerp, mul, norm, sub } from './vec'

export interface PathInfo {
  pts: Vec[]
  cum: number[]
  total: number
}

const cache = new WeakMap<Vec[], PathInfo>()

export function pathInfo(pts: Vec[]): PathInfo {
  let info = cache.get(pts)
  if (!info) {
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
    info = { pts, cum, total: cum[cum.length - 1] }
    cache.set(pts, info)
  }
  return info
}

export function pointAt(info: PathInfo, s: number): Vec {
  const { pts, cum, total } = info
  if (pts.length === 1 || s <= 0) return pts[0]
  if (s >= total) return pts[pts.length - 1]
  let i = 1
  while (cum[i] < s) i++
  const segLen = cum[i] - cum[i - 1]
  return lerp(pts[i - 1], pts[i], segLen > 0 ? (s - cum[i - 1]) / segLen : 0)
}

export function project(info: PathInfo, p: Vec, sMin: number, sMax: number): number {
  const { pts, cum } = info
  let best = sMin
  let bestD = Infinity
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] < sMin || cum[i - 1] > sMax) continue
    const a = pts[i - 1]
    const ab = sub(pts[i], a)
    const l2 = dot(ab, ab)
    const t = l2 > 0 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0
    const s = clamp(cum[i - 1] + t * Math.sqrt(l2), sMin, sMax)
    const d = dist(p, pointAt(info, s))
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

function perpDist(p: Vec, a: Vec, b: Vec) {
  const ab = sub(b, a)
  const l = len(ab)
  if (l < 1e-9) return dist(p, a)
  return Math.abs(ab.x * (a.y - p.y) - ab.y * (a.x - p.x)) / l
}

export function simplify(pts: Vec[], eps: number): Vec[] {
  if (pts.length < 3) return pts
  let maxD = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]]
  const left = simplify(pts.slice(0, idx + 1), eps)
  const right = simplify(pts.slice(idx), eps)
  return [...left.slice(0, -1), ...right]
}

export function chaikin(pts: Vec[], iterations: number): Vec[] {
  let out = pts
  for (let k = 0; k < iterations; k++) {
    if (out.length < 3) return out
    const next: Vec[] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      next.push(lerp(out[i], out[i + 1], 0.25), lerp(out[i], out[i + 1], 0.75))
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out
}

export function wavy(pts: Vec[], amplitude = 0.3, wavelength = 1.4, step = 0.2): Vec[] {
  const info = pathInfo(pts)
  if (info.total < 0.5) return pts
  const out: Vec[] = []
  for (let s = 0; s <= info.total; s += step) {
    const p = pointAt(info, s)
    const ahead = pointAt(info, Math.min(info.total, s + 0.1))
    const behind = pointAt(info, Math.max(0, s - 0.1))
    const t = norm(sub(ahead, behind))
    const n = { x: -t.y, y: t.x }
    const fade = Math.min(1, s / 0.6, (info.total - s) / 0.6)
    out.push(add(p, mul(n, Math.sin((s / wavelength) * Math.PI * 2) * amplitude * fade)))
  }
  out.push(pts[pts.length - 1])
  return out
}
