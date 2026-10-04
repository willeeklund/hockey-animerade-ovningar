import { describe, expect, it } from 'vitest'
import type { Scenario } from '../model/types'
import { simulate } from './simulate'
import { dist } from './vec'
import { template } from '../editor/templates'

function base(): Scenario {
  return {
    id: 't',
    name: 't',
    updatedAt: '',
    players: [
      { id: 'a', team: 'home', role: 'F', label: '1', pos: { x: 0, y: 0 }, heading: 0 },
      { id: 'b', team: 'home', role: 'F', label: '2', pos: { x: 5, y: 8 }, heading: 0 },
    ],
    pucks: [{ id: 'k', pos: { x: 0.6, y: 0 } }],
    actions: [],
    settings: { durationSec: 8, seed: 1, autonomous: false, homeAttacks: 'right' },
  }
}

describe('simulate', () => {
  it('skater follows a drawn path to its end', () => {
    const s = base()
    s.actions.push({ id: 's1', kind: 'skate', playerId: 'a', speed: 'normal', path: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: -5 }] })
    const r = simulate(s)
    const last = r.frames[r.frames.length - 1].players.a
    expect(dist(last, { x: 15, y: -5 })).toBeLessThan(1.5)
  })

  it('passes the puck to a teammate', () => {
    const s = base()
    s.actions.push({ id: 'p1', kind: 'pass', playerId: 'a', toPlayerId: 'b' })
    const r = simulate(s)
    expect(r.events.some((e) => e.kind === 'pass' && e.playerId === 'a')).toBe(true)
    expect(r.frames[r.frames.length - 1].pucks.k.c).toBe('b')
  })

  it('is deterministic', () => {
    const s = template('3v2')
    s.settings.autonomous = true
    expect(JSON.stringify(simulate(s).frames.at(-1))).toBe(JSON.stringify(simulate(s).frames.at(-1)))
  })

  it('autonomous 2 vs 1 produces a shot', () => {
    const s = template('2v1')
    s.settings.autonomous = true
    const r = simulate(s)
    expect(r.events.some((e) => e.kind === 'shot')).toBe(true)
  })

  it('keeps everyone inside the rink', () => {
    const s = template('5v5')
    s.settings.autonomous = true
    const r = simulate(s)
    for (const f of r.frames) for (const p of Object.values(f.players)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(30)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(15)
    }
  })
})
