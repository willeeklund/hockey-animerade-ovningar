import { add, angleOf, dist, mul, norm, sub } from '../engine/vec'
import { DIVIDER } from '../model/rink'
import type { Vec } from '../model/types'

export function layoutDividers(from: Vec, to: Vec): { pos: Vec; angle: number }[] {
  const length = dist(from, to)
  if (length < 1) return [{ pos: from, angle: Math.PI / 2 }]
  const dir = norm(sub(to, from))
  const count = Math.max(1, Math.round(length / DIVIDER.length))
  return Array.from({ length: count }, (_, i) => ({ pos: add(from, mul(dir, DIVIDER.length * (i + 0.5))), angle: angleOf(dir) }))
}
