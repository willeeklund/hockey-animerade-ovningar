import { create } from 'zustand'
import type { Action, Player, Role, Scenario, ScenarioSettings, SpeedKey, Team, Vec } from '../model/types'
import { emptyScenario, template, uid, type TemplateKey } from './templates'

export type Tool = 'select' | 'home' | 'away' | 'goalie' | 'puck' | 'skate' | 'pass' | 'shoot' | 'erase'

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type NewAction = DistributiveOmit<Action, 'id'>

export type Pending = { kind: 'pass' | 'shoot'; fromId: string } | null

interface EditorState {
  scenario: Scenario
  past: Scenario[]
  future: Scenario[]
  tool: Tool
  drawSpeed: SpeedKey
  selectedId: string | null
  pending: Pending
  message: string | null
  time: number
  playing: boolean
  rate: number
  showPaths: boolean
  showTrails: boolean

  setTool: (t: Tool) => void
  setDrawSpeed: (s: SpeedKey) => void
  select: (id: string | null) => void
  setPending: (p: Pending) => void
  setMessage: (m: string | null) => void
  checkpoint: () => void
  addPlayer: (team: Team, role: Role, pos: Vec) => void
  addPuck: (pos: Vec) => void
  moveObject: (id: string, pos: Vec) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  removeObject: (id: string) => void
  addAction: (a: NewAction) => void
  clearActions: (playerId: string) => void
  updateSettings: (patch: Partial<ScenarioSettings>) => void
  rename: (name: string) => void
  undo: () => void
  redo: () => void
  load: (s: Scenario) => void
  loadTemplate: (k: TemplateKey) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setRate: (r: number) => void
  toggle: (k: 'showPaths' | 'showTrails') => void
}

function nextLabel(players: Player[], team: Team) {
  const used = new Set(players.filter((p) => p.team === team).map((p) => p.label))
  for (let n = 1; n < 100; n++) if (!used.has(String(n))) return String(n)
  return '?'
}

export const useEditor = create<EditorState>((set, get) => {
  const mutate = (fn: (s: Scenario) => Scenario, checkpoint = true) =>
    set((st) => ({
      scenario: { ...fn(st.scenario), updatedAt: new Date().toISOString() },
      past: checkpoint ? [...st.past.slice(-80), st.scenario] : st.past,
      future: checkpoint ? [] : st.future,
      time: 0,
      playing: false,
    }))

  return {
    scenario: template('3v2'),
    past: [],
    future: [],
    tool: 'select',
    drawSpeed: 'normal',
    selectedId: null,
    pending: null,
    message: null,
    time: 0,
    playing: false,
    rate: 1,
    showPaths: true,
    showTrails: true,

    setTool: (tool) => set({ tool, pending: null, message: null }),
    setDrawSpeed: (drawSpeed) => set({ drawSpeed }),
    select: (selectedId) => set({ selectedId }),
    setPending: (pending) => set({ pending }),
    setMessage: (message) => set({ message }),
    checkpoint: () => set((st) => ({ past: [...st.past.slice(-80), st.scenario], future: [] })),

    addPlayer: (team, role, pos) => {
      const id = uid()
      mutate((s) => ({
        ...s,
        players: [
          ...s.players,
          { id, team, role, pos, label: role === 'G' ? 'G' : nextLabel(s.players, team), heading: team === 'home' ? 0 : Math.PI },
        ],
      }))
      set({ selectedId: id })
    },
    addPuck: (pos) => mutate((s) => ({ ...s, pucks: [...s.pucks, { id: uid(), pos }] })),
    moveObject: (id, pos) =>
      mutate(
        (s) => ({
          ...s,
          players: s.players.map((p) => (p.id === id ? { ...p, pos } : p)),
          pucks: s.pucks.map((k) => (k.id === id ? { ...k, pos } : k)),
        }),
        false,
      ),
    updatePlayer: (id, patch) => mutate((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    removeObject: (id) => {
      mutate((s) => ({
        ...s,
        players: s.players.filter((p) => p.id !== id),
        pucks: s.pucks.filter((k) => k.id !== id),
        actions: s.actions.filter((a) => a.playerId !== id && !(a.kind === 'pass' && a.toPlayerId === id)),
      }))
      if (get().selectedId === id) set({ selectedId: null })
    },
    addAction: (a) => mutate((s) => ({ ...s, actions: [...s.actions, { ...a, id: uid() } as Action] })),
    clearActions: (playerId) =>
      mutate((s) => ({ ...s, actions: s.actions.filter((a) => a.playerId !== playerId && !(a.kind === 'pass' && a.toPlayerId === playerId)) })),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    rename: (name) => mutate((s) => ({ ...s, name }), false),

    undo: () =>
      set((st) => {
        const prev = st.past[st.past.length - 1]
        if (!prev) return {}
        return { scenario: prev, past: st.past.slice(0, -1), future: [st.scenario, ...st.future], time: 0, playing: false }
      }),
    redo: () =>
      set((st) => {
        const next = st.future[0]
        if (!next) return {}
        return { scenario: next, past: [...st.past, st.scenario], future: st.future.slice(1), time: 0, playing: false }
      }),
    load: (scenario) => set({ scenario, past: [], future: [], time: 0, playing: false, selectedId: null, pending: null }),
    loadTemplate: (k) => get().load(k === 'empty' ? emptyScenario() : template(k)),
    setTime: (time) => set({ time }),
    setPlaying: (playing) => set({ playing }),
    setRate: (rate) => set({ rate }),
    toggle: (k) => set((st) => ({ [k]: !st[k] }) as Partial<EditorState>),
  }
})
