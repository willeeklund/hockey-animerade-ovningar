export type Vec = { x: number; y: number }

export type Team = 'home' | 'away'
export type Role = 'F' | 'D' | 'G'
export type Side = 'left' | 'right'
export type SpeedKey = 'slow' | 'normal' | 'fast'
export type Layout = 'full' | 'zone'

export interface Player {
  id: string
  team: Team
  role: Role
  label: string
  pos: Vec
  heading: number
}

export interface Puck {
  id: string
  pos: Vec
}

export interface Cone {
  id: string
  pos: Vec
}

export type Action =
  | { id: string; kind: 'skate'; playerId: string; path: Vec[]; speed: SpeedKey }
  | { id: string; kind: 'pass'; playerId: string; toPlayerId: string }
  | { id: string; kind: 'shoot'; playerId: string; goal: Side }
  | { id: string; kind: 'wait'; playerId: string; seconds: number }

export interface Round {
  id: string
  startT: number
  actions: Action[]
}

export interface ScenarioSettings {
  durationSec: number
  seed: number
  autonomous: boolean
  homeAttacks: Side
  layout?: Layout
}

export interface Scenario {
  id: string
  name: string
  updatedAt: string
  players: Player[]
  pucks: Puck[]
  cones?: Cone[]
  actions: Action[]
  rounds?: Round[]
  settings: ScenarioSettings
}

export interface FramePlayer {
  x: number
  y: number
  h: number
}

export interface FramePuck {
  x: number
  y: number
  c: string | null
}

export interface Frame {
  t: number
  players: Record<string, FramePlayer>
  pucks: Record<string, FramePuck>
}

export type SimEventKind = 'pass' | 'shot' | 'goal' | 'save' | 'rebound' | 'steal' | 'pickup'

export interface SimEvent {
  t: number
  kind: SimEventKind
  playerId?: string
}
