import { describe, expect, it } from 'vitest'
import { simulate } from '../engine/simulate'
import { BUILTIN_PASSES } from './courses'

const MANY_PUCKS: Record<string, number> = { 'bu2-g5-1': 3, 'bu2-g3-1': 8 }

describe('built-in passes', () => {
  for (const { id, pass } of BUILTIN_PASSES.filter((p) => p.id.startsWith('bu2/'))) {
    for (const s of pass.scenarios) {
      it(`${id}: ${s.name} keeps the puck count low and keeps going`, () => {
        const r = simulate(s)
        const live = Math.max(...r.frames.map((f) => Object.values(f.pucks).filter((k) => !k.s).length))
        expect(live).toBeLessThanOrEqual(MANY_PUCKS[s.id] ?? 2)
        expect(r.duration).toBeGreaterThan(40)
        const last = r.events.filter((e) => e.kind !== 'offside').at(-1)
        expect(last!.t).toBeGreaterThan(r.duration - 15)
      })
    }
  }
})
