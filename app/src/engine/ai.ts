import { attackSide, clampToField, defendSide, goalCenter, goalNormal, goalSide, nearestGoal } from '../model/rink'
import type { Goal, Side, Team, Vec } from '../model/types'
import { add, clamp, dist, distToSegment, dot, lerp, mul, norm, sub } from './vec'
import { wallBlocks } from './walls'
import { hold, playerById, SPEEDS, type Intent, type PlayerRt, type PuckRt, type World } from './world'

export type BotAct = { kind: 'pass'; to: PlayerRt } | { kind: 'shoot' }

export interface BotDecision {
  intent: Intent
  act?: BotAct
}

const skaters = (w: World, team: Team) => w.players.filter((p) => p.team === team && p.role !== 'G' && p.role !== 'C')
const opponentsOf = (w: World, team: Team) => w.players.filter((p) => p.team !== team && p.role !== 'C')

export interface GoalRef {
  pos: Vec
  n: Vec
  perp: Vec
  goal?: Goal
}

function refOf(g: Goal): GoalRef {
  const n = goalNormal(g)
  return { pos: g.pos, n, perp: { x: -n.y, y: n.x }, goal: g }
}

function virtualGoal(w: World, side: Side): GoalRef {
  const n = { x: side === 'left' ? 1 : -1, y: 0 }
  return { pos: goalCenter(w.field, side), n, perp: { x: -n.y, y: n.x } }
}

export function attackGoalRef(w: World, team: Team, from: Vec): GoalRef {
  const side = attackSide(team, w.scenario.settings)
  const g = nearestGoal(w.goals, from, side)
  return g ? refOf(g) : virtualGoal(w, side)
}

export function ownGoalRef(w: World, team: Team, near: Vec): GoalRef {
  const side = defendSide(team, w.scenario.settings)
  const g = nearestGoal(w.goals, near, side)
  return g ? refOf(g) : virtualGoal(w, side)
}

export const keepAway = (w: World, team: Team) => !w.goals.some((g) => goalSide(g) === attackSide(team, w.scenario.settings))

export const guardGoal = (w: World, p: PlayerRt) => nearestGoal(w.goals, p.pos)

const other = (team: Team): Team => (team === 'home' ? 'away' : 'home')
const depthOf = (g: GoalRef, p: Vec) => dot(sub(p, g.pos), g.n)
const latOf = (g: GoalRef, p: Vec) => dot(sub(p, g.pos), g.perp)
const local = (g: GoalRef, depth: number, lat: number) => add(g.pos, add(mul(g.n, depth), mul(g.perp, lat)))

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
  const goal = guardGoal(w, p)
  if (!goal) return hold(p, puck)
  const g = refOf(goal)
  if (!puck) return { target: add(g.pos, mul(g.n, 0.8)), speed: 3, face: add(g.pos, mul(g.n, 10)) }
  const dir = norm(sub(puck, g.pos))
  const dx = Math.max(0.35, dot(dir, g.n))
  const fixed = norm(add(mul(g.n, dx), mul(g.perp, dot(dir, g.perp))))
  const depth = clamp(dist(puck, g.pos) * 0.08, 0.6, 1.3)
  return { target: add(g.pos, mul(fixed, depth)), speed: 4, face: puck }
}

function carrierDecision(w: World, p: PlayerRt): BotDecision {
  if (keepAway(w, p.team)) return keepAwayCarrier(w, p)
  const g = attackGoalRef(w, p.team, p.pos)
  const goal = g.pos
  const opps = opponentsOf(w, p.team).filter((o) => o.role !== 'G')
  const mates = skaters(w, p.team).filter((q) => q.id !== p.id)
  const held = w.t - p.holdSince
  const canAct = held > 0.5 && w.t - p.lastDecision > 0.3
  const dGoal = dist(p.pos, goal)
  const depthToLine = depthOf(g, p.pos)
  const lat = latOf(g, p.pos)

  if (canAct && depthToLine > 0.8) {
    const angleOk = Math.abs(lat) < depthToLine * 1.6 + 1
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
    target = local(g, 5.5, lat * (dGoal > 15 ? 0.6 : 0.3))
    const ahead = opps
      .filter((o) => -dot(sub(o.pos, p.pos), g.n) > -0.5 && dist(o.pos, p.pos) < 5)
      .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]
    if (ahead) {
      const aheadLat = latOf(g, ahead.pos)
      const side = lat >= aheadLat ? 1 : -1
      target = clampToField(w.field, local(g, depthToLine - 4, aheadLat + side * 3.5), w.field.halfWidth * 0.2).pos
    }
  } else {
    target = local(g, 7, lat > 0 ? 3 : -3)
  }
  return { intent: { target, speed: SPEEDS.fast * 0.92 } }
}

function openSpot(w: World, p: PlayerRt, carrierPos: Vec | null): Vec {
  const opps = opponentsOf(w, p.team).filter((o) => o.role !== 'G')
  const mates = skaters(w, p.team).filter((q) => q.id !== p.id)
  const f = w.field
  const step = 2.5
  let best = p.pos
  let bestScore = -Infinity
  for (let x = -f.halfLength + 2; x <= f.halfLength - 2; x += step) {
    for (let y = -f.halfWidth + 2; y <= f.halfWidth - 2; y += step) {
      const c = { x, y }
      if (clampToField(f, c, 1.5).normal) continue
      let score = Math.min(8, nearestDist(c, opps)) - 0.25 * dist(c, p.pos)
      for (const q of mates) {
        const d = dist(c, q.pos)
        if (d < 5) score -= 5 - d
      }
      if (carrierPos) {
        const d = dist(c, carrierPos)
        if (d < 5) score -= (5 - d) * 1.5
        if (d > 16) score -= (d - 16) * 0.5
        if (laneOpen(carrierPos, c, opps, 1.4) && !wallBlocks(carrierPos, c, w.walls)) score += 2
      }
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
  }
  return best
}

function keepAwayCarrier(w: World, p: PlayerRt): BotDecision {
  const opps = opponentsOf(w, p.team).filter((o) => o.role !== 'G')
  const mates = skaters(w, p.team).filter((q) => q.id !== p.id)
  const canAct = w.t - p.holdSince > 0.5 && w.t - p.lastDecision > 0.3
  const space = (pos: Vec) => Math.min(6, nearestDist(pos, opps))
  if (canAct && mates.length > 0) {
    const mine = space(p.pos)
    const pressured = nearestDist(p.pos, opps) < 2.5
    let best: PlayerRt | undefined
    let bestScore = -Infinity
    for (const q of mates) {
      const d = dist(p.pos, q.pos)
      if (d < 3 || d > 16) continue
      if (!laneOpen(p.pos, q.pos, opps, 1.4) || wallBlocks(p.pos, q.pos, w.walls)) continue
      const s = space(q.pos)
      if (s > bestScore) {
        bestScore = s
        best = q
      }
    }
    if (best && (bestScore > mine + 1.5 || (pressured && bestScore > 2.5))) {
      return { intent: hold(p), act: { kind: 'pass', to: best } }
    }
  }
  const target = openSpot(w, p, null)
  return { intent: { target, speed: arrive(p, target, SPEEDS.normal) } }
}

function keepAwaySupport(w: World, p: PlayerRt, carrierPos: Vec): Intent {
  const target = openSpot(w, p, carrierPos)
  return { target, speed: arrive(p, target, SPEEDS.fast * 0.85), face: carrierPos }
}

function keepAwayDefend(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null, press: boolean): Intent {
  const defenders = skaters(w, p.team)
  const presser = press ? [...defenders].sort((a, b) => dist(a.pos, carrierPos) - dist(b.pos, carrierPos) || a.id.localeCompare(b.id))[0] : undefined
  if (presser?.id === p.id) {
    const target = add(carrierPos, mul(norm(sub(p.pos, carrierPos)), 0.6))
    return { target, speed: SPEEDS.fast, face: carrierPos }
  }
  const attackers = skaters(w, other(p.team))
    .filter((a) => a.id !== carrierId)
    .sort((a, b) => dist(a.pos, carrierPos) - dist(b.pos, carrierPos) || a.id.localeCompare(b.id))
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
  const man = assigned.get(p.id)
  const target = man ? lerp(man.pos, carrierPos, 0.3) : lerp(p.pos, carrierPos, 0.4)
  return { target, speed: arrive(p, target, SPEEDS.fast), face: carrierPos }
}

function supportFor(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null): Intent {
  return keepAway(w, p.team) ? keepAwaySupport(w, p, carrierPos) : supportIntent(w, p, carrierPos, carrierId)
}

function defendFor(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null, press = true): Intent {
  return keepAway(w, other(p.team)) ? keepAwayDefend(w, p, carrierPos, carrierId, press) : defendIntent(w, p, carrierPos, carrierId, press)
}

function supportIntent(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null): Intent {
  const g = attackGoalRef(w, p.team, carrierPos)
  const dirX = attackSide(p.team, w.scenario.settings) === 'right' ? 1 : -1
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
    }
    x = clamp(x, -(w.field.goalLineX - 3), w.field.goalLineX - 3)
    target = { x, y }
  } else {
    const nearGoal = Math.abs(depthOf(g, carrierPos)) < Math.min(13, w.field.goalLineX * 0.6)
    if (nearGoal) {
      const away = latOf(g, carrierPos) < 0 ? 1 : -1
      const spots: Vec[] = [local(g, 2.3, away * 0.6), local(g, 4, away * 4), local(g, 9.5, 0)]
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

function defendIntent(w: World, p: PlayerRt, carrierPos: Vec, carrierId: string | null, press = true): Intent {
  const g = ownGoalRef(w, p.team, carrierPos)
  const own = g.pos
  const defenders = skaters(w, p.team)
  const presser = press ? [...defenders].sort((a, b) => dist(a.pos, carrierPos) - dist(b.pos, carrierPos) || a.id.localeCompare(b.id))[0] : undefined

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
  const slot = add(own, mul(g.n, 5))
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
    const goal = guardGoal(w, p)
    if (goal && puck?.carrierId === p.id && w.t - p.holdSince > 1.5) {
      const g = refOf(goal)
      const team = defendSide('home', w.scenario.settings) === goalSide(goal) ? 'home' : 'away'
      const mate = skaters(w, team)
        .filter((q) => depthOf(g, q.pos) > 0.5)
        .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]
      if (mate) return { intent, act: { kind: 'pass', to: mate } }
    }
    return { intent }
  }
  if (!puck) return { intent: hold(p) }

  const carrier = playerById(w, puck.carrierId)
  if (carrier?.role === 'C') {
    return { intent: carrier.team === p.team ? supportFor(w, p, puck.pos, null) : defendFor(w, p, puck.pos, null, false) }
  }
  if (carrier?.id === p.id) return carrierDecision(w, p)
  if (carrier) {
    return {
      intent: carrier.team === p.team ? supportFor(w, p, carrier.pos, carrier.id) : defendFor(w, p, carrier.pos, carrier.id),
    }
  }

  const chaser = skaters(w, p.team).sort((a, b) => dist(a.pos, puck.pos) - dist(b.pos, puck.pos) || a.id.localeCompare(b.id))[0]
  if (chaser?.id === p.id && !(puck.intended && playerById(w, puck.intended)?.team === p.team && puck.intended !== p.id)) {
    return { intent: { target: add(puck.pos, mul(puck.vel, 0.3)), speed: SPEEDS.fast, face: puck.pos } }
  }
  if (puck.intended === p.id) {
    return { intent: { target: add(puck.pos, mul(puck.vel, 0.3)), speed: SPEEDS.normal, face: puck.pos } }
  }
  if (puck.lastTeam === p.team) return { intent: supportFor(w, p, puck.pos, null) }
  return { intent: defendFor(w, p, puck.pos, null) }
}
