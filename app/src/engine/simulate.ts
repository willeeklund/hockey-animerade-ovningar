import { clampToField, fieldOf, goalNormal, goalsOf, nearestGoal, RINK } from '../model/rink'
import type { Action, Frame, Round, Scenario, SimEvent } from '../model/types'
import { attackGoalRef, botDecision, markIntent, focusPuck, goalieIntent, guardGoal, keepAway, type BotAct, type GoalRef } from './ai'
import { detectOffside, keepOnside } from './offside'
import { avoidWalls, bounceOffWalls, buildWalls } from './walls'
import { avoidCones, separate, stepPlayer } from './kinematics'
import { pathInfo, pointAt, project } from './path'
import { add, dist, distToSegment, dot, fromAngle, len, mul, mulberry32, norm, sub } from './vec'
import {
  benched,
  DT,
  hold,
  PASS_SPEED,
  playerById,
  puckCarriedBy,
  SHOT_SPEED,
  SPEEDS,
  STICK_REACH,
  type Intent,
  type PlayerRt,
  type PuckRt,
  type World,
} from './world'

export interface SimResult {
  frames: Frame[]
  events: SimEvent[]
  dt: number
  duration: number
}

const PUCK_FRICTION = 0.9
const PUCK_RESTITUTION = 0.6
const PICKUP_RADIUS = 1.0
const INTERCEPT_RADIUS = 0.65
const RECEIVER_RADIUS = 1.4
const POKE_REACH = 2.6
const POKE_SURE = 1.2
const CORNER_ACCEL = 7
const POKE_INTERVAL = 0.4
const POKE_FORWARD = 0.3
const POKE_BACKWARD = 0.6

function stickPos(p: PlayerRt) {
  return add(p.pos, fromAngle(p.heading, STICK_REACH))
}

function scriptedIds(s: Scenario) {
  return new Set([...s.actions, ...(s.rounds ?? []).flatMap((r) => r.actions)].map((a) => a.playerId))
}

function initialCarriers(s: Scenario): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  const scripted = scriptedIds(s)
  for (const k of s.pucks) {
    if (k.spare) continue
    let best: string | null = null
    let bestD = 1.6
    for (const p of s.players.filter((q) => !q.idle || scripted.has(q.id))) {
      if (taken.has(p.id)) continue
      const d = dist(p.pos, k.pos)
      if (d < bestD) {
        bestD = d
        best = p.id
      }
    }
    if (best) {
      out.set(k.id, best)
      taken.add(best)
    }
  }
  return out
}

export function createWorld(s: Scenario): World {
  const scripted = scriptedIds(s)
  const players: PlayerRt[] = s.players.filter((p) => !p.idle || scripted.has(p.id)).map((p) => ({
    id: p.id,
    team: p.team,
    role: p.role,
    pos: { ...p.pos },
    vel: { x: 0, y: 0 },
    heading: p.heading,
    actions: s.actions.filter((a) => a.playerId === p.id),
    idx: 0,
    idxStart: 0,
    pathS: 0,
    holdSince: 0,
    lastDecision: -1,
    lastPoke: -1,
    backward: false,
    queue: !!p.idle,
  }))
  const carriers = initialCarriers(s)
  const pucks: PuckRt[] = s.pucks.map((k) => {
    const c = carriers.get(k.id) ?? null
    const carrier = players.find((p) => p.id === c)
    return {
      id: k.id,
      pos: carrier ? stickPos(carrier) : { ...k.pos },
      vel: { x: 0, y: 0 },
      carrierId: c,
      noPickup: {},
      intended: null,
      inGoal: false,
      lastTeam: carrier?.team ?? null,
      scripted: false,
      wasInZone: {},
      spare: !!k.spare,
    }
  })
  return { t: 0, players, roster: players, pucks, pool: pucks, cones: (s.cones ?? []).map((c) => ({ ...c.pos })), walls: buildWalls(s.dividers ?? []), goals: goalsOf(s), rng: mulberry32(s.settings.seed), events: [], scenario: s, field: fieldOf(s.settings) }
}

function doPass(w: World, p: PlayerRt, puck: PuckRt, to: PlayerRt, scripted = false) {
  const from = stickPos(p)
  let aim = to.pos
  for (let i = 0; i < 3; i++) {
    const t = (dist(from, aim) / PASS_SPEED) * 1.08
    aim = add(to.pos, mul(to.vel, t))
  }
  aim = clampToField(w.field, aim, 1).pos
  puck.carrierId = null
  puck.pos = from
  puck.vel = mul(norm(sub(aim, from)), PASS_SPEED)
  puck.noPickup = { [p.id]: w.t + 0.5 }
  for (const o of w.players) if (o.team !== p.team) puck.noPickup[o.id] = w.t + 0.15
  puck.intended = to.id
  puck.scripted = scripted
  puck.lastTeam = p.team
  p.lastDecision = w.t
  w.events.push({ t: w.t, kind: 'pass', playerId: p.id })
}

function doShot(w: World, p: PlayerRt, puck: PuckRt, g: GoalRef, scripted = false) {
  const from = stickPos(p)
  const goalie = w.players.find((q) => q.role === 'G' && guardGoal(w, q) === g.goal)
  const gLat = goalie ? dot(sub(goalie.pos, g.pos), g.perp) : 0
  const tLat = (gLat > 0 ? -1 : 1) * (0.55 + w.rng() * 0.25)
  const target = add(g.pos, add(mul(g.n, -0.5), mul(g.perp, tLat)))
  puck.carrierId = null
  puck.pos = from
  puck.vel = mul(norm(sub(target, from)), SHOT_SPEED)
  puck.noPickup = { [p.id]: w.t + 0.6 }
  puck.intended = null
  puck.scripted = scripted
  puck.lastTeam = p.team
  p.lastDecision = w.t
  w.events.push({ t: w.t, kind: 'shot', playerId: p.id })
}

function teamHasPuck(w: World, team: PlayerRt['team']) {
  return w.pucks.some((k) => k.carrierId !== null && playerById(w, k.carrierId)?.team === team)
}

function nextKind(p: PlayerRt) {
  return p.actions[p.idx + 1]?.kind
}

function advance(w: World, p: PlayerRt) {
  p.idx++
  p.idxStart = w.t
  p.pathS = 0
}

function cornerSpeed(info: ReturnType<typeof pathInfo>, s: number) {
  const dirAt = (at: number) => norm(sub(pointAt(info, Math.min(info.total, at + 0.5)), pointAt(info, at)))
  const d0 = dirAt(s)
  let limit = Infinity
  for (const ahead of [1, 2, 3]) {
    if (s + ahead + 0.5 > info.total) break
    const turn = Math.acos(Math.max(-1, Math.min(1, dot(d0, dirAt(s + ahead)))))
    if (turn > 0.05) limit = Math.min(limit, Math.sqrt(CORNER_ACCEL * (ahead / turn)) + 0.3)
  }
  return limit
}

function awaitingPass(w: World, p: PlayerRt) {
  if (w.pucks.some((k) => k.intended === p.id && k.carrierId === null && !k.inGoal)) return true
  return w.roster.some((q) => q.team === p.team && q.actions.slice(q.idx).some((a) => a.kind === 'pass' && a.toPlayerId === p.id))
}

function receive(w: World, p: PlayerRt): Intent | null {
  const incoming = w.pucks.find((k) => k.intended === p.id && k.carrierId === null && !k.inGoal && len(k.vel) > 2)
  if (!incoming) return null
  const dir = norm(incoming.vel)
  const ahead = Math.max(0, dot(sub(p.pos, incoming.pos), dir))
  const meet = add(incoming.pos, mul(dir, ahead))
  return dist(meet, p.pos) > 0.5 ? { target: meet, speed: SPEEDS.normal, face: incoming.pos, scripted: true } : null
}

const playing = (p: PlayerRt) => p.actions[p.idx]?.kind === 'play'

function scriptIntent(w: World, p: PlayerRt): Intent | null {
  for (let guard = 0; guard < 20 && p.idx < p.actions.length; guard++) {
    const a: Action = p.actions[p.idx]
    if (a.kind === 'wait') {
      if (w.t - p.idxStart >= a.seconds || (a.untilPuck && puckCarriedBy(w, p.id))) {
        advance(w, p)
        continue
      }
      if (a.untilPuck) return receive(w, p) ?? hold(p, focusPuck(w, p)?.pos)
      return hold(p, focusPuck(w, p)?.pos)
    }
    if (a.kind === 'play') {
      if (w.t - p.idxStart >= a.seconds) {
        advance(w, p)
        continue
      }
      return null
    }
    if (a.kind === 'drop') {
      const k = w.pool.find((q) => q.carrierId === p.id)
      if (k) {
        k.carrierId = null
        k.vel = { x: 0, y: 0 }
        k.intended = null
        k.spare = true
      }
      advance(w, p)
      continue
    }
    if (a.kind === 'skate') {
      const info = pathInfo(a.path)
      p.pathS = project(info, p.pos, p.pathS, p.pathS + 1)
      if (dist(p.pos, pointAt(info, Math.min(info.total, p.pathS + 1.6))) < 0.8) p.pathS = Math.min(info.total, p.pathS + 0.8)
      const end = a.path[a.path.length - 1]
      const dEnd = dist(p.pos, end)
      const remaining = Math.max(info.total - p.pathS, dEnd)
      if (remaining < 0.6 && dEnd < 0.9) {
        advance(w, p)
        continue
      }
      const target = pointAt(info, Math.min(info.total, p.pathS + 1.6))
      let speed = Math.min(SPEEDS[a.speed] * (puckCarriedBy(w, p.id) ? 0.93 : 1), cornerSpeed(info, p.pathS))
      const nk = nextKind(p)
      const flowsOn = nk === 'skate' || nk === 'pass' || nk === 'shoot' || nk === 'mark' || (!nk && w.scenario.settings.autonomous)
      if (!flowsOn) speed = Math.min(speed, Math.sqrt(2 * 4.5 * remaining) + 0.4)
      return { target, speed, scripted: true }
    }
    if (a.kind === 'mark') {
      const man = playerById(w, a.targetId)
      if (!man) {
        advance(w, p)
        continue
      }
      if (teamHasPuck(w, p.team)) return null
      return { ...markIntent(w, p, man), scripted: true }
    }
    const puck = puckCarriedBy(w, p.id)
    if (puck) {
      if (a.kind === 'pass') {
        const to = w.roster.find((q) => q.id === a.toPlayerId)
        if (to && benched(to)) return hold(p, to.pos)
        if (to) doPass(w, p, puck, to, true)
      } else {
        const goal = (a.goalId && w.goals.find((g) => g.id === a.goalId)) || nearestGoal(w.goals, p.pos, a.goal)
        if (goal) doShot(w, p, puck, { pos: goal.pos, n: goalNormal(goal), perp: { x: -goalNormal(goal).y, y: goalNormal(goal).x }, goal }, true)
      }
      advance(w, p)
      continue
    }
    const meet = receive(w, p)
    if (meet) return meet
    if (!awaitingPass(w, p) && w.t - p.idxStart > 4) {
      advance(w, p)
      continue
    }
    if (w.scenario.settings.autonomous && !p.queue && p.role !== 'C') return botDecision(w, p).intent
    const loose = focusPuck(w, p)
    return hold(p, loose?.pos)
  }
  return null
}

function applyAct(w: World, p: PlayerRt, act: BotAct | undefined) {
  if (!act) return
  const puck = puckCarriedBy(w, p.id)
  if (!puck) return
  if (act.kind === 'pass') doPass(w, p, puck, act.to)
  else if (!keepAway(w, p.team)) doShot(w, p, puck, attackGoalRef(w, p.team, p.pos))
}

function playerIntent(w: World, p: PlayerRt): Intent {
  const scripted = scriptIntent(w, p)
  if (scripted) return scripted
  if (p.role === 'C') return hold(p, focusPuck(w, p)?.pos)
  if (w.scenario.settings.autonomous || playing(p)) {
    const d = botDecision(w, p)
    applyAct(w, p, d.act)
    return d.intent
  }
  if (p.role === 'G' && p.actions.length === 0) return goalieIntent(w, p, focusPuck(w, p)?.pos)
  return hold(p)
}

function takePuck(w: World, puck: PuckRt, p: PlayerRt, kind: 'pickup' | 'steal' | 'save') {
  puck.carrierId = p.id
  puck.vel = { x: 0, y: 0 }
  puck.intended = null
  puck.scripted = false
  puck.lastTeam = p.team
  p.holdSince = w.t
  w.events.push({ t: w.t, kind, playerId: p.id })
}

function stepPuck(w: World, puck: PuckRt) {
  if (puck.inGoal) return
  const carrier = w.roster.find((p) => p.id === puck.carrierId)
  if (carrier) {
    puck.pos = stickPos(carrier)
    puck.vel = { ...carrier.vel }
    return
  }

  const prev = puck.pos
  const speed = len(puck.vel)
  if (puck.intended && speed < 1.5) {
    puck.intended = null
    puck.scripted = false
  }
  if (speed > 0) {
    const ns = Math.max(0, speed - PUCK_FRICTION * DT)
    puck.vel = mul(puck.vel, ns / speed)
  }
  let next = add(prev, mul(puck.vel, DT))

  for (const g of w.goals) {
    const n = goalNormal(g)
    const perp = { x: -n.y, y: n.x }
    const dPrev = dot(sub(prev, g.pos), n)
    const dNext = dot(sub(next, g.pos), n)
    if (dPrev > 0 && dNext <= 0) {
      const cross = add(prev, mul(sub(next, prev), dPrev / (dPrev - dNext)))
      if (Math.abs(dot(sub(cross, g.pos), perp)) < RINK.goalHalfWidth) {
        puck.pos = add(cross, mul(n, -0.6))
        puck.vel = { x: 0, y: 0 }
        puck.inGoal = true
        w.events.push({ t: w.t, kind: 'goal' })
        return
      }
    }
    if (dPrev < -RINK.goalDepth && dNext >= -RINK.goalDepth && Math.abs(dot(sub(next, g.pos), perp)) < RINK.goalHalfWidth + 0.1) {
      puck.vel = sub(puck.vel, mul(n, 1.5 * dot(puck.vel, n)))
      next = prev
    }
  }

  const bounced = bounceOffWalls(prev, next, puck.vel, w.walls, PUCK_RESTITUTION)
  if (bounced) {
    puck.vel = bounced
    next = prev
  }

  const c = clampToField(w.field, next, 0.1)
  if (c.normal) {
    const into = dot(puck.vel, c.normal)
    if (into > 0) puck.vel = sub(puck.vel, mul(c.normal, (1 + PUCK_RESTITUTION) * into))
    next = c.pos
  }
  puck.pos = next

  const fast = len(puck.vel) > 20
  let best: PlayerRt | null = null
  let bestD = Infinity
  for (const p of w.players) {
    if ((puck.noPickup[p.id] ?? -1) > w.t) continue
    if (puckCarriedBy(w, p.id)) continue
    const d = distToSegment(p.pos, prev, puck.pos)
    if (p.role === 'G') {
      if (d < 0.72 && d < bestD) {
        best = p
        bestD = d
      }
      continue
    }
    if (fast) continue
    if (p.role === 'C' && puck.intended !== p.id) continue
    if (puck.scripted && puck.intended && puck.intended !== p.id) continue
    const route = p.actions[p.idx]
    if (route?.kind === 'skate' && puck.intended !== p.id && dist(route.path[route.path.length - 1], puck.pos) > 2.5) continue
    const r = puck.intended === p.id ? RECEIVER_RADIUS : puck.intended ? INTERCEPT_RADIUS : PICKUP_RADIUS
    if (d < r && d < bestD) {
      best = p
      bestD = d
    }
  }
  if (!best) return
  if (best.role === 'G' && len(puck.vel) > 8) {
    if (w.rng() < 0.5) {
      takePuck(w, puck, best, 'save')
    } else {
      const inward = -Math.sign(best.pos.x)
      const ang = (w.rng() - 0.5) * 2.2
      const dir = norm({ x: inward * Math.cos(ang), y: Math.sin(ang) })
      puck.vel = mul(dir, 5 + w.rng() * 3)
      puck.noPickup = { [best.id]: w.t + 0.8 }
      puck.intended = null
      w.events.push({ t: w.t, kind: 'rebound', playerId: best.id })
    }
    return
  }
  takePuck(w, puck, best, 'pickup')
}

function collectSpare(w: World, puck: PuckRt, all: PuckRt[]) {
  for (const p of w.players) {
    const a = p.actions[p.idx]
    if (all.some((k) => k.carrierId === p.id) || dist(p.pos, puck.pos) > (p.role === 'C' ? 1.6 : 1.3)) continue
    if (p.role === 'C' && a?.kind === 'pass') {
      puck.spare = false
      takePuck(w, puck, p, 'pickup')
      return
    }
    if (!(a?.kind === 'skate' && [a, p.actions[p.idx - 1]].some((b) => b?.kind === 'skate' && dist(b.path[b.path.length - 1], puck.pos) < 1.5))) continue
    puck.spare = false
    takePuck(w, puck, p, 'pickup')
    return
  }
}

function canPoke(w: World, p: PlayerRt) {
  const a = p.actions[p.idx]
  if (a?.kind === 'mark' || a?.kind === 'play') return true
  return !a && w.scenario.settings.autonomous
}

function pokeChecks(w: World) {
  for (const puck of w.pucks) {
    const carrier = playerById(w, puck.carrierId)
    if (!carrier || carrier.role === 'G' || carrier.role === 'C' || w.t - carrier.holdSince < 0.4) continue
    if (carrier.idx < carrier.actions.length && !playing(carrier)) continue
    for (const o of w.players) {
      if (o.team === carrier.team || o.role === 'G' || o.role === 'C' || puckCarriedBy(w, o.id) || !canPoke(w, o)) continue
      if (w.t - o.lastPoke < POKE_INTERVAL) continue
      const d = dist(o.pos, puck.pos)
      if (d > POKE_REACH) continue
      const facing = dot(fromAngle(o.heading), norm(sub(puck.pos, o.pos)))
      if (facing < 0) continue
      o.lastPoke = w.t
      if (w.rng() >= (o.backward ? POKE_BACKWARD : POKE_FORWARD) * Math.min(1, (POKE_REACH - d) / (POKE_REACH - POKE_SURE)) * (0.5 + 0.5 * facing)) continue
      const dir = norm(sub(puck.pos, o.pos))
      const ang = (w.rng() - 0.5) * 1.6
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      puck.carrierId = null
      puck.vel = mul({ x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c }, 4 + w.rng() * 3)
      puck.noPickup = { [carrier.id]: w.t + 0.5, [o.id]: w.t + 0.15 }
      puck.intended = null
      puck.scripted = false
      puck.lastTeam = o.team
      carrier.lastDecision = w.t
      w.events.push({ t: w.t, kind: 'steal', playerId: o.id })
      break
    }
  }
}

function snapshot(w: World): Frame {
  const players: Frame['players'] = {}
  for (const p of w.roster) players[p.id] = benched(p) ? { x: p.pos.x, y: p.pos.y, h: p.heading, q: 1 } : { x: p.pos.x, y: p.pos.y, h: p.heading }
  const pucks: Frame['pucks'] = {}
  for (const k of w.pucks) pucks[k.id] = k.spare || k.inGoal ? { x: k.pos.x, y: k.pos.y, c: null, s: 1 } : { x: k.pos.x, y: k.pos.y, c: k.carrierId }
  return { t: w.t, players, pucks }
}

export function step(w: World) {
  const all = w.roster
  const allPucks = w.pucks
  const parked = allPucks.filter((k) => k.carrierId && all.some((p) => p.id === k.carrierId && benched(p)))
  w.pucks = allPucks.filter((k) => !parked.includes(k) && !k.spare)
  w.players = all.filter((p) => !benched(p))
  const intents = all.map((p) => (benched(p) ? scriptIntent(w, p) ?? hold(p) : keepOnside(w, p, playerIntent(w, p))))
  all.forEach((p, i) => {
    const it = intents[i]
    const spaced = it.speed > 0 ? separate(p, w.players, it.target, it.scripted) : it.target
    const target = it.speed > 0 ? avoidWalls(p.pos, avoidCones(p, spaced, w.cones), w.walls) : spaced
    stepPlayer(p, { ...it, target }, DT, w.field, w.cones, w.walls)
  })
  w.players = all.filter((p) => !benched(p))
  for (const k of w.pucks) stepPuck(w, k)
  for (const k of allPucks) if (k.spare) collectSpare(w, k, allPucks)
  pokeChecks(w)
  for (const k of w.pucks) detectOffside(w, k, k.wasInZone)
  for (const k of parked) {
    const c = all.find((p) => p.id === k.carrierId)
    if (!c) continue
    k.pos = stickPos(c)
    k.vel = { x: 0, y: 0 }
  }
  w.players = all
  w.pucks = allPucks
  w.t += DT
}

export const frameIndex = (t: number) => Math.round(t / DT)

function startRound(w: World, round: Round) {
  if (round.homeAttacks && round.homeAttacks !== w.scenario.settings.homeAttacks) {
    w.scenario = { ...w.scenario, settings: { ...w.scenario.settings, homeAttacks: round.homeAttacks } }
    for (const k of w.pucks) k.wasInZone = {}
  }
  const actions = round.actions
  for (const p of w.roster) {
    p.actions = actions.filter((a) => a.playerId === p.id)
    p.idx = 0
    p.idxStart = w.t
    p.pathS = 0
  }
}

export function simulate(s: Scenario): SimResult {
  const w = createWorld(s)
  const frames: Frame[] = [snapshot(w)]
  const rounds = s.rounds ?? []
  const lastStart = rounds.length ? rounds[rounds.length - 1].startT : 0
  const n = frameIndex(lastStart + s.settings.durationSec)
  for (let i = 0; i < n; i++) {
    for (const r of rounds) if (frameIndex(r.startT) === i) startRound(w, r)
    step(w)
    frames.push(snapshot(w))
  }
  return { frames, events: w.events, dt: DT, duration: n * DT }
}
