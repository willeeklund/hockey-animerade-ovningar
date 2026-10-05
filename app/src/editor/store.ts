import { create } from 'zustand'
import { DT } from '../engine/world'
import { clampToField, DEFAULT_GOAL_IDS, defaultGoals, FIELDS, goalsOf } from '../model/rink'
import type { Action, Goal, Layout, Player, Role, Scenario, ScenarioSettings, Side, SpeedKey, Team, TrainingPass, Vec } from '../model/types'
import { add, fromAngle, sub } from '../engine/vec'
import { layoutDividers } from './dividers'
import { MY_PASS, SHARED_PASS, playlistItems, readLibrary, readPassSource, readPlaylist, writeLibrary, writePassSource, writePlaylist, type Playlist } from './storage'
import { applyMarks } from './marks'
import { initialCarrierMap } from './staticPlan'
import { emptyScenario, template, uid, type TemplateKey } from './templates'

export type Tool = 'select' | 'home' | 'away' | 'goalie' | 'coach' | 'goal' | 'puck' | 'cone' | 'divider' | 'mark' | 'skate' | 'pass' | 'shoot' | 'erase'

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type NewAction = DistributiveOmit<Action, 'id'>

export const PLACE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['home', 'away', 'goalie', 'coach', 'goal', 'puck', 'cone', 'divider', 'erase'])

export function placementAllowed(st: { editing: boolean; playing: boolean; activeRound: number }) {
  return st.editing && !st.playing && st.activeRound === 0
}

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
  library: Record<string, Scenario>
  playlist: Playlist
  passSource: string
  sharedPass: TrainingPass | null
  templateKey: TemplateKey | null
  presenting: boolean
  idle: boolean
  deck: Scenario[]
  stash: { scenario: Scenario; past: Scenario[]; future: Scenario[]; activeRound: number } | null

  saveCurrent: () => void
  deleteSaved: (id: string) => void
  addToPlaylist: (id?: string) => void
  removeFromPlaylist: (index: number) => void
  movePlaylistItem: (index: number, delta: number) => void
  renamePlaylist: (name: string) => void
  enterPresentation: (startId?: string, deck?: Scenario[]) => void
  importPass: (pass: TrainingPass) => void
  setIdle: (idle: boolean) => void
  setPassSource: (id: string) => void
  showSharedPass: (pass: TrainingPass) => void
  exitPresentation: () => void
  present: (id: string) => void
  setTool: (t: Tool) => void
  setDrawSpeed: (s: SpeedKey) => void
  select: (id: string | null) => void
  setPending: (p: Pending) => void
  setMessage: (m: string | null) => void
  checkpoint: () => void
  addPlayer: (team: Team, role: Role, pos: Vec) => void
  addPuck: (pos: Vec) => void
  addCone: (pos: Vec) => void
  addGoal: (pos: Vec) => void
  rotateGoal: (id: string) => void
  addDividers: (from: Vec, to: Vec) => void
  moveObject: (id: string, pos: Vec, withPucks?: string[]) => void
  snapPuck: (id: string) => void
  updatePlayer: (id: string, patch: Partial<Player>) => void
  removeObject: (id: string) => void
  addAction: (a: NewAction) => void
  addMark: (markerId: string, targetId: string) => void
  setFocus: (id: string | null) => void
  clearActions: (playerId: string) => void
  updateSettings: (patch: Partial<ScenarioSettings>) => void
  setLayout: (layout: Layout) => void
  rename: (name: string) => void
  setNotes: (notes: string) => void
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
  setRoundDirection: (index: number, side: Side | undefined) => void
  setEnd: (t: number) => void
  beginEditHere: () => void
  setRate: (r: number) => void
  toggle: (k: 'showPaths' | 'showTrails') => void
}

function withGoal(s: Scenario, id: string, fn: (g: Goal) => Goal | null): Scenario {
  const goals = goalsOf(s)
  if (!goals.some((g) => g.id === id)) return s
  return { ...s, goals: goals.flatMap((g) => (g.id === id ? (fn(g) ?? []) : [g])) }
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
        templateKey: null,
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
    library: readLibrary(),
    playlist: readPlaylist(),
    passSource: readPassSource() === SHARED_PASS ? MY_PASS : readPassSource(),
    sharedPass: null,
    templateKey: null,
    presenting: false,
    idle: false,
    deck: [],
    stash: null,

    saveCurrent: () =>
      set((st) => {
        const library = { ...st.library, [st.scenario.id]: st.scenario }
        writeLibrary(library)
        return { library }
      }),
    deleteSaved: (id) =>
      set((st) => {
        const library = { ...st.library }
        delete library[id]
        writeLibrary(library)
        const playlist = { ...st.playlist, ids: st.playlist.ids.filter((x) => x !== id) }
        writePlaylist(playlist)
        return { library, playlist }
      }),
    addToPlaylist: (id) => {
      if (!id) get().saveCurrent()
      set((st) => {
        const playlist = { ...st.playlist, ids: [...st.playlist.ids, id ?? st.scenario.id] }
        writePlaylist(playlist)
        return { playlist }
      })
    },
    removeFromPlaylist: (index) =>
      set((st) => {
        const playlist = { ...st.playlist, ids: st.playlist.ids.filter((_, i) => i !== index) }
        writePlaylist(playlist)
        return { playlist }
      }),
    movePlaylistItem: (index, delta) =>
      set((st) => {
        const ids = [...st.playlist.ids]
        const to = index + delta
        if (to < 0 || to >= ids.length) return {}
        ;[ids[index], ids[to]] = [ids[to], ids[index]]
        const playlist = { ...st.playlist, ids }
        writePlaylist(playlist)
        return { playlist }
      }),
    renamePlaylist: (name) =>
      set((st) => {
        const playlist = { ...st.playlist, name }
        writePlaylist(playlist)
        return { playlist }
      }),
    importPass: (pass) =>
      set((st) => {
        const copies = pass.scenarios.map((s) => ({ ...s, id: uid() }))
        const library = { ...st.library, ...Object.fromEntries(copies.map((s) => [s.id, s])) }
        const playlist = { name: pass.name, ids: copies.map((s) => s.id) }
        writeLibrary(library)
        writePlaylist(playlist)
        writePassSource(MY_PASS)
        return { library, playlist, passSource: MY_PASS }
      }),
    setIdle: (idle) => set({ idle }),
    setPassSource: (passSource) => {
      if (passSource !== SHARED_PASS) writePassSource(passSource)
      set({ passSource })
    },
    showSharedPass: (sharedPass) => set({ sharedPass, passSource: SHARED_PASS }),
    enterPresentation: (startId, deck) => {
      const st = get()
      if (st.presenting) return
      set({
        presenting: true,
        deck: deck ?? playlistItems(st.playlist, st.library).map((id) => st.library[id]),
        stash: { scenario: st.scenario, past: st.past, future: st.future, activeRound: st.activeRound },
        selectedId: null,
        pending: null,
        message: null,
        tool: 'select',
      })
      if (startId) get().present(startId)
      else set((s) => restore(s.scenario, 0))
    },
    exitPresentation: () =>
      set((st) => {
        if (!st.presenting) return {}
        const stash = st.stash
        return {
          presenting: false,
          deck: [],
          stash: null,
          ...(stash ? { ...restore(stash.scenario, stash.activeRound), past: stash.past, future: stash.future } : {}),
        }
      }),
    present: (id) => {
      const s = get().deck.find((x) => x.id === id) ?? get().library[id]
      if (s) set({ ...restore(applyMarks(s), 0), selectedId: null })
    },

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
          { id, team, role, pos, label: role === 'G' ? 'G' : role === 'C' ? 'T' : nextLabel(s.players, team), heading: team === 'home' ? 0 : Math.PI },
        ],
      }))
      set({ selectedId: id })
    },
    addPuck: (pos) => mutate((s) => ({ ...s, pucks: [...s.pucks, { id: uid(), pos }] })),
    addCone: (pos) => mutate((s) => ({ ...s, cones: [...(s.cones ?? []), { id: uid(), pos }] })),
    addGoal: (pos) => {
      const id = uid()
      mutate((s) => ({ ...s, goals: [...goalsOf(s), { id, pos, angle: pos.x >= 0 ? Math.PI : 0 }] }))
      set({ selectedId: id })
    },
    rotateGoal: (id) => mutate((s) => withGoal(s, id, (g) => ({ ...g, angle: (g.angle + Math.PI / 2) % (2 * Math.PI) }))),
    addDividers: (from, to) =>
      mutate((s) => ({ ...s, dividers: [...(s.dividers ?? []), ...layoutDividers(from, to).map((d) => ({ id: uid(), ...d }))] })),
    moveObject: (id, pos, withPucks = []) =>
      mutate((s) => {
        s = withGoal(s, id, (g) => ({ ...g, pos }))
        const mover = s.players.find((p) => p.id === id)
        const delta = mover ? sub(pos, mover.pos) : { x: 0, y: 0 }
        return {
          ...s,
          players: s.players.map((p) => (p.id === id ? { ...p, pos } : p)),
          pucks: s.pucks.map((k) => (k.id === id ? { ...k, pos } : withPucks.includes(k.id) ? { ...k, pos: add(k.pos, delta) } : k)),
          cones: s.cones?.map((c) => (c.id === id ? { ...c, pos } : c)),
          dividers: s.dividers?.map((d) => (d.id === id ? { ...d, pos } : d)),
        }
      }, false),
    snapPuck: (id) =>
      mutate((s) => {
        const carrier = s.players.find((p) => p.id === initialCarrierMap(s).get(id))
        if (!carrier) return s
        const pos = add(carrier.pos, fromAngle(carrier.heading, 0.7))
        return { ...s, pucks: s.pucks.map((k) => (k.id === id ? { ...k, pos } : k)) }
      }, false),
    updatePlayer: (id, patch) => mutate((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    removeObject: (id) => {
      mutate((s) => ({
        ...mapAllActions(withGoal(s, id, () => null), notInvolving(id)),
        players: s.players.filter((p) => p.id !== id),
        pucks: s.pucks.filter((k) => k.id !== id),
        cones: s.cones?.filter((c) => c.id !== id),
        dividers: s.dividers?.filter((d) => d.id !== id),
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
          dividers: s.dividers?.map((d) => ({ ...d, pos: fit(d.pos) })),
          goals: s.goals?.map((g) => {
            const home = defaultGoals(f).find((d) => d.id === g.id && (g.id === DEFAULT_GOAL_IDS.left || g.id === DEFAULT_GOAL_IDS.right))
            return home ? { ...g, pos: home.pos } : { ...g, pos: clampToField(f, g.pos, 1.5).pos }
          }),
        }
      }),
    rename: (name) => mutate((s) => ({ ...s, name }), false),
    setNotes: (notes) => mutate((s) => ({ ...s, notes: notes || undefined }), false),

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
    load: (scenario) => set({ ...restore(applyMarks(scenario), 0), past: [], future: [], selectedId: null, templateKey: null }),
    loadTemplate: (k) => {
      get().load(k === 'empty' ? emptyScenario() : template(k))
      set({ templateKey: k })
    },
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
    setEnd: (t) => {
      const lastStart = get().scenario.rounds?.at(-1)?.startT ?? 0
      const durationSec = Math.round(Math.max(0.5, t - lastStart) * 10) / 10
      mutate((s) => ({ ...s, settings: { ...s.settings, durationSec } }))
      set({ time: lastStart + durationSec, editing: false })
    },
    setRoundDirection: (index, side) => {
      if (index === 0) return
      mutate((s) => ({ ...s, rounds: (s.rounds ?? []).map((r, i) => (i === index - 1 ? { ...r, homeAttacks: side } : r)) }))
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
        templateKey: null,
        past: [...st.past.slice(-80), st.scenario],
        future: [],
      })),
    toggle: (k) => set((st) => ({ [k]: !st[k] }) as Partial<EditorState>),
  }
})

useEditor.subscribe((st) => {
  if (PLACE_TOOLS.has(st.tool) && !placementAllowed(st)) useEditor.setState({ tool: 'select' })
})
