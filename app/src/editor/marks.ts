import { markPosition } from '../engine/marking'
import { add, angleOf, dist, mul, norm, sub } from '../engine/vec'
import { defendSide, fieldOf, goalCenter } from '../model/rink'
import type { Action, Player, Scenario } from '../model/types'
import { initialCarriers } from './staticPlan'

type MarkAction = Extract<Action, { kind: 'mark' }>

export function boundMarker(s: Scenario, playerId: string): MarkAction | undefined {
  const first = s.actions.find((a) => a.playerId === playerId)
  return first?.kind === 'mark' ? first : undefined
}

export function applyMarks(s: Scenario): Scenario {
  const marks = s.players.flatMap((p) => {
    const mark = boundMarker(s, p.id)
    return mark ? [{ p, mark }] : []
  })
  if (marks.length === 0) return s
  const field = fieldOf(s.settings)
  const carriers = initialCarriers(s)
  const byId = new Map(s.players.map((p) => [p.id, p]))
  const updated = new Map<string, Player>()

  for (const { p, mark } of marks) {
    const man = byId.get(mark.targetId)
    if (!man) continue
    const puck = s.pucks.reduce<{ pos: { x: number; y: number } } | null>(
      (best, k) => (!best || dist(k.pos, man.pos) < dist(best.pos, man.pos) ? k : best),
      null,
    )
    const r = markPosition({
      field,
      ownGoal: goalCenter(field, defendSide(p.team, s.settings)),
      man: man.pos,
      manVel: { x: 0, y: 0 },
      puck: puck?.pos ?? null,
      manHasPuck: carriers.has(man.id),
    })
    let pos = r.pos
    const taken = [...updated.values()].some((q) => dist(q.pos, pos) < 1)
    if (taken) {
      const away = norm(sub(pos, man.pos))
      pos = add(pos, mul({ x: -away.y, y: away.x }, 1.2))
    }
    updated.set(p.id, { ...p, pos, heading: angleOf(sub(r.face, pos)) })
  }

  if (updated.size === 0) return s
  return { ...s, players: s.players.map((p) => updated.get(p.id) ?? p) }
}
