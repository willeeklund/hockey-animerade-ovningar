import { clampToField, type Field } from '../model/rink'
import type { Vec } from '../model/types'
import { add, angleOf, dist, dot, fromAngle, len, mul, norm, sub, wrapAngle } from './vec'
import { pushOutOfWalls, type WallSet } from './walls'
import type { Intent, PlayerRt } from './world'

const ACCEL = 3.6
const DECEL = 6
const HOCKEY_STOP_DECEL = 10
const LATERAL_ACCEL = 8
const MAX_TURN_RATE = 7
const STAND_TURN_RATE = 6
const PLAYER_RADIUS = 0.45

export function separate(p: PlayerRt, others: PlayerRt[], target: Vec, sideOnly = false): Vec {
  let push = { x: 0, y: 0 }
  for (const o of others) {
    if (o.id === p.id) continue
    const d = dist(p.pos, o.pos)
    if (d < 1.4 && d > 1e-6) push = add(push, mul(norm(sub(p.pos, o.pos)), (1.4 - d) * 2.5))
  }
  if (sideOnly) {
    const ahead = norm(sub(target, p.pos))
    const side = { x: -ahead.y, y: ahead.x }
    const lateral = Math.max(-1, Math.min(1, dot(push, side)))
    return add(target, mul(side, lateral))
  }
  return add(target, push)
}

const GOALIE_ACCEL = 14
const CONE_CLEARANCE = 1.1
const CONE_MIN_DIST = 0.75
const CONE_LOOKAHEAD = 5

export function avoidCones(p: PlayerRt, target: Vec, cones: Vec[]): Vec {
  const toT = sub(target, p.pos)
  const dT = len(toT)
  if (dT < 1e-6 || cones.length === 0) return target
  const dir = mul(toT, 1 / dT)
  const perp = { x: -dir.y, y: dir.x }
  let blocking: Vec | null = null
  let nearest = Infinity
  for (const c of cones) {
    const rel = sub(c, p.pos)
    const ahead = dot(rel, dir)
    if (ahead <= 0 || ahead > Math.min(CONE_LOOKAHEAD, dT + CONE_CLEARANCE)) continue
    if (Math.abs(dot(rel, perp)) >= CONE_CLEARANCE) continue
    if (ahead < nearest) {
      nearest = ahead
      blocking = c
    }
  }
  if (!blocking) return target
  const offset = dot(sub(blocking, p.pos), perp)
  const headingSide = dot(fromAngle(p.heading), perp)
  const side = Math.abs(offset) > 0.05 ? -Math.sign(offset) : headingSide >= 0 ? 1 : -1
  return add(add(blocking, mul(perp, side * (CONE_CLEARANCE + 0.3))), mul(dir, 0.6))
}

function pushOutOfCones(p: PlayerRt, cones: Vec[]) {
  for (const c of cones) {
    const rel = sub(p.pos, c)
    const d = len(rel)
    if (d >= CONE_MIN_DIST) continue
    const n = d > 1e-6 ? mul(rel, 1 / d) : fromAngle(p.heading + Math.PI / 2)
    p.pos = add(c, mul(n, CONE_MIN_DIST))
    const into = dot(p.vel, n)
    if (into < 0) p.vel = sub(p.vel, mul(n, into))
  }
}

function turnToward(p: PlayerRt, dir: Vec | null, dt: number) {
  if (!dir || len(dir) < 1e-6) return
  const a = wrapAngle(angleOf(dir) - p.heading)
  const m = STAND_TURN_RATE * dt
  p.heading = wrapAngle(p.heading + Math.max(-m, Math.min(m, a)))
}

function stepGoalie(p: PlayerRt, intent: Intent, dt: number, field: Field, cones: Vec[], walls?: WallSet) {
  const toT = sub(intent.target, p.pos)
  const d = len(toT)
  const speed = Math.min(intent.speed, Math.sqrt(2 * GOALIE_ACCEL * 0.5 * d))
  const want = d > 0.05 ? mul(toT, speed / d) : { x: 0, y: 0 }
  const dv = sub(want, p.vel)
  const maxDv = GOALIE_ACCEL * dt
  p.vel = len(dv) > maxDv ? add(p.vel, mul(norm(dv), maxDv)) : want
  p.pos = clampToField(field, add(p.pos, mul(p.vel, dt)), PLAYER_RADIUS).pos
  pushOutOfCones(p, cones)
  if (walls) Object.assign(p, pushOutOfWalls(p.pos, p.vel, walls, PLAYER_RADIUS))
  turnToward(p, intent.face ? sub(intent.face, p.pos) : null, dt)
}

export function stepPlayer(p: PlayerRt, intent: Intent, dt: number, field: Field, cones: Vec[] = [], walls?: WallSet) {
  if (p.role === 'G') return stepGoalie(p, intent, dt, field, cones, walls)
  const toT = sub(intent.target, p.pos)
  const d = len(toT)
  let desired = d < 0.15 ? 0 : intent.speed
  const speed = len(p.vel)
  const curDir = speed > 0.1 ? mul(p.vel, 1 / speed) : fromAngle(p.heading)
  const wantDir = d > 1e-6 ? mul(toT, 1 / d) : curDir
  const angle = wrapAngle(angleOf(wantDir) - angleOf(curDir))

  let newSpeed = speed
  let newDir = curDir
  if (speed > 2.5 && Math.abs(angle) > 2.0) {
    newSpeed = Math.max(0, speed - HOCKEY_STOP_DECEL * dt)
  } else {
    if (Math.abs(angle) > 0.7) desired = Math.min(desired, 4.5)
    const maxTurn = Math.min(MAX_TURN_RATE, LATERAL_ACCEL / Math.max(speed, 0.5)) * dt
    const turn = Math.max(-maxTurn, Math.min(maxTurn, angle))
    newDir = fromAngle(angleOf(curDir) + turn)
    if (desired > speed) newSpeed = Math.min(desired, speed + ACCEL * (1 - speed / 12) * dt)
    else newSpeed = Math.max(desired, speed - DECEL * dt)
  }

  p.vel = mul(newDir, newSpeed)
  const moved = clampToField(field, add(p.pos, mul(p.vel, dt)), PLAYER_RADIUS)
  p.pos = moved.pos
  if (moved.normal) {
    const into = dot(p.vel, moved.normal)
    if (into > 0) p.vel = sub(p.vel, mul(moved.normal, into))
  }
  pushOutOfCones(p, cones)
  if (walls) Object.assign(p, pushOutOfWalls(p.pos, p.vel, walls, PLAYER_RADIUS))

  if (newSpeed > 0.6) {
    p.heading = angleOf(newDir)
  } else {
    turnToward(p, intent.face ? sub(intent.face, p.pos) : d > 0.3 ? toT : null, dt)
  }
}
