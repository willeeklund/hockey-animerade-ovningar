import { describe, expect, it } from 'vitest'
import { defaultGoals, FIELDS } from '../model/rink'
import { placeGoalie } from './netView'
import { decide, dekeRoute, goalieRecovery, saveChance } from './duelPlay'

const goal = defaultGoals(FIELDS.full)[0]
const at = (puck: { x: number; y: number }, depth: number, lateral = 0) => ({ ...placeGoalie(goal, puck, { depth, lateral }), scale: 1 })

describe('duelPlay', () => {
  it('shoots straight away at an empty net or a goalie deep in the net', () => {
    const puck = { x: goal.pos.x + 8, y: 0 }
    expect(decide(goal, puck, undefined).kind).toBe('shoot')
    expect(decide(goal, puck, at(puck, 0.4)).kind).toBe('shoot')
  })

  it('skates around a goalie who comes far out', () => {
    const puck = { x: goal.pos.x + 6, y: 0 }
    expect(decide(goal, puck, at(puck, 3.5)).kind).toBe('deke')
  })

  it('goes around on the side the goalie leaves open', () => {
    const puck = { x: goal.pos.x + 6, y: 0 }
    const right = decide(goal, puck, at(puck, 3.5, 0.4))
    const left = decide(goal, puck, at(puck, 3.5, -0.4))
    expect(right.kind === 'deke' && left.kind === 'deke' && right.side === -left.side).toBe(true)
  })

  it('a goalie far out cannot get back in time', () => {
    const puck = { x: goal.pos.x + 6, y: 0 }
    const gk = at(puck, 3.5)
    const route = dekeRoute(goal, puck, gk, 1)
    const back = goalieRecovery(goal, gk, route.to, route.length / 6.2)
    const want = placeGoalie(goal, route.to, { depth: 0.7, lateral: 0 }).pos
    expect(Math.hypot(back.x - want.x, back.y - want.y)).toBeGreaterThan(0.3)
  })
})

describe('saveChance', () => {
  it('long shots are almost always saved', () => {
    expect(saveChance(14, 0.4)).toBeGreaterThan(0.85)
    expect(saveChance(10, 0.3)).toBeGreaterThan(0.85)
  })

  it('close shots into a hole usually go in', () => {
    expect(saveChance(4, 0.25)).toBeLessThan(0.1)
  })

  it('the further away the shooter, the better the goalie', () => {
    const near = saveChance(5, 0.3)
    const mid = saveChance(7, 0.3)
    const far = saveChance(9, 0.3)
    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
  })

  it('an empty net cannot be saved', () => {
    expect(saveChance(10, Infinity)).toBe(0)
  })
})
