import type { Side, Team, Vec, ScenarioSettings } from './types'

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
}

export function goalCenter(side: Side): Vec {
  return { x: side === 'left' ? -RINK.goalLineX : RINK.goalLineX, y: 0 }
}

export function attackSide(team: Team, settings: ScenarioSettings): Side {
  const home = settings.homeAttacks
  if (team === 'home') return home
  return home === 'left' ? 'right' : 'left'
}

export function defendSide(team: Team, settings: ScenarioSettings): Side {
  return attackSide(team, settings) === 'left' ? 'right' : 'left'
}

export function clampToRink(p: Vec, margin: number): { pos: Vec; normal: Vec | null } {
  const hx = RINK.halfLength - margin
  const hy = RINK.halfWidth - margin
  const r = RINK.cornerR - margin
  const ax = Math.abs(p.x)
  const ay = Math.abs(p.y)
  if (ax > hx - r && ay > hy - r) {
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
  if (ax > hx) return { pos: { x: Math.sign(p.x) * hx, y: p.y }, normal: { x: Math.sign(p.x), y: 0 } }
  if (ay > hy) return { pos: { x: p.x, y: Math.sign(p.y) * hy }, normal: { x: 0, y: Math.sign(p.y) } }
  return { pos: p, normal: null }
}
