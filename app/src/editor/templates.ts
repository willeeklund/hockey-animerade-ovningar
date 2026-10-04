import type { Player, Role, Scenario, Team } from '../model/types'

export const uid = () => Math.random().toString(36).slice(2, 10)

export type TemplateKey = 'empty' | '2v1' | '3v2' | '5v5' | 'zone2v2' | 'zone3v3'

export const TEMPLATE_NAMES: Record<TemplateKey, string> = {
  empty: 'Tom rink',
  '2v1': '2 mot 1',
  '3v2': '3 mot 2',
  '5v5': '5 mot 5 (anfall)',
  zone2v2: 'Zonspel 2 mot 2',
  zone3v3: 'Zonspel 3 mot 3',
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
  s.name = TEMPLATE_NAMES[key]
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
  } else if (key === 'zone2v2' || key === 'zone3v3') {
    s.settings.layout = 'zone'
    s.players = [
      pl('h1', 'home', 'F', '1', -5, -3),
      pl('h2', 'home', 'F', '2', -4, 5),
      pl('a1', 'away', 'F', '1', 5, -3),
      pl('a2', 'away', 'F', '2', 4, 5),
      pl('hg', 'home', 'G', 'G', -11, 0),
      pl('ag', 'away', 'G', 'G', 11, 0),
    ]
    if (key === 'zone3v3') {
      s.players.push(pl('h3', 'home', 'D', '3', -8, -7), pl('a3', 'away', 'D', '3', 8, -7))
    }
    s.pucks = [{ id: 'k1', pos: { x: -4.3, y: -3 } }]
  }
  return s
}
