import { clampToField, type Field } from '../model/rink'
import type { Vec } from '../model/types'
import { add, clamp, dist, dot, len, lerp, mul, norm, sub } from './vec'

const STICK = 1.6
const LOOK_AHEAD = 0.4
const MAX_SAG_DISTANCE = 3.5

export interface MarkInput {
  field: Field
  ownGoal: Vec
  man: Vec
  manVel: Vec
  puck: Vec | null
  manHasPuck: boolean
}

export interface MarkResult {
  pos: Vec
  face: Vec
}

export function markPosition({ field, ownGoal, man, manVel, puck, manHasPuck }: MarkInput): MarkResult {
  const m = add(man, mul(manVel, LOOK_AHEAD))
  const dGoal = dist(m, ownGoal)
  const toGoal = norm(sub(ownGoal, m))
  let pos: Vec
  let face: Vec

  if (manHasPuck) {
    const gap = dGoal > 20 ? 1.5 * STICK + 0.15 * len(manVel) : dGoal > 8 ? STICK : 0.7 * STICK
    pos = add(m, mul(toGoal, gap))
    const perp = { x: -toGoal.y, y: toGoal.x }
    const towardMiddle = Math.sign(dot(perp, { x: 0, y: -m.y }))
    pos = add(pos, mul(perp, towardMiddle * 0.4))
    face = m
  } else {
    const dPuck = puck ? dist(m, puck) : 15
    const gap = dGoal < 6 ? 0.6 * STICK : dPuck < 10 ? 0.8 * STICK : STICK
    pos = add(m, mul(toGoal, gap))
    face = m
    if (puck) {
      pos = add(pos, mul(norm(sub(puck, pos)), dPuck < 10 ? 0.6 : 0.3))
      const slot = { x: ownGoal.x - Math.sign(ownGoal.x) * 6, y: 0 }
      const sag = clamp((dPuck - 10) / 15, 0, 1) * 0.3
      pos = lerp(pos, slot, sag)
      if (dist(pos, m) > MAX_SAG_DISTANCE) pos = add(m, mul(norm(sub(pos, m)), MAX_SAG_DISTANCE))
      face = lerp(m, puck, 0.6)
    }
  }

  return { pos: clampToField(field, pos, 0.6).pos, face }
}
