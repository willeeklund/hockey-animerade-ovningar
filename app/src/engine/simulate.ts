import { attackSide, clampToRink, defendSide, goalCenter, RINK } from '../model/rink'
import type { Action, Frame, Scenario, SimEvent } from '../model/types'
import { botDecision, goalieIntent, focusPuck, type BotAct } from './ai'
import { separate, stepPlayer } from './kinematics'
import { pathInfo, pointAt, project } from './path'
import { add, dist, distToSegment, dot, fromAngle, len, mul, mulberry32, norm, sub } from './vec'
import {
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

function stickPos(p: PlayerRt) {
  return add(p.pos, fromAngle(p.heading, STICK_REACH))
}

function initialCarriers(s: Scenario): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  for (const k of s.pucks) {
    let best: string | null = null
    let bestD = 1.6
    for (const p of s.players) {
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
  const players: PlayerRt[] = s.players.map((p) => ({
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
    }
  })
  return { t: 0, players, pucks, rng: mulberry32(s.settings.seed), events: [], scenario: s }
}

function doPass(w: World, p: PlayerRt, puck: PuckRt, to: PlayerRt, scripted = false) {
  const from = stickPos(p)
  let aim = to.pos
  for (let i = 0; i < 3; i++) {
    const t = (dist(from, aim) / PASS_SPEED) * 1.08
    aim = add(to.pos, mul(to.vel, t))
  }
  aim = clampToRink(aim, 1).pos
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

function doShot(w: World, p: PlayerRt, puck: PuckRt, side: 'left' | 'right', scripted = false) {
  const from = stickPos(p)
  const g = goalCenter(side)
  const goalie = w.players.find((q) => q.role === 'G' && defendSide(q.team, w.scenario.settings) === side)
  const gy = goalie ? goalie.pos.y : 0
  const ty = (gy > 0 ? -1 : 1) * (0.55 + w.rng() * 0.25)
  const target = { x: g.x + Math.sign(g.x) * 0.5, y: ty }
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

function nextKind(p: PlayerRt) {
  return p.actions[p.idx + 1]?.kind
}

function advance(w: World, p: PlayerRt) {
  p.idx++
  p.idxStart = w.t
  p.pathS = 0
}

function scriptIntent(w: World, p: PlayerRt): Intent | null {
  for (let guard = 0; guard < 20 && p.idx < p.actions.length; guard++) {
    const a: Action = p.actions[p.idx]
    if (a.kind === 'wait') {
      if (w.t - p.idxStart >= a.seconds) {
        advance(w, p)
        continue
      }
      return hold(p)
    }
    if (a.kind === 'skate') {
      const info = pathInfo(a.path)
      p.pathS = project(info, p.pos, p.pathS, p.pathS + 3)
      const end = a.path[a.path.length - 1]
      const remaining = info.total - p.pathS
      const dEnd = dist(p.pos, end)
      if (remaining < 0.6 && dEnd < 0.9) {
        advance(w, p)
        continue
      }
      const target = pointAt(info, Math.min(info.total, p.pathS + 1.6))
      let speed = SPEEDS[a.speed] * (puckCarriedBy(w, p.id) ? 0.93 : 1)
      const nk = nextKind(p)
      if (nk !== 'skate' && nk !== 'pass' && nk !== 'shoot') speed = Math.min(speed, Math.sqrt(2 * 4.5 * remaining) + 0.4)
      return { target, speed }
    }
    const puck = puckCarriedBy(w, p.id)
    if (puck) {
      if (a.kind === 'pass') {
        const to = playerById(w, a.toPlayerId)
        if (to) doPass(w, p, puck, to, true)
      } else {
        doShot(w, p, puck, a.goal, true)
      }
      advance(w, p)
      continue
    }
    if (w.t - p.idxStart > 4) {
      advance(w, p)
      continue
    }
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
  else doShot(w, p, puck, attackSide(p.team, w.scenario.settings))
}

function playerIntent(w: World, p: PlayerRt): Intent {
  const scripted = scriptIntent(w, p)
  if (scripted) return scripted
  if (w.scenario.settings.autonomous) {
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
  const carrier = playerById(w, puck.carrierId)
  if (carrier) {
    puck.pos = stickPos(carrier)
    puck.vel = { ...carrier.vel }
    return
  }

  const prev = puck.pos
  const speed = len(puck.vel)
  if (speed > 0) {
    const ns = Math.max(0, speed - PUCK_FRICTION * DT)
    puck.vel = mul(puck.vel, ns / speed)
  }
  let next = add(prev, mul(puck.vel, DT))

  const gl = RINK.goalLineX
  if (Math.abs(prev.x) < gl && Math.abs(next.x) >= gl && Math.sign(next.x) === Math.sign(puck.vel.x)) {
    const t = (Math.sign(next.x) * gl - prev.x) / (next.x - prev.x)
    const y = prev.y + (next.y - prev.y) * t
    if (Math.abs(y) < RINK.goalHalfWidth) {
      puck.pos = { x: Math.sign(next.x) * (gl + 0.6), y }
      puck.vel = { x: 0, y: 0 }
      puck.inGoal = true
      w.events.push({ t: w.t, kind: 'goal' })
      return
    }
  }
  const back = gl + RINK.goalDepth
  if (Math.abs(prev.x) > back && Math.abs(next.x) <= back && Math.abs(next.y) < RINK.goalHalfWidth + 0.1) {
    puck.vel = { x: -puck.vel.x * 0.5, y: puck.vel.y }
    next = prev
  }

  const c = clampToRink(next, 0.1)
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
      if (d < 0.6 && d < bestD) {
        best = p
        bestD = d
      }
      continue
    }
    if (fast) continue
    if (puck.scripted && puck.intended && puck.intended !== p.id) continue
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

function steals(w: World) {
  if (!w.scenario.settings.autonomous) return
  for (const puck of w.pucks) {
    const carrier = playerById(w, puck.carrierId)
    if (!carrier || carrier.role === 'G' || w.t - carrier.holdSince < 0.4) continue
    if (carrier.idx < carrier.actions.length) continue
    for (const o of w.players) {
      if (o.team === carrier.team || o.role === 'G' || puckCarriedBy(w, o.id)) continue
      if (dist(o.pos, puck.pos) < 0.9 && w.rng() < 0.03) {
        takePuck(w, puck, o, 'steal')
        break
      }
    }
  }
}

function snapshot(w: World): Frame {
  const players: Frame['players'] = {}
  for (const p of w.players) players[p.id] = { x: p.pos.x, y: p.pos.y, h: p.heading }
  const pucks: Frame['pucks'] = {}
  for (const k of w.pucks) pucks[k.id] = { x: k.pos.x, y: k.pos.y, c: k.carrierId }
  return { t: w.t, players, pucks }
}

export function step(w: World) {
  const intents = w.players.map((p) => playerIntent(w, p))
  w.players.forEach((p, i) => {
    const it = intents[i]
    const target = it.speed > 0 ? separate(p, w.players, it.target) : it.target
    stepPlayer(p, { ...it, target }, DT)
  })
  for (const k of w.pucks) stepPuck(w, k)
  steals(w)
  w.t += DT
}

export function simulate(s: Scenario): SimResult {
  const w = createWorld(s)
  const frames: Frame[] = [snapshot(w)]
  const n = Math.round(s.settings.durationSec / DT)
  for (let i = 0; i < n; i++) {
    step(w)
    frames.push(snapshot(w))
  }
  return { frames, events: w.events, dt: DT, duration: n * DT }
}
