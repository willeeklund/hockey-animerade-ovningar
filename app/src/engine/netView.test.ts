import { describe, expect, it } from 'vitest'
import { defaultGoals, FIELDS } from '../model/rink'
import { adjustOf, netView, placeGoalie } from './netView'

const goal = defaultGoals(FIELDS.full)[0]
const puck = { x: goal.pos.x + 8, y: 0 }
const goalieAt = (depth: number, lateral = 0) => ({ ...placeGoalie(goal, puck, { depth, lateral }), scale: 1 })

describe('netView', () => {
  it('shows the whole net when there is no goalie', () => {
    expect(netView(goal, puck, undefined).open).toBe(1)
  })

  it('closes the net as the goalie steps out toward the shooter', () => {
    const deep = netView(goal, puck, goalieAt(0.4)).open
    const mid = netView(goal, puck, goalieAt(1.5)).open
    const far = netView(goal, puck, goalieAt(3)).open
    expect(deep).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(far)
  })

  it('opens the far side when the goalie is off the angle line', () => {
    expect(netView(goal, puck, goalieAt(1.2, 0.7)).open).toBeGreaterThan(netView(goal, puck, goalieAt(1.2, 0)).open)
  })

  it('round-trips the goalie adjustment', () => {
    const placed = placeGoalie(goal, puck, { depth: 1.3, lateral: -0.4 })
    const a = adjustOf(goal, puck, placed.pos)
    expect(a.depth).toBeCloseTo(1.3)
    expect(a.lateral).toBeCloseTo(-0.4)
  })
})

describe('findDuel', () => {
  it('uses the goalie in the attacked goal even when it is a teammate', async () => {
    const { template } = await import('../editor/templates')
    const { simulate } = await import('./simulate')
    const { findDuel } = await import('./netView')
    const { goalsOf } = await import('../model/rink')
    const s = template('goalieSwap')
    const sim = simulate(s)
    const shot = sim.events.find((e) => e.kind === 'shot')!
    const frame = sim.frames[Math.round((shot.t - 0.4) / sim.dt)]
    const duel = findDuel(frame, s.players, goalsOf(s), s.settings, null)
    expect(duel?.shooterId).toBe('h1')
    expect(duel?.goalieId).toBe('hg')
    expect(duel?.goal.pos.x).toBeLessThan(0)
  })
})
