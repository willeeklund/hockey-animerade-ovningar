import { CONFIG } from '../config'
import { clampToField, type Field } from '../model/rink'
import type { Vec } from '../model/types'
import { add, clamp, dist, dot, len, lerp, mul, norm, sub } from './vec'

const STICK = 1.6
const LOOK_AHEAD = 0.4
const MAX_SAG_DISTANCE = 3.5
const INSIDE = 0.35
const ANGLE_GAP = 0.7

export interface MarkInput {
  field: Field
  ownGoal: Vec
  ownGoalNormal: Vec
  man: Vec
  manVel: Vec
  puck: Vec | null
  manHasPuck: boolean
  self?: Vec
}

export interface MarkResult {
  pos: Vec
  face: Vec
}

export function markPosition({ field, ownGoal, ownGoalNormal, man, manVel, puck, manHasPuck, self }: MarkInput): MarkResult {
  const apart = self ? dist(self, man) : 0
  const m = add(man, mul(manVel, LOOK_AHEAD + (manHasPuck ? clamp(apart / 10, 0, 0.6) : 0)))
  const dGoal = dist(m, ownGoal)
  const toGoal = norm(sub(ownGoal, m))
  let pos: Vec
  let face: Vec

  if (manHasPuck) {
    const speed = len(manVel)
    const gap = CONFIG.markGapScale * (!self ? (dGoal > 20 ? 2 * STICK : dGoal > 8 ? 1.5 * STICK : STICK) : dGoal > 8 ? ANGLE_GAP + 0.05 * speed : ANGLE_GAP)
    pos = add(m, mul(toGoal, gap))
    const axis = { x: -ownGoalNormal.y, y: ownGoalNormal.x }
    const lat = dot(sub(m, ownGoal), axis)
    const inside = -Math.sign(lat) * clamp(Math.abs(lat) / 1.5, 0, 1)
    pos = add(pos, mul(axis, inside * INSIDE))
    face = m
  } else {
    const dPuck = puck ? dist(m, puck) : 15
    const gap = CONFIG.markGapScale * (dGoal < 6 ? 0.9 * STICK : dPuck < 10 ? 1.1 * STICK : 1.3 * STICK)
    pos = add(m, mul(toGoal, gap))
    face = m
    if (puck) {
      pos = add(pos, mul(norm(sub(puck, pos)), dPuck < 10 ? 0.6 : 0.3))
      const slot = add(ownGoal, mul(ownGoalNormal, 6))
      const sag = clamp((dPuck - 10) / 15, 0, 1) * 0.3
      pos = lerp(pos, slot, sag)
      if (dist(pos, m) > MAX_SAG_DISTANCE) pos = add(m, mul(norm(sub(pos, m)), MAX_SAG_DISTANCE))
      face = lerp(m, puck, 0.6)
    }
  }

  return { pos: clampToField(field, pos, 0.6).pos, face }
}
