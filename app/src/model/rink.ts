import type { Goal, Layout, Scenario, Side, Team, Vec, ScenarioSettings } from './types'

export const RINK = {
  halfLength: 30,
  halfWidth: 15,
  cornerR: 8.5,
  goalLineX: 26,
  blueLineX: 7.5,
  faceoffR: 4.5,
  creaseR: 1.83,
  goalHalfWidth: 0.915,
  goalDepth: 1.12,
  endDotX: 20,
  endDotY: 7,
  neutralDotX: 6,
  neutralDotY: 7,
  zoneDepth: 22.5,
  endToGoalLine: 4,
  endToDot: 10,
}

export const DIVIDER = { length: 2, thickness: 0.2 }

export interface Field {
  layout: Layout
  halfLength: number
  halfWidth: number
  cornerTop: number
  cornerBottom: number
  goalLineX: number
  blueLineX: number | null
}

export const FIELDS: Record<Layout, Field> = {
  full: { layout: 'full', halfLength: 30, halfWidth: 15, cornerTop: RINK.cornerR, cornerBottom: RINK.cornerR, goalLineX: RINK.goalLineX, blueLineX: RINK.blueLineX },
  zone: { layout: 'zone', halfLength: 15, halfWidth: RINK.zoneDepth / 2, cornerTop: 0, cornerBottom: RINK.cornerR, goalLineX: 12, blueLineX: null },
}

export const fieldOf = (settings: Pick<ScenarioSettings, 'layout'>) => FIELDS[settings.layout ?? 'full']

export function goalCenter(f: Field, side: Side): Vec {
  return { x: side === 'left' ? -f.goalLineX : f.goalLineX, y: 0 }
}

export const DEFAULT_GOAL_IDS: Record<Side, string> = { left: 'goal-left', right: 'goal-right' }

export function defaultGoals(f: Field): Goal[] {
  return [
    { id: DEFAULT_GOAL_IDS.left, pos: goalCenter(f, 'left'), angle: 0 },
    { id: DEFAULT_GOAL_IDS.right, pos: goalCenter(f, 'right'), angle: Math.PI },
  ]
}

export const goalsOf = (s: Pick<Scenario, 'goals' | 'settings'>) => s.goals ?? defaultGoals(fieldOf(s.settings))

export const goalNormal = (g: Goal): Vec => ({ x: Math.cos(g.angle), y: Math.sin(g.angle) })

export function goalSide(g: Goal): Side {
  const nx = Math.cos(g.angle)
  if (Math.abs(nx) > 0.5) return nx > 0 ? 'left' : 'right'
  return g.pos.x < 0 ? 'left' : 'right'
}

export function nearestGoal(goals: Goal[], p: Vec, side?: Side): Goal | undefined {
  let best: Goal | undefined
  let bestD = Infinity
  for (const g of goals) {
    if (side && goalSide(g) !== side) continue
    const d = Math.hypot(g.pos.x - p.x, g.pos.y - p.y)
    if (d < bestD) {
      bestD = d
      best = g
    }
  }
  return best
}

export function attackSide(team: Team, settings: ScenarioSettings): Side {
  const home = settings.homeAttacks
  if (team === 'home') return home
  return home === 'left' ? 'right' : 'left'
}

export function defendSide(team: Team, settings: ScenarioSettings): Side {
  return attackSide(team, settings) === 'left' ? 'right' : 'left'
}

export function clampToField(f: Field, p: Vec, margin: number): { pos: Vec; normal: Vec | null } {
  const hx = f.halfLength - margin
  const hy = f.halfWidth - margin
  const cornerR = p.y < 0 ? f.cornerTop : f.cornerBottom
  const r = cornerR - margin
  const ax = Math.abs(p.x)
  const ay = Math.abs(p.y)
  if (r > 0 && ax > hx - r && ay > hy - r) {
    const c = { x: Math.sign(p.x) * (hx - r), y: Math.sign(p.y) * (hy - r) }
    const dx = p.x - c.x
    const dy = p.y - c.y
    const d = Math.hypot(dx, dy)
    if (d > r) {
      const n = { x: dx / d, y: dy / d }
      return { pos: { x: c.x + n.x * r, y: c.y + n.y * r }, normal: n }
    }
    return { pos: p, normal: null }
  }
  const nx = ax > hx ? Math.sign(p.x) : 0
  const ny = ay > hy ? Math.sign(p.y) : 0
  if (!nx && !ny) return { pos: p, normal: null }
  const l = Math.hypot(nx, ny)
  return { pos: { x: nx ? nx * hx : p.x, y: ny ? ny * hy : p.y }, normal: { x: nx / l, y: ny / l } }
}
