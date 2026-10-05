import { attackSide, defendSide, goalCenter } from '../model/rink'
import type { Team, Vec } from '../model/types'
import { add, clamp, dist, distToSegment, lerp, mul, norm, sub } from './vec'
import { wallBlocks } from './walls'
import { hold, playerById, SPEEDS, type Intent, type PlayerRt, type PuckRt, type World } from './world'

export type BotAct = { kind: 'pass'; to: PlayerRt } | { kind: 'shoot' }

export interface BotDecision {
  intent: Intent
  act?: BotAct
}

const skaters = (w: World, team: Team) => w.players.filter((p) => p.team === team && p.role !== 'G')
const opponentsOf = (w: World, team: Team) => w.players.filter((p) => p.team !== team)

function attackGoal(w: World, team: Team) {
  return goalCenter(w.field, attackSide(team, w.scenario.settings))
}

function ownGoal(w: World, team: Team) {
  return goalCenter(w.field, defendSide(team, w.scenario.settings))
}

function arrive(p: PlayerRt, target: Vec, max: number) {
  return Math.min(max, Math.sqrt(2 * 4 * dist(p.pos, target)) + 0.3)
}

export function laneOpen(a: Vec, b: Vec, blockers: PlayerRt[], margin: number) {
  return blockers.every((o) => distToSegment(o.pos, a, b) > margin)
}

function nearestDist(pos: Vec, others: PlayerRt[]) {
  let d = Infinity
  for (const o of others) d = Math.min(d, dist(pos, o.pos))
  return d
}

export function focusPuck(w: World, p: PlayerRt): PuckRt | undefined {
  const live = w.pucks.filter((k) => !k.inGoal)
  const mine = live.find((k) => k.carrierId === p.id)
  if (mine) return mine
  let best: PuckRt | undefined
  let bestD = Infinity
  for (const k of live) {
    const d = dist(p.pos, k.pos) - (k.carrierId ? 0 : 0.01)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

export function goalieIntent(w: World, p: PlayerRt, puck: Vec | undefined): Intent {
  const g = ownGoal(w, p.team)
  const inward = -Math.sign(g.x)
  if (!puck) return { target: { x: g.x + inward * 0.8, y: 0 }, speed: 3, face: { x: 0, y: 0 } }
  const dir = norm(sub(puck, g))
  const dx = Math.max(0.35, dir.x * inward)
  const fixed = norm({ x: dx * inward, y: dir.y })
  const depth = clamp(dist(puck, g) * 0.08, 0.6, 1.3)
  return { target: add(g, mul(fixed, depth)), speed: 4, face: puck }
}

function carrierDecision(w: World, p: PlayerRt): BotDecision {
  const goal = attackGoal(w, p.team)
  const dirX = Math.sign(goal.x)
  const opps = opponentsOf(w, p.team).filter((o) => o.role !== 'G')
  const mates = skaters(w, p.team).filter((q) => q.id !== p.id)
  const held = w.t - p.holdSince
  const canAct = held > 0.5 && w.t - p.lastDecision > 0.3
  const dGoal = dist(p.pos, goal)
  const depthToLine = (goal.x - p.pos.x) * dirX

  if (canAct && depthToLine > 0.8) {
    const angleOk = Math.abs(p.pos.y) < depthToLine * 1.6 + 1
    if (angleOk && (dGoal < 7 || (dGoal < Math.min(14, w.field.goalLineX * 0.7) && laneOpen(p.pos, goal, opps, 1.0))) && !wallBlocks(p.pos, goal, w.walls)) {
      return { intent: { target: goal, speed: SPEEDS.normal }, act: { kind: 'shoot' } }
    }
  }

  const value = (pos: Vec) => -dist(pos, goal) + Math.min(4, nearestDist(pos, opps)) * 1.5
  if (canAct && mates.length > 0) {
    const mine = value(p.pos)
    const pressured = nearestDist(p.pos, opps) < 1.7
    let best: PlayerRt | undefined
    let bestScore = -Infinity
    for (const q of mates) {
      const d = dist(p.pos, q.pos)
      if (d < 3 || d > 28) continue
      if (!laneOpen(p.pos, q.pos, opps, 1.6) || wallBlocks(p.pos, q.pos, w.walls)) continue
      const s = value(q.pos)
      if (s > bestScore) {
        bestScore = s
        best = q
      }
    }
    if (best && (bestScore > mine + 4 || (pressured && bestScore > mine - 2))) {
      return { intent: hold(p), act: { kind: 'pass', to: best } }
    }
  }

  let target: Vec
  if (depthToLine > 6) {
    target = { x: goal.x - dirX * 5.5, y: p.pos.y * (dGoal > 15 ? 0.6 : 0.3) }
    const ahead = opps
      .filter((o) => (o.pos.x - p.pos.x) * dirX > -0.5 && dist(o.pos, p.pos) < 5)
      .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]
    if (ahead) {
      const side = p.pos.y >= ahead.pos.y ? 1 : -1
      target = { x: p.pos.x + dirX * 4, y: clamp(ahead.pos.y + side * 3.5, -w.field.halfWidth * 0.8, w.field.halfWidth * 0.8) }
    }
  } else {
    target = { x: goal.x - dirX * 7, y: p.pos.y > 0 ? 3 : -3 }
  }
  return { intent: { target, speed: SPEEDS.fast * 0.92 } }
}

function supportIntent(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null): Intent {
  const goal = attackGoal(w, p.team)
  const dirX = Math.sign(goal.x)
  const mates = skaters(w, p.team).filter((q) => q.id !== carrierId)
  const fs = mates.filter((q) => q.role === 'F')
  const ds = mates.filter((q) => q.role === 'D')
  let target: Vec

  if (p.role === 'D') {
    const sorted = [...ds].sort((a, b) => a.pos.y - b.pos.y || a.id.localeCompare(b.id))
    const i = sorted.findIndex((q) => q.id === p.id)
    const wide = w.field.halfWidth * 0.47
    const y = sorted.length === 1 ? (carrierPos.y > 0 ? -4 : 4) : i === 0 ? -wide : wide
    let x = carrierPos.x - dirX * 9
    const blue = w.field.blueLineX
    if (blue !== null) {
      const offBlue = dirX * (blue + 1.5)
      if ((carrierPos.x - offBlue) * dirX > 0) x = dirX > 0 ? Math.max(x, offBlue) : Math.min(x, offBlue)
    } else {
      x = clamp(x, -(w.field.goalLineX - 3), w.field.goalLineX - 3)
    }
    target = { x, y }
  } else {
    const nearGoal = Math.abs(carrierPos.x - goal.x) < Math.min(13, w.field.goalLineX * 0.6)
    if (nearGoal) {
      const spots: Vec[] = [
        { x: goal.x - dirX * 2.3, y: carrierPos.y > 0 ? -0.6 : 0.6 },
        { x: goal.x - dirX * 4, y: carrierPos.y > 0 ? -4 : 4 },
        { x: goal.x - dirX * 9.5, y: 0 },
      ]
      const order = [...fs].sort((a, b) => dist(a.pos, spots[0]) - dist(b.pos, spots[0]) || a.id.localeCompare(b.id))
      const i = Math.max(0, order.findIndex((q) => q.id === p.id))
      target = spots[Math.min(i, spots.length - 1)]
    } else {
      const laneW = w.field.halfWidth * 0.6
      const lanes = [-laneW, 0, laneW]
      const carrierLane = lanes.reduce((a, b) => (Math.abs(b - carrierPos.y) < Math.abs(a - carrierPos.y) ? b : a))
      const free = lanes.filter((l) => l !== carrierLane)
      const order = [...fs].sort((a, b) => a.pos.y - b.pos.y || a.id.localeCompare(b.id))
      const i = Math.max(0, order.findIndex((q) => q.id === p.id))
      const lane = order.length === 1 ? free.reduce((a, b) => (Math.abs(b - p.pos.y) < Math.abs(a - p.pos.y) ? b : a)) : free[Math.min(i, free.length - 1)]
      const x = clamp(carrierPos.x + dirX * 3, -(w.field.goalLineX - 5), w.field.goalLineX - 5)
      target = { x, y: lane }
    }
  }
  return { target, speed: arrive(p, target, SPEEDS.fast * 0.9), face: carrierPos }
}

function defendIntent(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null): Intent {
  const own = ownGoal(w, p.team)
  const inward = -Math.sign(own.x)
  const defenders = skaters(w, p.team)
  const presser = [...defenders].sort((a, b) => dist(a.pos, carrierPos) - dist(b.pos, carrierPos) || a.id.localeCompare(b.id))[0]

  if (presser?.id === p.id) {
    const gap = clamp(dist(carrierPos, own) * 0.12, 1.6, 4)
    const target = add(carrierPos, mul(norm(sub(own, carrierPos)), gap))
    return { target, speed: SPEEDS.fast, face: carrierPos }
  }

  const attackers = skaters(w, p.team === 'home' ? 'away' : 'home')
    .filter((a) => a.id !== carrierId)
    .sort((a, b) => dist(a.pos, own) - dist(b.pos, own) || a.id.localeCompare(b.id))
  const free = defenders.filter((d) => d.id !== presser?.id)
  const assigned = new Map<string, PlayerRt>()
  for (const a of attackers) {
    let best: PlayerRt | undefined
    let bestD = Infinity
    for (const d of free) {
      if (assigned.has(d.id)) continue
      const dd = dist(d.pos, a.pos)
      if (dd < bestD) {
        bestD = dd
        best = d
      }
    }
    if (best) assigned.set(best.id, a)
  }
  const slot = { x: own.x + inward * 5, y: 0 }
  const mark = assigned.get(p.id)
  if (mark) {
    const goalSide = add(mark.pos, mul(norm(sub(own, mark.pos)), 1.8))
    const target = lerp(goalSide, slot, 0.2)
    return { target, speed: arrive(p, target, SPEEDS.fast), face: carrierPos }
  }
  return { target: slot, speed: arrive(p, slot, SPEEDS.normal), face: carrierPos }
}

export function botDecision(w: World, p: PlayerRt): BotDecision {
  const puck = focusPuck(w, p)
  if (p.role === 'G') {
    const intent = goalieIntent(w, p, puck?.pos)
    if (puck?.carrierId === p.id && w.t - p.holdSince > 1.5) {
      const mate = skaters(w, p.team).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]
      if (mate) return { intent, act: { kind: 'pass', to: mate } }
    }
    return { intent }
  }
  if (!puck) return { intent: hold(p) }

  const carrier = playerById(w, puck.carrierId)
  if (carrier?.id === p.id) return carrierDecision(w, p)
  if (carrier) {
    return {
      intent: carrier.team === p.team ? supportIntent(w, p, carrier.pos, carrier.id) : defendIntent(w, p, carrier.pos, carrier.id),
    }
  }

  const chaser = skaters(w, p.team).sort((a, b) => dist(a.pos, puck.pos) - dist(b.pos, puck.pos) || a.id.localeCompare(b.id))[0]
  if (chaser?.id === p.id && !(puck.intended && playerById(w, puck.intended)?.team === p.team && puck.intended !== p.id)) {
    return { intent: { target: add(puck.pos, mul(puck.vel, 0.3)), speed: SPEEDS.fast, face: puck.pos } }
  }
  if (puck.intended === p.id) {
    return { intent: { target: add(puck.pos, mul(puck.vel, 0.3)), speed: SPEEDS.normal, face: puck.pos } }
  }
  if (puck.lastTeam === p.team) return { intent: supportIntent(w, p, puck.pos, null) }
  return { intent: defendIntent(w, p, puck.pos, null) }
}
