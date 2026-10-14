import { attackSide } from '../model/rink'
import type { Team } from '../model/types'
import { dist } from './vec'
import { playerById, puckCarriedBy, type Intent, type PlayerRt, type PuckRt, type World } from './world'

const ONSIDE_MARGIN = 0.6
const OFFSIDE_DEPTH = 0.3
const STOP_DECEL = 5
const CARRIER_HOLD = 1.3

function attackDir(w: World, team: Team) {
  return attackSide(team, w.scenario.settings) === 'right' ? 1 : -1
}

function teamPuck(w: World, p: PlayerRt): PuckRt | undefined {
  const live = w.pucks.filter((k) => !k.inGoal)
  const ours = live.find((k) => k.carrierId !== null && playerById(w, k.carrierId)?.team === p.team)
  if (ours) return ours
  return live.reduce<PuckRt | undefined>((best, k) => (!best || dist(k.pos, p.pos) < dist(best.pos, p.pos) ? k : best), undefined)
}

export function puckInZone(w: World, puck: PuckRt, team: Team) {
  const blue = w.field.blueLineX
  if (blue === null) return true
  const dir = attackDir(w, team)
  return (puck.pos.x - dir * blue) * dir > 0
}

function waitForOnside(w: World, p: PlayerRt, puck: PuckRt, it: Intent): Intent {
  const dir = attackDir(w, p.team)
  const line = dir * w.field.blueLineX!
  const offside = w.players.some((q) => q.team === p.team && q.id !== p.id && q.role !== 'G' && q.role !== 'C' && (q.pos.x - line) * dir > OFFSIDE_DEPTH)
  if (!offside || puckInZone(w, puck, p.team)) return it
  const hold = line - dir * CARRIER_HOLD
  if ((it.target.x - hold) * dir <= 0) return it
  return { ...it, target: { x: hold, y: it.target.y }, speed: Math.min(it.speed, Math.sqrt(2 * STOP_DECEL * Math.max(0, (hold - p.pos.x) * dir)) + 0.2) }
}

export function keepOnside(w: World, p: PlayerRt, it: Intent): Intent {
  const blue = w.field.blueLineX
  if (blue === null || w.scenario.settings.offside === false || p.role === 'G' || p.role === 'C' || it.speed <= 0) return it
  const carried = puckCarriedBy(w, p.id)
  if (carried) return it.scripted ? it : waitForOnside(w, p, carried, it)
  const puck = teamPuck(w, p)
  if (!puck || puckInZone(w, puck, p.team)) return it

  const dir = attackDir(w, p.team)
  const line = dir * blue
  const hold = line - dir * ONSIDE_MARGIN

  if ((p.pos.x - hold) * dir > 0) return { ...it, target: { x: hold - dir, y: p.pos.y } }
  if ((it.target.x - hold) * dir <= 0) return it

  const toLine = (hold - p.pos.x) * dir
  const puckToLine = Math.max(0, (line - puck.pos.x) * dir)
  const puckPace = Math.max(1, puck.vel.x * dir)
  const tPuck = puckToLine / puckPace
  const pace = tPuck > 0.05 ? toLine / tPuck : it.speed
  const canStop = Math.sqrt(2 * STOP_DECEL * toLine) + 0.2
  return { ...it, target: { x: hold, y: it.target.y }, speed: Math.min(it.speed, Math.max(pace, 0.5), canStop) }
}

export function detectOffside(w: World, puck: PuckRt, wasInZone: Partial<Record<Team, boolean>>) {
  const blue = w.field.blueLineX
  if (blue === null || w.scenario.settings.offside === false) return
  for (const team of ['home', 'away'] as const) {
    const inZone = puckInZone(w, puck, team)
    const entering = inZone && wasInZone[team] === false
    wasInZone[team] = inZone
    if (!entering) continue
    const attacking = puck.carrierId ? playerById(w, puck.carrierId)?.team === team : puck.lastTeam === team
    if (!attacking) continue
    const dir = attackDir(w, team)
    for (const q of w.players) {
      if (q.team !== team || q.role === 'G' || q.role === 'C' || q.id === puck.carrierId) continue
      if ((q.pos.x - dir * blue) * dir > OFFSIDE_DEPTH) w.events.push({ t: w.t, kind: 'offside', playerId: q.id })
    }
  }
}
