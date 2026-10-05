import { fieldOf, goalCenter, type Field } from '../model/rink'
import type { Action, Scenario, Vec } from '../model/types'
import { frameIndex, type SimResult } from '../engine/simulate'
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

export interface RoundInfo {
  index: number
  startT: number
  actions: Action[]
}

export interface EditContext {
  round: number
  startT: number
  pos: Record<string, Vec>
  heading: Record<string, number>
  pucks: Record<string, Vec>
  actions: Action[]
  plan: StaticPlan
}

export function roundsOf(s: Scenario): RoundInfo[] {
  return [{ index: 0, startT: 0, actions: s.actions }, ...(s.rounds ?? []).map((r, i) => ({ index: i + 1, startT: r.startT, actions: r.actions }))]
}

export function roundAt(s: Scenario, t: number): number {
  const rounds = roundsOf(s)
  let idx = 0
  for (const r of rounds) if (frameIndex(r.startT) <= frameIndex(t)) idx = r.index
  return idx
}

export function initialCarrierMap(s: Scenario): Map<string, string> {
  const byPuck = new Map<string, string>()
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
      byPuck.set(k.id, best)
      taken.add(best)
    }
  }
  return byPuck
}

export function initialCarriers(s: Scenario): Set<string> {
  return new Set(initialCarrierMap(s).values())
}

export function staticPlan(actions: Action[], start: Record<string, Vec>, startCarriers: Set<string>, field: Field): StaticPlan {
  const endPos: Record<string, Vec> = { ...start }
  const carriers = new Set(startCarriers)
  const geom: Record<string, ActionGeom> = {}
  for (const a of actions) {
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
    } else if (a.kind === 'mark') {
      geom[a.id] = { from, to: endPos[a.targetId], withPuck }
    } else if (a.kind === 'shoot') {
      geom[a.id] = { from, to: goalCenter(field, a.goal), withPuck }
      carriers.delete(a.playerId)
    } else {
      geom[a.id] = { from, withPuck }
    }
  }
  return { endPos, carriers, geom }
}

export function editContext(s: Scenario, round: number, sim: SimResult): EditContext {
  const field = fieldOf(s.settings)
  const info = roundsOf(s)[round] ?? roundsOf(s)[0]
  const pos: Record<string, Vec> = {}
  const heading: Record<string, number> = {}
  const pucks: Record<string, Vec> = {}
  let carriers: Set<string>

  if (info.index === 0) {
    for (const p of s.players) {
      pos[p.id] = p.pos
      heading[p.id] = p.heading
    }
    for (const k of s.pucks) pucks[k.id] = k.pos
    carriers = initialCarriers(s)
  } else {
    const f = sim.frames[Math.min(sim.frames.length - 1, frameIndex(info.startT))]
    for (const p of s.players) {
      const fp = f.players[p.id]
      pos[p.id] = fp ? { x: fp.x, y: fp.y } : p.pos
      heading[p.id] = fp ? fp.h : p.heading
    }
    carriers = new Set()
    for (const k of s.pucks) {
      const fk = f.pucks[k.id]
      pucks[k.id] = fk ? { x: fk.x, y: fk.y } : k.pos
      if (fk?.c) carriers.add(fk.c)
    }
  }

  return {
    round: info.index,
    startT: info.startT,
    pos,
    heading,
    pucks,
    actions: info.actions,
    plan: staticPlan(info.actions, pos, carriers, field),
  }
}
