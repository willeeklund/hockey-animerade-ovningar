import { FIELDS } from '../model/rink'
import type { Layout, Player, Role, Scenario, Team } from '../model/types'

const ZONE_GOAL_Y = FIELDS.zone.goalY

export const uid = () => Math.random().toString(36).slice(2, 10)

export type TemplateKey =
  | 'empty'
  | '2v1'
  | '3v2'
  | '1v1gap'
  | 'breakout'
  | '5v5'
  | 'pp54'
  | 'mark3v3'
  | 'slalom'
  | 'emptyZone'
  | 'zone1v1'
  | 'zone2v2'
  | 'zone3v2'
  | 'zone3v3'

export const TEMPLATE_NAMES: Record<TemplateKey, string> = {
  empty: 'Tom rink',
  '2v1': '2 mot 1',
  '3v2': '3 mot 2',
  '1v1gap': '1 mot 1, gap control',
  breakout: 'Uppspel mot forechecking',
  '5v5': '5 mot 5 (anfall)',
  pp54: 'Powerplay 5 mot 4',
  mark3v3: 'Markering 3 mot 3',
  slalom: 'Konslalom + skott',
  emptyZone: 'Tom zon',
  zone1v1: '1 mot 1',
  zone2v2: '2 mot 2',
  zone3v2: '3 mot 2 (överläge)',
  zone3v3: '3 mot 3',
}

export const TEMPLATE_GROUPS: Record<Layout, TemplateKey[]> = {
  full: ['empty', '2v1', '3v2', '1v1gap', 'breakout', '5v5', 'pp54', 'mark3v3', 'slalom'],
  zone: ['emptyZone', 'zone1v1', 'zone2v2', 'zone3v2', 'zone3v3'],
}

function pl(id: string, team: Team, role: Role, label: string, x: number, y: number): Player {
  return { id, team, role, label, pos: { x, y }, heading: team === 'home' ? 0 : Math.PI }
}

export function emptyScenario(): Scenario {
  return {
    id: uid(),
    name: 'Nytt scenario',
    updatedAt: new Date().toISOString(),
    players: [],
    pucks: [],
    actions: [],
    settings: { durationSec: 10, seed: 1, autonomous: true, homeAttacks: 'right' },
  }
}

export function template(key: TemplateKey): Scenario {
  const s = emptyScenario()
  s.name = TEMPLATE_GROUPS.zone.includes(key) && key !== 'emptyZone' ? `Zonspel ${TEMPLATE_NAMES[key]}` : TEMPLATE_NAMES[key]
  const awayG = pl('ag', 'away', 'G', 'G', 25, 0)
  if (key === '2v1') {
    s.players = [pl('h1', 'home', 'F', '9', 2, -4), pl('h2', 'home', 'F', '17', 2, 6), pl('a1', 'away', 'D', '4', 12, 0), awayG]
    s.pucks = [{ id: 'k1', pos: { x: 2.7, y: -4 } }]
  } else if (key === '3v2') {
    s.players = [
      pl('h1', 'home', 'F', 'C', 0, 0),
      pl('h2', 'home', 'F', 'LW', -1, -8),
      pl('h3', 'home', 'F', 'RW', -1, 8),
      pl('a1', 'away', 'D', 'LD', 12, 4),
      pl('a2', 'away', 'D', 'RD', 12, -4),
      awayG,
    ]
    s.pucks = [{ id: 'k1', pos: { x: 0.7, y: 0 } }]
  } else if (key === '5v5') {
    s.players = [
      pl('h1', 'home', 'F', 'C', 10, 0),
      pl('h2', 'home', 'F', 'LW', 12, -9),
      pl('h3', 'home', 'F', 'RW', 12, 9),
      pl('h4', 'home', 'D', 'LD', 2, -6),
      pl('h5', 'home', 'D', 'RD', 2, 6),
      pl('hg', 'home', 'G', 'G', -25, 0),
      pl('a1', 'away', 'F', 'C', 14, 0),
      pl('a2', 'away', 'F', 'LW', 13, 7),
      pl('a3', 'away', 'F', 'RW', 13, -7),
      pl('a4', 'away', 'D', 'LD', 19, 4),
      pl('a5', 'away', 'D', 'RD', 19, -4),
      awayG,
    ]
    s.pucks = [{ id: 'k1', pos: { x: 10.7, y: 0 } }]
  } else if (key === '1v1gap') {
    s.players = [pl('h1', 'home', 'F', '9', -8, -6), pl('a1', 'away', 'D', '4', 6, -3), awayG]
    s.pucks = [{ id: 'k1', pos: { x: -7.3, y: -6 } }]
    s.actions = [
      { id: 'm1', kind: 'mark', playerId: 'a1', targetId: 'h1' },
      { id: 's1', kind: 'skate', playerId: 'h1', speed: 'fast', path: [{ x: 4, y: -9 }, { x: 14, y: -9 }, { x: 20, y: -4 }] },
      { id: 'p1', kind: 'shoot', playerId: 'h1', goal: 'right' },
    ]
  } else if (key === 'breakout') {
    s.players = [
      pl('hg', 'home', 'G', 'G', -25, 0),
      pl('h4', 'home', 'D', 'LD', -28.3, -2),
      pl('h5', 'home', 'D', 'RD', -23, 6),
      pl('h2', 'home', 'F', 'LW', -19, -12.5),
      pl('h1', 'home', 'F', 'C', -21, -3),
      pl('h3', 'home', 'F', 'RW', -19, 12.5),
      pl('a1', 'away', 'F', 'F1', -17, -4),
      pl('a2', 'away', 'F', 'F2', -12, 4),
      awayG,
    ]
    s.pucks = [{ id: 'k1', pos: { x: -27.7, y: -2 } }]
    s.actions = [
      { id: 's1', kind: 'skate', playerId: 'h4', speed: 'normal', path: [{ x: -27.5, y: -5 }, { x: -25, y: -8 }] },
      { id: 'w1', kind: 'wait', playerId: 'h2', seconds: 1.4 },
      { id: 'w2', kind: 'wait', playerId: 'h1', seconds: 1 },
      { id: 'p1', kind: 'pass', playerId: 'h4', toPlayerId: 'h2' },
      { id: 's2', kind: 'skate', playerId: 'h2', speed: 'fast', path: [{ x: -12, y: -12.5 }, { x: -2, y: -11 }] },
      { id: 's3', kind: 'skate', playerId: 'h1', speed: 'fast', path: [{ x: -15, y: -6 }, { x: -5, y: -4 }] },
    ]
  } else if (key === 'pp54') {
    s.players = [
      pl('h4', 'home', 'D', 'D', 9, 0),
      pl('h2', 'home', 'F', 'LW', 16, -9),
      pl('h3', 'home', 'F', 'RW', 16, 9),
      pl('h1', 'home', 'F', 'C', 16.5, 0),
      pl('h5', 'home', 'F', 'NF', 23, 1),
      pl('a1', 'away', 'F', '1', 13, -4),
      pl('a2', 'away', 'F', '2', 13, 4),
      pl('a3', 'away', 'D', '3', 19.5, -3.5),
      pl('a4', 'away', 'D', '4', 19.5, 3.5),
      awayG,
    ]
    s.pucks = [{ id: 'k1', pos: { x: 9.7, y: 0 } }]
  } else if (key === 'emptyZone') {
    s.settings.layout = 'zone'
  } else if (key === 'zone1v1') {
    s.settings.layout = 'zone'
    s.players = [pl('h1', 'home', 'F', '1', -4, -2), pl('a1', 'away', 'F', '1', 4, 2), pl('hg', 'home', 'G', 'G', -11, ZONE_GOAL_Y), pl('ag', 'away', 'G', 'G', 11, ZONE_GOAL_Y)]
    s.pucks = [{ id: 'k1', pos: { x: -3.3, y: -2 } }]
  } else if (key === 'zone3v2') {
    s.settings.layout = 'zone'
    s.players = [
      pl('h1', 'home', 'F', '1', -5, -4),
      pl('h2', 'home', 'F', '2', -4, 5),
      pl('h3', 'home', 'D', '3', -8, 0),
      pl('a1', 'away', 'F', '1', 5, -3),
      pl('a2', 'away', 'F', '2', 4, 4),
      pl('hg', 'home', 'G', 'G', -11, ZONE_GOAL_Y),
      pl('ag', 'away', 'G', 'G', 11, ZONE_GOAL_Y),
    ]
    s.pucks = [{ id: 'k1', pos: { x: -4.3, y: -4 } }]
  } else if (key === 'zone2v2' || key === 'zone3v3') {
    s.settings.layout = 'zone'
    s.players = [
      pl('h1', 'home', 'F', '1', -5, -3),
      pl('h2', 'home', 'F', '2', -4, 5),
      pl('a1', 'away', 'F', '1', 5, -3),
      pl('a2', 'away', 'F', '2', 4, 5),
      pl('hg', 'home', 'G', 'G', -11, ZONE_GOAL_Y),
      pl('ag', 'away', 'G', 'G', 11, ZONE_GOAL_Y),
    ]
    if (key === 'zone3v3') {
      s.players.push(pl('h3', 'home', 'D', '3', -8, -7), pl('a3', 'away', 'D', '3', 8, -7))
    }
    s.pucks = [{ id: 'k1', pos: { x: -4.3, y: -3 } }]
  } else if (key === 'mark3v3') {
    s.players = [
      pl('h1', 'home', 'F', 'C', 12, 7),
      pl('h2', 'home', 'F', 'LW', 17, -8),
      pl('h3', 'home', 'D', 'D', 10, -2),
      pl('a1', 'away', 'F', 'C', 16, 5),
      pl('a2', 'away', 'D', 'LD', 20, -6),
      pl('a3', 'away', 'D', 'RD', 14, -1),
      awayG,
    ]
    s.pucks = [{ id: 'k1', pos: { x: 12.7, y: 7 } }]
    s.actions = [
      { id: 'm1', kind: 'mark', playerId: 'a1', targetId: 'h1' },
      { id: 'm2', kind: 'mark', playerId: 'a2', targetId: 'h2' },
      { id: 'm3', kind: 'mark', playerId: 'a3', targetId: 'h3' },
      { id: 's1', kind: 'skate', playerId: 'h1', speed: 'normal', path: [{ x: 17, y: 9 }, { x: 21, y: 6 }, { x: 20, y: 2 }] },
      { id: 'p1', kind: 'pass', playerId: 'h1', toPlayerId: 'h3' },
    ]
  } else if (key === 'slalom') {
    s.players = [pl('h1', 'home', 'F', '9', -6, 0), awayG]
    s.pucks = [{ id: 'k1', pos: { x: -5.3, y: 0 } }]
    s.cones = [-1, 5, 11].map((x, i) => ({ id: `c${i + 1}`, pos: { x, y: 0 } }))
    s.actions = [
      { id: 'a1', kind: 'skate', playerId: 'h1', speed: 'normal', path: [{ x: -1, y: 1.8 }, { x: 5, y: -1.8 }, { x: 11, y: 1.8 }, { x: 17, y: 0 }] },
      { id: 'a2', kind: 'shoot', playerId: 'h1', goal: 'right' },
    ]
  }
  return s
}
