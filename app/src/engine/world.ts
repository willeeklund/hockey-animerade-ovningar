import type { Field } from '../model/rink'
import type { Action, Role, Scenario, SimEvent, Team, Vec } from '../model/types'

export const DT = 1 / 30

export const SPEEDS = { slow: 3.2, normal: 5.6, fast: 7.6 }
export const STICK_REACH = 0.75
export const PASS_SPEED = 15
export const SHOT_SPEED = 27

export interface PlayerRt {
  id: string
  team: Team
  role: Role
  pos: Vec
  vel: Vec
  heading: number
  actions: Action[]
  idx: number
  idxStart: number
  pathS: number
  holdSince: number
  lastDecision: number
}

export interface PuckRt {
  id: string
  pos: Vec
  vel: Vec
  carrierId: string | null
  noPickup: Record<string, number>
  intended: string | null
  inGoal: boolean
  lastTeam: Team | null
  scripted: boolean
}

export interface Intent {
  target: Vec
  speed: number
  face?: Vec
  scripted?: boolean
}

export interface World {
  t: number
  players: PlayerRt[]
  pucks: PuckRt[]
  cones: Vec[]
  rng: () => number
  events: SimEvent[]
  scenario: Scenario
  field: Field
}

export function playerById(w: World, id: string | null) {
  return id ? w.players.find((p) => p.id === id) : undefined
}

export function puckCarriedBy(w: World, playerId: string) {
  return w.pucks.find((k) => k.carrierId === playerId)
}

export function hold(p: PlayerRt, face?: Vec): Intent {
  return { target: p.pos, speed: 0, face }
}
