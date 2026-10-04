import { create } from 'zustand'
import { DT } from '../engine/world'
import { clampToField, FIELDS } from '../model/rink'
import type { Action, Layout, Player, Role, Scenario, ScenarioSettings, SpeedKey, Team, Vec } from '../model/types'
import { applyMarks } from './marks'
import { emptyScenario, template, uid, type TemplateKey } from './templates'

export type Tool = 'select' | 'home' | 'away' | 'goalie' | 'puck' | 'cone' | 'mark' | 'skate' | 'pass' | 'shoot' | 'erase'

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type NewAction = DistributiveOmit<Action, 'id'>

export type Pending = { kind: 'pass' | 'shoot' | 'mark'; fromId: string } | null

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
  activeRound: number
  editing: boolean

  setTool: (t: Tool) => void
  setDrawSpeed: (s: SpeedKey) => void
  select: (id: string | null) => void
  setPending: (p: Pending) => void
  setMessage: (m: string | null) => void
  checkpoint: () => void
  addPlayer: (team: Team, role: Role, pos: Vec) => void
  addPuck: (pos: Vec) => void
  addCone: (pos: Vec) => void
  moveObject: (id: string, pos: Vec) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  removeObject: (id: string) => void
  addAction: (a: NewAction) => void
  addMark: (markerId: string, targetId: string) => void
  setFocus: (id: string | null) => void
  clearActions: (playerId: string) => void
  updateSettings: (patch: Partial<ScenarioSettings>) => void
  setLayout: (layout: Layout) => void
  rename: (name: string) => void
  undo: () => void
  redo: () => void
  load: (s: Scenario) => void
  loadTemplate: (k: TemplateKey) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  togglePlay: (duration: number) => void
  scrub: (t: number) => void
  selectRound: (index: number) => void
  deleteRound: (index: number) => void
  beginEditHere: () => void
  setRate: (r: number) => void
  toggle: (k: 'showPaths' | 'showTrails') => void
}

function nextLabel(players: Player[], team: Team) {
  const used = new Set(players.filter((p) => p.team === team).map((p) => p.label))
  for (let n = 1; n < 100; n++) if (!used.has(String(n))) return String(n)
  return '?'
}

function roundStart(s: Scenario, index: number) {
  return index === 0 ? 0 : (s.rounds?.[index - 1]?.startT ?? 0)
}

function clampRound(s: Scenario, index: number) {
  return Math.min(index, s.rounds?.length ?? 0)
}

function mapRoundActions(s: Scenario, index: number, fn: (a: Action[]) => Action[]): Scenario {
  if (index === 0) return { ...s, actions: fn(s.actions) }
  return { ...s, rounds: (s.rounds ?? []).map((r, i) => (i === index - 1 ? { ...r, actions: fn(r.actions) } : r)) }
}

function mapAllActions(s: Scenario, fn: (a: Action[]) => Action[]): Scenario {
  return { ...s, actions: fn(s.actions), rounds: s.rounds?.map((r) => ({ ...r, actions: fn(r.actions) })) }
}

const notInvolving = (id: string) => (as: Action[]) =>
  as.filter((a) => a.playerId !== id && !(a.kind === 'pass' && a.toPlayerId === id) && !(a.kind === 'mark' && a.targetId === id))

const notBy = (id: string) => (as: Action[]) => as.filter((a) => a.playerId !== id && !(a.kind === 'pass' && a.toPlayerId === id))

export const useEditor = create<EditorState>((set, get) => {
  const mutate = (fn: (s: Scenario) => Scenario, checkpoint = true) =>
    set((st) => {
      const scenario = applyMarks({ ...fn(st.scenario), updatedAt: new Date().toISOString() })
      const activeRound = clampRound(scenario, st.activeRound)
      return {
        scenario,
        past: checkpoint ? [...st.past.slice(-80), st.scenario] : st.past,
        future: checkpoint ? [] : st.future,
        activeRound,
        time: roundStart(scenario, activeRound),
        playing: false,
        editing: true,
      }
    })

  const restore = (scenario: Scenario, activeRound: number) => {
    const r = clampRound(scenario, activeRound)
    return { scenario, activeRound: r, time: roundStart(scenario, r), playing: false, editing: true, pending: null }
  }

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
    activeRound: 0,
    editing: true,

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
    addCone: (pos) => mutate((s) => ({ ...s, cones: [...(s.cones ?? []), { id: uid(), pos }] })),
    moveObject: (id, pos) =>
      mutate(
        (s) => ({
          ...s,
          players: s.players.map((p) => (p.id === id ? { ...p, pos } : p)),
          pucks: s.pucks.map((k) => (k.id === id ? { ...k, pos } : k)),
          cones: s.cones?.map((c) => (c.id === id ? { ...c, pos } : c)),
        }),
        false,
      ),
    updatePlayer: (id, patch) => mutate((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    removeObject: (id) => {
      mutate((s) => ({
        ...mapAllActions(s, notInvolving(id)),
        players: s.players.filter((p) => p.id !== id),
        pucks: s.pucks.filter((k) => k.id !== id),
        cones: s.cones?.filter((c) => c.id !== id),
        focusId: s.focusId === id ? undefined : s.focusId,
      }))
      if (get().selectedId === id) set({ selectedId: null })
    },
    addAction: (a) => mutate((s) => mapRoundActions(s, get().activeRound, (as) => [...as, { ...a, id: uid() } as Action])),
    clearActions: (playerId) => mutate((s) => mapRoundActions(s, get().activeRound, notBy(playerId))),
    addMark: (markerId, targetId) =>
      mutate((s) =>
        mapRoundActions(s, get().activeRound, (as) => [
          ...as.filter((a) => !(a.kind === 'mark' && a.playerId === markerId)),
          { id: uid(), kind: 'mark', playerId: markerId, targetId },
        ]),
      ),
    updateSettings: (patch) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    setLayout: (layout) =>
      mutate((s) => {
        const f = FIELDS[layout]
        const fit = (p: Vec) => clampToField(f, p, 0.6).pos
        return {
          ...mapAllActions(s, (as) => as.map((a) => (a.kind === 'skate' ? { ...a, path: a.path.map(fit) } : a))),
          settings: { ...s.settings, layout },
          players: s.players.map((p) =>
            p.role === 'G' ? { ...p, pos: { x: Math.sign(p.pos.x || 1) * (f.goalLineX - 1), y: 0 } } : { ...p, pos: fit(p.pos) },
          ),
          pucks: s.pucks.map((k) => ({ ...k, pos: fit(k.pos) })),
          cones: s.cones?.map((c) => ({ ...c, pos: fit(c.pos) })),
        }
      }),
    rename: (name) => mutate((s) => ({ ...s, name }), false),

    undo: () =>
      set((st) => {
        const prev = st.past[st.past.length - 1]
        if (!prev) return {}
        return { ...restore(prev, st.activeRound), past: st.past.slice(0, -1), future: [st.scenario, ...st.future] }
      }),
    redo: () =>
      set((st) => {
        const next = st.future[0]
        if (!next) return {}
        return { ...restore(next, st.activeRound), past: [...st.past, st.scenario], future: st.future.slice(1) }
      }),
    load: (scenario) => set({ ...restore(applyMarks(scenario), 0), past: [], future: [], selectedId: null }),
    loadTemplate: (k) => get().load(k === 'empty' ? emptyScenario() : template(k)),
    setTime: (time) => set({ time }),
    setPlaying: (playing) => set((st) => ({ playing, editing: playing ? false : st.editing })),
    togglePlay: (duration) =>
      set((st) => {
        if (st.playing) return { playing: false }
        const time = st.time >= duration - DT / 2 ? 0 : st.time
        return { playing: true, editing: false, time, pending: null }
      }),
    scrub: (time) => set({ time, playing: false, editing: false, pending: null }),
    selectRound: (index) => set((st) => restore(st.scenario, index)),
    deleteRound: (index) => {
      if (index === 0) return
      mutate((s) => ({ ...s, rounds: (s.rounds ?? []).filter((_, i) => i !== index - 1) }))
      set((st) => restore(st.scenario, Math.min(st.activeRound, index - 1)))
    },
    beginEditHere: () => {
      const st = get()
      if (st.editing && !st.playing) return
      const t = Math.round(st.time / DT) * DT
      const rounds = st.scenario.rounds ?? []
      if (t < DT / 2) return st.selectRound(0)
      const existing = rounds.findIndex((r) => Math.abs(r.startT - t) < DT / 2)
      if (existing >= 0) return st.selectRound(existing + 1)
      const kept = rounds.filter((r) => r.startT < t)
      set({ activeRound: kept.length + 1 })
      mutate((s) => ({ ...s, rounds: [...kept, { id: uid(), startT: t, actions: [] }] }))
    },
    setRate: (rate) => set({ rate }),
    setFocus: (id) =>
      set((st) => ({
        scenario: { ...st.scenario, focusId: id ?? undefined, updatedAt: new Date().toISOString() },
        past: [...st.past.slice(-80), st.scenario],
        future: [],
      })),
    toggle: (k) => set((st) => ({ [k]: !st[k] }) as Partial<EditorState>),
  }
})
