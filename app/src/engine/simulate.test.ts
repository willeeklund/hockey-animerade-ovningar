import { describe, expect, it } from 'vitest'
import type { Scenario } from '../model/types'
import { simulate } from './simulate'
import { dist } from './vec'
import { template } from '../editor/templates'
import { clampToField, FIELDS } from '../model/rink'

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

  it('zone play keeps everyone inside the zone and produces shots', () => {
    for (const key of ['zone2v2', 'zone3v3'] as const) {
      const s = template(key)
      s.settings.durationSec = 15
      const r = simulate(s)
      for (const f of r.frames) for (const p of Object.values(f.players)) {
        expect(clampToField(FIELDS.zone, p, 0.4).normal).toBeNull()
      }
      expect(r.events.some((e) => e.kind === 'shot')).toBe(true)
    }
  })

  it('a new round keeps everything before it and then follows the new instructions', () => {
    const s = template('3v2')
    s.settings.durationSec = 6
    const before = simulate(s)
    const startT = 2
    const idx = Math.round(startT / before.dt)
    const at = before.frames[idx].players.h2
    const target = { x: at.x + 6, y: at.y + 6 }
    s.rounds = [{ id: 'r2', startT, actions: [{ id: 'k', kind: 'skate', playerId: 'h2', speed: 'fast', path: [{ x: at.x + 3, y: at.y + 3 }, target] }] }]
    const after = simulate(s)
    expect(after.duration).toBeCloseTo(startT + 6, 5)
    expect(JSON.stringify(after.frames.slice(0, idx + 1))).toBe(JSON.stringify(before.frames.slice(0, idx + 1)))
    const reached = after.frames.slice(idx).some((f) => dist(f.players.h2, target) < 1)
    expect(reached).toBe(true)
  })

  it('skates at full speed along a straight one-point path', () => {
    const s = base()
    s.actions.push({ id: 's1', kind: 'skate', playerId: 'a', speed: 'normal', path: [{ x: 20, y: 0 }] })
    const r = simulate(s)
    expect(r.frames[Math.round(3 / r.dt)].players.a.x).toBeGreaterThan(10)
  })

  it('skates around a cone placed on the drawn path and still reaches the end', () => {
    const s = base()
    s.cones = [{ id: 'c1', pos: { x: 8, y: 0 } }]
    s.actions.push({ id: 's1', kind: 'skate', playerId: 'a', speed: 'normal', path: [{ x: 16, y: 0 }] })
    const r = simulate(s)
    let closest = Infinity
    for (const f of r.frames) closest = Math.min(closest, dist(f.players.a, { x: 8, y: 0 }))
    expect(closest).toBeGreaterThan(0.7)
    expect(dist(r.frames[r.frames.length - 1].players.a, { x: 16, y: 0 })).toBeLessThan(1.5)
  })

  it('bots steer around cones on their way to goal', () => {
    const s = template('2v1')
    s.cones = [6, 9, 12, 15].map((x, i) => ({ id: `c${i}`, pos: { x, y: -4 + (i % 2) * 2 } }))
    const r = simulate(s)
    for (const f of r.frames)
      for (const p of Object.values(f.players)) for (const c of s.cones) expect(dist(p, c.pos)).toBeGreaterThan(0.7)
    expect(r.events.some((e) => e.kind === 'shot')).toBe(true)
  })

  it('cone slalom template weaves around every cone and ends with a shot', () => {
    const s = template('slalom')
    const r = simulate(s)
    for (const c of s.cones!) expect(Math.min(...r.frames.map((f) => dist(f.players.h1, c.pos)))).toBeGreaterThan(1)
    expect(r.events.some((e) => e.kind === 'shot' && e.playerId === 'h1')).toBe(true)
  })
})
