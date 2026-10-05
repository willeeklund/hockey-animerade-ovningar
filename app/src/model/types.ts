export type Vec = { x: number; y: number }

export type Team = 'home' | 'away'
export type Role = 'F' | 'D' | 'G' | 'C'
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
  idle?: boolean
}

export interface Puck {
  id: string
  pos: Vec
}

export interface Cone {
  id: string
  pos: Vec
}

export interface Goal {
  id: string
  pos: Vec
  angle: number
}

export interface Divider {
  id: string
  pos: Vec
  angle: number
}

export type Action =
  | { id: string; kind: 'skate'; playerId: string; path: Vec[]; speed: SpeedKey }
  | { id: string; kind: 'pass'; playerId: string; toPlayerId: string }
  | { id: string; kind: 'shoot'; playerId: string; goal: Side; goalId?: string }
  | { id: string; kind: 'wait'; playerId: string; seconds: number }
  | { id: string; kind: 'mark'; playerId: string; targetId: string }

export interface Round {
  id: string
  startT: number
  actions: Action[]
  homeAttacks?: Side
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
  dividers?: Divider[]
  goals?: Goal[]
  actions: Action[]
  rounds?: Round[]
  focusId?: string
  notes?: string
  settings: ScenarioSettings
}

export interface TrainingPass {
  name: string
  notes?: string
  scenarios: Scenario[]
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

export type SimEventKind = 'pass' | 'shot' | 'goal' | 'save' | 'rebound' | 'steal' | 'pickup' | 'offside'

export interface SimEvent {
  t: number
  kind: SimEventKind
  playerId?: string
}
