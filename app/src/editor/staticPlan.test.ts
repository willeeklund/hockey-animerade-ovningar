import { describe, expect, it } from 'vitest'
import { simulate } from '../engine/simulate'
import { dist } from '../engine/vec'
import { editContext } from './staticPlan'
import { template } from './templates'

describe('edit context look-ahead', () => {
  it('moves everyone forward to when the latest instruction is done', () => {
    const s = template('3v2')
    s.actions = [{ id: 's1', kind: 'skate', playerId: 'h1', speed: 'fast', path: [{ x: 4, y: 0 }, { x: 9, y: 1 }] }]
    const sim = simulate(s)
    const c = editContext(s, 0, sim)
    expect(c.focusT).toBeGreaterThan(0.5)
    expect(dist(c.now.h1, { x: 9, y: 1 })).toBeLessThan(1.2)
    expect(dist(c.now.h2, c.pos.h2)).toBeGreaterThan(1)
    expect(c.nowCarriers.has('h1')).toBe(true)
  })

  it('a pass added at the look-ahead time leaves earlier play unchanged and is drawn where it happens', () => {
    const s = template('3v2')
    s.actions = [{ id: 's1', kind: 'skate', playerId: 'h1', speed: 'fast', path: [{ x: 4, y: 0 }, { x: 9, y: 1 }] }]
    const before = editContext(s, 0, simulate(s))
    const next = { ...s, actions: [...s.actions, { id: 'p1', kind: 'pass' as const, playerId: 'h1', toPlayerId: 'h3' }] }
    const sim = simulate(next)
    const f = sim.frames[Math.round(before.focusT / sim.dt)]
    expect(dist(f.players.h3, before.now.h3)).toBeLessThan(0.3)
    const after = editContext(next, 0, sim)
    expect(dist(after.simGeom.p1.from, before.now.h1)).toBeLessThan(0.5)
    expect(after.focusT).toBeGreaterThan(before.focusT)
    expect(after.nowCarriers.has('h3')).toBe(true)
  })

  it('a later instruction for another player waits out the look-ahead time first', () => {
    const s = template('3v2')
    s.actions = [{ id: 's1', kind: 'skate', playerId: 'h1', speed: 'fast', path: [{ x: 4, y: 0 }, { x: 9, y: 1 }] }]
    const before = editContext(s, 0, simulate(s))
    const next = {
      ...s,
      actions: [
        ...s.actions,
        { id: 'w', kind: 'play' as const, playerId: 'h2', seconds: before.focusT },
        { id: 's2', kind: 'skate' as const, playerId: 'h2', speed: 'fast' as const, path: [{ x: 14, y: -9 }] },
      ],
    }
    const sim = simulate(next)
    const f = sim.frames[Math.round(before.focusT / sim.dt)]
    expect(dist(f.players.h2, before.now.h2)).toBeLessThan(0.3)
  })

  it('a receiver who plays on until the look-ahead time keeps the puck for his next skate', () => {
    const s = template('3v2')
    s.actions = [
      { id: 's1', kind: 'skate', playerId: 'h1', speed: 'normal', path: [{ x: 4, y: 0.5 }, { x: 9, y: 2 }] },
      { id: 'p1', kind: 'pass', playerId: 'h1', toPlayerId: 'h3' },
    ]
    const before = editContext(s, 0, simulate(s))
    s.actions = [
      ...s.actions,
      { id: 'w', kind: 'play', playerId: 'h3', seconds: before.focusT, keepPuck: true },
      { id: 's2', kind: 'skate', playerId: 'h3', speed: 'normal', path: [{ x: 14, y: 6 }, { x: 19, y: 2 }] },
    ]
    const sim = simulate(s)
    const f = sim.frames[Math.round((sim.actionEnds.s2 - 0.2) / sim.dt)]
    expect(f.pucks.k1.c).toBe('h3')
  })
})
