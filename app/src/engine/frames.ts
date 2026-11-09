import type { Frame } from '../model/types'
import type { SimResult } from './simulate'
import { wrapAngle } from './vec'

export function frameAt(sim: SimResult, t: number): Frame {
  const i = t / sim.dt
  const i0 = Math.max(0, Math.min(sim.frames.length - 1, Math.floor(i)))
  const i1 = Math.min(sim.frames.length - 1, i0 + 1)
  const a = sim.frames[i0]
  const b = sim.frames[i1]
  const k = Math.max(0, Math.min(1, i - i0))
  const players: Frame['players'] = {}
  for (const id in a.players) {
    const pa = a.players[id]
    const pb = b.players[id] ?? pa
    players[id] = { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, h: pa.h + wrapAngle(pb.h - pa.h) * k, q: pa.q }
  }
  const pucks: Frame['pucks'] = {}
  for (const id in a.pucks) {
    const ka = a.pucks[id]
    const kb = b.pucks[id] ?? ka
    pucks[id] = { x: ka.x + (kb.x - ka.x) * k, y: ka.y + (kb.y - ka.y) * k, c: ka.c, s: ka.s }
  }
  return { t, players, pucks }
}
