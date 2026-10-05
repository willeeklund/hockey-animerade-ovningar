import { describe, expect, it } from 'vitest'
import type { Scenario } from '../model/types'
import { simulate } from './simulate'
import { dist } from './vec'
import { template } from '../editor/templates'
import { clampToField, FIELDS } from '../model/rink'
import { applyMarks } from '../editor/marks'
import { closestOnSegment, dividerEnds } from './walls'

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

  it('markers stay goal-side of their man at a sensible gap while the opponents have the puck', () => {
    const s = applyMarks(template('mark3v3'))
    const r = simulate(s)
    const goal = { x: 26, y: 0 }
    const pairs = [['a1', 'h1'], ['a2', 'h2'], ['a3', 'h3']]
    let checked = 0
    let goalSide = 0
    let gapSum = 0
    for (const f of r.frames.slice(15)) {
      const carrier = f.pucks.k1.c
      if (!carrier?.startsWith('h')) continue
      for (const [m, t] of pairs) {
        const gap = dist(f.players[m], f.players[t])
        expect(gap).toBeGreaterThan(0.3)
        expect(gap).toBeLessThan(5.5)
        gapSum += gap
        checked++
        const man = f.players[t]
        const toGoal = { x: goal.x - man.x, y: goal.y - man.y }
        if ((f.players[m].x - man.x) * toGoal.x + (f.players[m].y - man.y) * toGoal.y > 0) goalSide++
      }
    }
    expect(checked).toBeGreaterThan(60)
    expect(goalSide / checked).toBeGreaterThan(0.9)
    expect(gapSum / checked).toBeGreaterThan(1.8)
    expect(gapSum / checked).toBeLessThan(4)
  })

  it('a marking player follows when the coach moves the opponent in edit mode', () => {
    const s = applyMarks(template('mark3v3'))
    const before = s.players.find((p) => p.id === 'a2')!.pos
    const moved = applyMarks({ ...s, players: s.players.map((p) => (p.id === 'h2' ? { ...p, pos: { x: 8, y: -11 } } : p)) })
    const after = moved.players.find((p) => p.id === 'a2')!.pos
    expect(dist(before, after)).toBeGreaterThan(3)
    expect(dist(after, { x: 8, y: -11 })).toBeLessThan(3.6)
    expect(dist(after, { x: 26, y: 0 })).toBeLessThan(dist({ x: 8, y: -11 }, { x: 26, y: 0 }))
  })

  it('attackers without the puck stay onside until the puck crosses the offensive blue line', () => {
    for (const key of ['2v1', '3v2', '5v5'] as const) {
      const s = template(key)
      const r = simulate(s)
      expect(r.events.filter((e) => e.kind === 'offside')).toEqual([])
      for (const f of r.frames) {
        const puck = f.pucks.k1
        if (!puck.c?.startsWith('h') || puck.x > 7.5) continue
        for (const [id, p] of Object.entries(f.players)) {
          if (id.startsWith('h') && id !== puck.c && id !== 'hg') expect(p.x).toBeLessThan(7.8)
        }
      }
    }
  })

  it('a drawn winger racing ahead waits at the blue line and continues once the puck is in', () => {
    const s = base()
    s.players[1].pos = { x: 0, y: 8 }
    s.actions.push(
      { id: 'c', kind: 'skate', playerId: 'a', speed: 'slow', path: [{ x: 15, y: 0 }] },
      { id: 'w', kind: 'skate', playerId: 'b', speed: 'fast', path: [{ x: 18, y: 8 }] },
    )
    const r = simulate(s)
    const entered = r.frames.findIndex((f) => f.pucks.k.x > 7.5)
    expect(entered).toBeGreaterThan(0)
    for (const f of r.frames.slice(0, entered)) expect(f.players.b.x).toBeLessThan(7.5)
    expect(r.frames.some((f) => f.players.b.x > 15)).toBe(true)
    expect(r.events.filter((e) => e.kind === 'offside')).toEqual([])
  })

  it('a puck dropped on a player sticks to the stick and follows when the player is dragged', async () => {
    const { useEditor } = await import('../editor/store')
    const st = useEditor.getState()
    st.loadTemplate('2v1')
    const puckId = useEditor.getState().scenario.pucks[0].id
    useEditor.getState().moveObject(puckId, { x: 2.9, y: -3.4 })
    useEditor.getState().snapPuck(puckId)
    const snapped = useEditor.getState().scenario.pucks[0].pos
    expect(dist(snapped, { x: 2.7, y: -4 })).toBeLessThan(0.05)
    useEditor.getState().moveObject('h1', { x: -6, y: 5 }, [puckId])
    const moved = useEditor.getState().scenario.pucks[0].pos
    expect(dist(moved, { x: -5.3, y: 5 })).toBeLessThan(0.05)
    useEditor.getState().moveObject('h2', { x: -5, y: 5.5 }, [])
    expect(dist(useEditor.getState().scenario.pucks[0].pos, moved)).toBeLessThan(0.05)
  })

  it('skates around the end of a row of rink dividers instead of through it', () => {
    const s = base()
    s.dividers = [-2, 0, 2].map((y, i) => ({ id: `d${i}`, pos: { x: 8, y }, angle: Math.PI / 2 }))
    s.actions.push({ id: 's1', kind: 'skate', playerId: 'a', speed: 'normal', path: [{ x: 16, y: 0 }] })
    s.settings.durationSec = 10
    const r = simulate(s)
    for (const f of r.frames)
      for (const d of s.dividers) {
        const [a, b] = dividerEnds(d)
        expect(dist(f.players.a, closestOnSegment(f.players.a, a, b))).toBeGreaterThan(0.5)
      }
    expect(r.frames.some((f) => dist(f.players.a, { x: 16, y: 0 }) < 1.5)).toBe(true)
  })

  it('a pass into a rink divider bounces back instead of going through', () => {
    const s = base()
    s.players[1].pos = { x: 10, y: 0 }
    s.dividers = [{ id: 'd1', pos: { x: 5, y: 0 }, angle: Math.PI / 2 }]
    s.actions.push({ id: 'p1', kind: 'pass', playerId: 'a', toPlayerId: 'b' })
    s.settings.autonomous = false
    const r = simulate(s)
    expect(r.frames.every((f) => f.pucks.k.x < 5)).toBe(true)
    expect(r.frames.at(-1)!.pucks.k.c).not.toBe('b')
  })

  it('presents a training session playlist and restores the edited scenario afterwards', async () => {
    const { useEditor } = await import('../editor/store')
    const get = useEditor.getState
    get().loadTemplate('2v1')
    get().addToPlaylist()
    const first = get().scenario.id
    get().loadTemplate('3v2')
    get().addToPlaylist()
    const second = get().scenario.id
    get().loadTemplate('slalom')
    get().addCone({ x: 0, y: 5 })
    const editing = get().scenario
    const historyLength = get().past.length

    get().enterPresentation(get().playlist.ids[0])
    expect(get().presenting).toBe(true)
    expect(get().scenario.id).toBe(first)
    get().present(second)
    expect(get().scenario.name).toBe('3 mot 2')

    get().exitPresentation()
    expect(get().presenting).toBe(false)
    expect(get().scenario).toBe(editing)
    expect(get().past.length).toBe(historyLength)
    expect(get().playlist.ids.slice(-2)).toEqual([first, second])
  })
})
