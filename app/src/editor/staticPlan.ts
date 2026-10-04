import { fieldOf, goalCenter } from '../model/rink'
import type { Scenario, Vec } from '../model/types'
import { dist } from '../engine/vec'

export interface ActionGeom {
  from: Vec
  to?: Vec
  withPuck: boolean
}

export interface StaticPlan {
  endPos: Record<string, Vec>
  carriers: Set<string>
  geom: Record<string, ActionGeom>
}

export function staticPlan(s: Scenario): StaticPlan {
  const endPos: Record<string, Vec> = {}
  for (const p of s.players) endPos[p.id] = p.pos
  const carriers = new Set<string>()
  for (const k of s.pucks) {
    let best: string | null = null
    let bestD = 1.6
    for (const p of s.players) {
      if (carriers.has(p.id)) continue
      const d = dist(p.pos, k.pos)
      if (d < bestD) {
        bestD = d
        best = p.id
      }
    }
    if (best) carriers.add(best)
  }

  const geom: Record<string, ActionGeom> = {}
  for (const a of s.actions) {
    const from = endPos[a.playerId]
    if (!from) continue
    const withPuck = carriers.has(a.playerId)
    if (a.kind === 'skate') {
      geom[a.id] = { from, withPuck }
      endPos[a.playerId] = a.path[a.path.length - 1]
    } else if (a.kind === 'pass') {
      geom[a.id] = { from, to: endPos[a.toPlayerId], withPuck }
      carriers.delete(a.playerId)
      carriers.add(a.toPlayerId)
    } else if (a.kind === 'shoot') {
      geom[a.id] = { from, to: goalCenter(fieldOf(s.settings), a.goal), withPuck }
      carriers.delete(a.playerId)
    } else {
      geom[a.id] = { from, withPuck }
    }
  }
  return { endPos, carriers, geom }
}
