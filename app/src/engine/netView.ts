import { attackSide, goalAcross, goalNormal, nearestGoal, RINK } from '../model/rink'
import type { Frame, Goal, Player, ScenarioSettings, Vec } from '../model/types'
import { dist } from './vec'

export const GOAL_HEIGHT = 1.22
export const NET_COLS = 36
export const NET_ROWS = 24
export const SHOT_HEIGHT = 0.12

export type Box = { name: string; c: [number, number, number]; h: [number, number, number] }

export const GOALIE_BOXES: Box[] = [
  { name: 'padL', c: [0.06, 0.22, 0.43], h: [0.13, 0.14, 0.43] },
  { name: 'padR', c: [0.06, -0.22, 0.43], h: [0.13, 0.14, 0.43] },
  { name: 'pants', c: [-0.02, 0, 0.72], h: [0.16, 0.27, 0.12] },
  { name: 'body', c: [0, 0, 1.06], h: [0.17, 0.3, 0.26] },
  { name: 'head', c: [0.02, 0, 1.43], h: [0.13, 0.12, 0.13] },
  { name: 'armL', c: [0.06, 0.38, 1.06], h: [0.1, 0.11, 0.17] },
  { name: 'armR', c: [0.06, -0.38, 1.0], h: [0.1, 0.11, 0.17] },
  { name: 'glove', c: [0.16, 0.54, 0.9], h: [0.09, 0.15, 0.19] },
  { name: 'blocker', c: [0.18, -0.48, 0.8], h: [0.05, 0.14, 0.22] },
  { name: 'paddle', c: [0.26, -0.18, 0.32], h: [0.02, 0.045, 0.32] },
  { name: 'blade', c: [0.32, -0.02, 0.05], h: [0.03, 0.24, 0.05] },
]

export const FLOORBALL_GOALIE_BOXES: Box[] = [
  { name: 'shinL', c: [-0.08, 0.34, 0.06], h: [0.16, 0.2, 0.06] },
  { name: 'shinR', c: [-0.08, -0.34, 0.06], h: [0.16, 0.2, 0.06] },
  { name: 'thighs', c: [0.02, 0, 0.24], h: [0.1, 0.24, 0.18] },
  { name: 'body', c: [0, 0, 0.6], h: [0.12, 0.18, 0.2] },
  { name: 'head', c: [0.03, 0, 0.9], h: [0.11, 0.1, 0.12] },
  { name: 'armL', c: [0.04, 0.3, 0.6], h: [0.07, 0.13, 0.08] },
  { name: 'armR', c: [0.04, -0.3, 0.6], h: [0.07, 0.13, 0.08] },
  { name: 'handL', c: [0.1, 0.46, 0.58], h: [0.05, 0.06, 0.09] },
  { name: 'handR', c: [0.1, -0.46, 0.58], h: [0.05, 0.06, 0.09] },
]

export interface GoaliePose {
  pos: Vec
  heading: number
  scale: number
  boxes?: Box[]
}

export type Ray3 = { o: [number, number, number]; d: [number, number, number] }

function hitsBox(r: Ray3, pose: GoaliePose, b: Box) {
  const f = [Math.cos(pose.heading), Math.sin(pose.heading)]
  const l = [Math.sin(pose.heading), -Math.cos(pose.heading)]
  const s = pose.scale
  const cx = pose.pos.x + (f[0] * b.c[0] + l[0] * b.c[1]) * s
  const cy = pose.pos.y + (f[1] * b.c[0] + l[1] * b.c[1]) * s
  const cz = b.c[2] * s
  const ox = r.o[0] - cx
  const oy = r.o[1] - cy
  const oz = r.o[2] - cz
  const o = [ox * f[0] + oy * f[1], ox * l[0] + oy * l[1], oz]
  const d = [r.d[0] * f[0] + r.d[1] * f[1], r.d[0] * l[0] + r.d[1] * l[1], r.d[2]]
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 3; i++) {
    const h = b.h[i] * s
    if (Math.abs(d[i]) < 1e-9) {
      if (Math.abs(o[i]) > h) return false
      continue
    }
    let a = (-h - o[i]) / d[i]
    let c = (h - o[i]) / d[i]
    if (a > c) [a, c] = [c, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, c)
    if (t0 > t1) return false
  }
  return true
}

export const CELL_BLOCKED = 0
export const CELL_OPEN = 1
export const CELL_TIGHT = 2

export interface NetView {
  cells: Uint8Array
  open: number
  tight: number
}

export function cellTarget(goal: Goal, i: number, j: number) {
  const half = RINK.goalHalfWidth
  const lat = -half + ((i + 0.5) / NET_COLS) * 2 * half
  const z = ((j + 0.5) / NET_ROWS) * GOAL_HEIGHT
  const a = goalAcross(goal)
  return { lat, z, x: goal.pos.x + a.x * lat, y: goal.pos.y + a.y * lat }
}

export function netView(goal: Goal, puck: Vec, goalie: GoaliePose | undefined): NetView {
  const cells = new Uint8Array(NET_COLS * NET_ROWS)
  const ray: Ray3 = { o: [puck.x, puck.y, SHOT_HEIGHT], d: [0, 0, 0] }
  for (let j = 0; j < NET_ROWS; j++) {
    for (let i = 0; i < NET_COLS; i++) {
      const t = cellTarget(goal, i, j)
      ray.d = [t.x - puck.x, t.y - puck.y, t.z - SHOT_HEIGHT]
      const blocked = goalie ? (goalie.boxes ?? GOALIE_BOXES).some((b) => hitsBox(ray, goalie, b)) : false
      cells[j * NET_COLS + i] = blocked ? CELL_BLOCKED : CELL_OPEN
    }
  }
  let open = 0
  let tight = 0
  for (let j = 0; j < NET_ROWS; j++) {
    for (let i = 0; i < NET_COLS; i++) {
      const k = j * NET_COLS + i
      if (cells[k] === CELL_BLOCKED) continue
      open++
      const nearBlocked = [-1, 1].some((di) => {
        const ii = i + di
        return ii >= 0 && ii < NET_COLS && cells[j * NET_COLS + ii] === CELL_BLOCKED
      }) || [-1, 1].some((dj) => {
        const jj = j + dj
        return jj >= 0 && jj < NET_ROWS && cells[jj * NET_COLS + i] === CELL_BLOCKED
      })
      if (nearBlocked) {
        cells[k] = CELL_TIGHT
        tight++
      }
    }
  }
  return { cells, open: (open - tight) / cells.length, tight: tight / cells.length }
}

export const depthFromGoal = (goal: Goal, p: Vec) => {
  const n = goalNormal(goal)
  return (p.x - goal.pos.x) * n.x + (p.y - goal.pos.y) * n.y
}

export const MIN_SHOT_DEPTH = 0.6

export interface GoalieAdjust {
  depth: number
  lateral: number
}

export function angleLine(goal: Goal, puck: Vec) {
  const n = goalNormal(goal)
  const dx = puck.x - goal.pos.x
  const dy = puck.y - goal.pos.y
  const d = Math.hypot(dx, dy)
  let dir = d > 0.01 ? { x: dx / d, y: dy / d } : n
  if (dir.x * n.x + dir.y * n.y < 0.2) {
    const a = goalAcross(goal)
    const side = Math.sign(dir.x * a.x + dir.y * a.y) || 1
    const m = Math.hypot(0.2, 0.98)
    dir = { x: (n.x * 0.2 + a.x * side * 0.98) / m, y: (n.y * 0.2 + a.y * side * 0.98) / m }
  }
  return { dir, perp: { x: -dir.y, y: dir.x } }
}

export function adjustOf(goal: Goal, puck: Vec, goaliePos: Vec): GoalieAdjust {
  const { dir, perp } = angleLine(goal, puck)
  const dx = goaliePos.x - goal.pos.x
  const dy = goaliePos.y - goal.pos.y
  return { depth: dx * dir.x + dy * dir.y, lateral: dx * perp.x + dy * perp.y }
}

export function placeGoalie(goal: Goal, puck: Vec, a: GoalieAdjust): { pos: Vec; heading: number } {
  const { dir, perp } = angleLine(goal, puck)
  const pos = { x: goal.pos.x + dir.x * a.depth + perp.x * a.lateral, y: goal.pos.y + dir.y * a.depth + perp.y * a.lateral }
  return { pos, heading: Math.atan2(puck.y - pos.y, puck.x - pos.x) }
}

export const ADJUST_LIMITS = { minDepth: 0.35, maxDepth: 6, maxLateral: 1.6 }

export function clampAdjust(a: GoalieAdjust): GoalieAdjust {
  return {
    depth: Math.min(ADJUST_LIMITS.maxDepth, Math.max(ADJUST_LIMITS.minDepth, a.depth)),
    lateral: Math.min(ADJUST_LIMITS.maxLateral, Math.max(-ADJUST_LIMITS.maxLateral, a.lateral)),
  }
}

export interface Duel {
  shooterId: string
  puck: Vec
  carrying: boolean
  goal: Goal
  goalieId?: string
}

const skaterRole = (p: Player | undefined) => !!p && p.role !== 'G' && p.role !== 'C'

function goalieAt(frame: Frame, players: Player[], goals: Goal[], goal: Goal, shooter: Player) {
  let best: { id: string; d: number } | undefined
  for (const g of players) {
    const gp = frame.players[g.id]
    if (g.role !== 'G' || !gp || gp.q || nearestGoal(goals, gp) !== goal) continue
    const d = dist(gp, goal.pos) + (g.team === shooter.team ? 0.5 : 0)
    if (!best || d < best.d) best = { id: g.id, d }
  }
  return best?.id
}

function goalFor(frame: Frame, players: Player[], goals: Goal[], settings: ScenarioSettings, shooter: Player, puck: Vec) {
  const attacked = nearestGoal(goals, puck, attackSide(shooter.team, settings))
  const attackedGoalie = attacked ? goalieAt(frame, players, goals, attacked, shooter) : undefined
  if (attacked && attackedGoalie) return { goal: attacked, goalieId: attackedGoalie, d: 0 }
  let best: { goal: Goal; goalieId?: string; d: number } | undefined
  for (const g of players) {
    const gp = frame.players[g.id]
    if (g.role !== 'G' || g.team === shooter.team || !gp || gp.q) continue
    const goal = nearestGoal(goals, gp)
    if (!goal) continue
    const d = dist(goal.pos, puck)
    if (!best || d < best.d) best = { goal, goalieId: g.id, d }
  }
  if (best) return best
  const goal = attacked ?? nearestGoal(goals, puck)
  return goal ? { goal, goalieId: undefined, d: 0 } : undefined
}

export function findDuel(frame: Frame, players: Player[], goals: Goal[], settings: ScenarioSettings, prev: Duel | null, focusId?: string): Duel | null {
  const byId = new Map(players.map((p) => [p.id, p]))
  const carried = Object.values(frame.pucks).filter((k) => k.c && !k.s && skaterRole(byId.get(k.c)) && !frame.players[k.c]?.q)
  const pick = carried.find((k) => k.c === prev?.shooterId) ?? carried.find((k) => k.c === focusId) ?? carried[0]
  if (pick) {
    const shooter = byId.get(pick.c!)!
    const found = goalFor(frame, players, goals, settings, shooter, pick)
    if (!found) return null
    return { shooterId: shooter.id, puck: { x: pick.x, y: pick.y }, carrying: true, goal: found.goal, goalieId: found.goalieId }
  }
  const loose = Object.values(frame.pucks).filter((k) => !k.s)
  if (prev && frame.players[prev.shooterId] && loose.length) {
    const nearest = loose.reduce((a, b) => (dist(a, prev.goal.pos) < dist(b, prev.goal.pos) ? a : b))
    return { ...prev, puck: { x: nearest.x, y: nearest.y }, carrying: false }
  }
  const any = players.find((p) => skaterRole(p) && frame.players[p.id] && !frame.players[p.id].q)
  if (!any || !loose.length) return prev
  const k = loose[0]
  const found = goalFor(frame, players, goals, settings, any, k)
  return found ? { shooterId: any.id, puck: { x: k.x, y: k.y }, carrying: false, goal: found.goal, goalieId: found.goalieId } : null
}
