import { goalAcross, goalNormal, RINK } from '../model/rink'
import type { Goal, Vec } from '../model/types'
import { angleLine, CELL_BLOCKED, cellTarget, depthFromGoal, GOAL_HEIGHT, NET_COLS, NET_ROWS, netView, placeGoalie, type GoaliePose, type NetView } from './netView'

const CELL_W = (2 * RINK.goalHalfWidth) / NET_COLS
const CELL_H = GOAL_HEIGHT / NET_ROWS
export const BIG_HOLE = 0.2
export const BIG_OPEN = 0.25
export const DEKE_MAX_GAP = 4.5
export const DEKE_CLOSE = 2.6
export const DEKE_MIN_DEPTH = 1.7
export const SHOOTER_SPEED = 6.2
export const GOALIE_SPEED = 3.2
export const GOALIE_REACTION = 0.3

export interface Hole {
  i: number
  j: number
  room: number
}

export function bestHole(nv: NetView): Hole | null {
  const blocked: [number, number][] = []
  for (let j = 0; j < NET_ROWS; j++) for (let i = 0; i < NET_COLS; i++) if (nv.cells[j * NET_COLS + i] === CELL_BLOCKED) blocked.push([i, j])
  let best: Hole | null = null
  for (let j = 0; j < NET_ROWS; j++) {
    for (let i = 0; i < NET_COLS; i++) {
      if (nv.cells[j * NET_COLS + i] === CELL_BLOCKED) continue
      const frame = Math.min((i + 0.5) * CELL_W, (NET_COLS - i - 0.5) * CELL_W, (NET_ROWS - j - 0.5) * CELL_H, 0.25)
      let room = frame
      for (const [bi, bj] of blocked) {
        const d = Math.hypot((bi - i) * CELL_W, (bj - j) * CELL_H)
        if (d < room) room = d
      }
      const low = j < NET_ROWS / 2 ? 0.001 : 0
      if (!best || room + low > best.room + 1e-6) best = { i, j, room: room + low }
    }
  }
  return best
}

export type Move = { kind: 'shoot' | 'chance' } | { kind: 'deke'; side: 1 | -1 }

export function decide(goal: Goal, puck: Vec, goalie: GoaliePose | undefined): Move {
  if (!goalie) return { kind: 'shoot' }
  const gap = Math.hypot(goalie.pos.x - puck.x, goalie.pos.y - puck.y)
  const out = depthFromGoal(goal, goalie.pos) > DEKE_MIN_DEPTH
  const nv = netView(goal, puck, goalie)
  const hole = bestHole(nv)
  const big = !!hole && hole.room >= BIG_HOLE && nv.open >= BIG_OPEN
  const deke = (out && gap < DEKE_CLOSE) || (!big && out && gap < DEKE_MAX_GAP)
  if (!deke && big) return { kind: 'shoot' }
  if (deke) {
    const { perp } = angleLine(goal, puck)
    const off = (goalie.pos.x - goal.pos.x) * perp.x + (goalie.pos.y - goal.pos.y) * perp.y
    const a = goalAcross(goal)
    const towardMiddle = (puck.x - goal.pos.x) * a.x + (puck.y - goal.pos.y) * a.y > 0 ? -1 : 1
    const perpAcross = perp.x * a.x + perp.y * a.y >= 0 ? 1 : -1
    const side = Math.abs(off) > 0.1 ? (off > 0 ? -1 : 1) : towardMiddle * perpAcross
    return { kind: 'deke', side: side as 1 | -1 }
  }
  return { kind: 'chance' }
}

export interface DekeRoute {
  from: Vec
  ctrl: Vec
  to: Vec
  length: number
}

export function bezier(r: Pick<DekeRoute, 'from' | 'ctrl' | 'to'>, k: number): Vec {
  const u = 1 - k
  return { x: u * u * r.from.x + 2 * u * k * r.ctrl.x + k * k * r.to.x, y: u * u * r.from.y + 2 * u * k * r.ctrl.y + k * k * r.to.y }
}

export function dekeRoute(goal: Goal, puck: Vec, goalie: GoaliePose, side: 1 | -1): DekeRoute {
  const { perp } = angleLine(goal, puck)
  const n = goalNormal(goal)
  const a = goalAcross(goal)
  const sideAcross = (perp.x * a.x + perp.y * a.y >= 0 ? 1 : -1) * side
  const to = { x: goal.pos.x + n.x * 1.4 + a.x * sideAcross * 1.0, y: goal.pos.y + n.y * 1.4 + a.y * sideAcross * 1.0 }
  const ctrl = { x: goalie.pos.x + perp.x * side * 2.2, y: goalie.pos.y + perp.y * side * 2.2 }
  let length = 0
  let prev = puck
  for (let i = 1; i <= 20; i++) {
    const p = bezier({ from: puck, ctrl, to }, i / 20)
    length += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return { from: puck, ctrl, to, length }
}

export function goalieRecovery(goal: Goal, goalie: GoaliePose, shotFrom: Vec, time: number): Vec {
  const want = placeGoalie(goal, shotFrom, { depth: 0.7, lateral: 0 }).pos
  const d = Math.hypot(want.x - goalie.pos.x, want.y - goalie.pos.y)
  const moved = Math.max(0, time - GOALIE_REACTION) * GOALIE_SPEED
  const k = d < 1e-6 ? 1 : Math.min(1, moved / d)
  return { x: goalie.pos.x + (want.x - goalie.pos.x) * k, y: goalie.pos.y + (want.y - goalie.pos.y) * k }
}

export function holeTarget(goal: Goal, nv: NetView) {
  const h = bestHole(nv)
  if (!h) return cellTarget(goal, NET_COLS / 2, 3)
  return cellTarget(goal, h.i, h.j)
}

export const SHOT_SPEED_KID = 22
export const GOALIE_REACT = 0.18
export const LIMB_SPEED = 2.6

export function roomAt(nv: NetView, i: number, j: number) {
  let room = Infinity
  for (let jj = 0; jj < NET_ROWS; jj++) {
    for (let ii = 0; ii < NET_COLS; ii++) {
      if (nv.cells[jj * NET_COLS + ii] !== CELL_BLOCKED) continue
      room = Math.min(room, Math.hypot((ii - i) * CELL_W, (jj - j) * CELL_H))
    }
  }
  return room
}

export function saveChance(distance: number, room: number) {
  if (!Number.isFinite(room)) return 0
  const reach = Math.max(0, distance / SHOT_SPEED_KID - GOALIE_REACT) * LIMB_SPEED
  const k = Math.min(1, Math.max(0, (reach - room + 0.15) / 0.45))
  const smooth = k * k * (3 - 2 * k)
  const long = distance > 12 ? 0.9 : 0
  return Math.max(long, 0.04 + 0.91 * smooth)
}
