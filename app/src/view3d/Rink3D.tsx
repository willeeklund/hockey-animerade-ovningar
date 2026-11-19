import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type WheelEvent as RWheelEvent } from 'react'
import * as THREE from 'three'
import type { SimResult } from '../engine/simulate'
import { frameAt } from '../engine/frames'
import {
  adjustOf,
  CELL_BLOCKED,
  CELL_OPEN,
  CELL_TIGHT,
  clampAdjust,
  depthFromGoal,
  GOAL_HEIGHT,
  findDuel,
  MIN_SHOT_DEPTH,
  NET_COLS,
  NET_ROWS,
  FLOORBALL_GOALIE_BOXES,
  netView,
  SHOT_HEIGHT,
  placeGoalie,
  type Duel,
  type GoalieAdjust,
  type GoaliePose,
  type NetView,
} from '../engine/netView'
import { clampToField, fieldOf, goalAcross, goalNormal, goalsOf, RINK, TEAM_COLORS, teamColorOf, type Field } from '../model/rink'
import type { Goal, Player, Scenario, Team, Vec } from '../model/types'
import { useEditor } from '../editor/store'
import { buildArena, buildDivider, buildGoal, buildLights, to3 } from './arena'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCone, buildGoalie, buildPuck, buildSkater, type Figure, type Kit } from './figures'
import { buildBall, buildKidGoalie, buildKidPlayer, rollTo } from './kids'
import { buildFloorballGoal, buildHall, HALL, type Hall } from './hall'
import { useView3d, type Cam } from './store'
import { playGoal, playPost, playSave, playShot } from './sound'
import { bezier, decide, dekeRoute, goalieRecovery, holeTarget, roomAt, saveChance, SHOOTER_SPEED, type DekeRoute, type Move } from '../engine/duelPlay'

const NEUTRAL = '#9ca3af'
const COACH = '#334155'
const FREEZE_LEAD = 0.3
const WINDUP = 0.35
const POKE_RANGE = 1.8
const POKE_CHANCE = 0.45

const TEST_SHOT_SPEED = 16
const AIM_JITTER = 0.08
const STEP_DEPTH = 0.15
const STEP_LAT = 0.1
const MOVES: Record<string, [number, number]> = { ArrowUp: [0.15, 0], ArrowDown: [-0.15, 0], ArrowLeft: [0, -0.1], ArrowRight: [0, 0.1] }
const CAM_ORDER: Cam[] = ['overview', 'shooter', 'goalie']
const DEFAULT_ADJUST: GoalieAdjust = { depth: 1.0, lateral: 0 }

interface Level {
  group: THREE.Group
  figs: Map<string, Figure>
  pucks: Map<string, THREE.Object3D>
  virtualGoalie: Map<Team, Figure>
  goals: Goal[]
  sun: THREE.DirectionalLight
  fb: boolean
  hall: Hall | null
  shotPuck: THREE.Object3D
}

const SPORT = {
  hockey: { shooterEye: 0.75, goalieEye: 1.3, stickOffset: 0.72, reach: 0.9, boxes: undefined, puck: 'pucken', poke: 'Målvakten går rakt på skytten och petar efter pucken!', pokeBanner: 'PETADE BORT DEN! 🏒', deke: 'Målvakten står långt ute – skytten åker runt honom!' },
  floorball: { shooterEye: 1.0, goalieEye: 0.9, stickOffset: 0.6, reach: 0.78, boxes: FLOORBALL_GOALIE_BOXES, puck: 'bollen', poke: 'Målvakten kastar sig mot skytten och tar bollen!', pokeBanner: 'MÅLVAKTEN TOG DEN! 🧤', deke: 'Målvakten står långt ute – skytten springer runt!' },
}
const sportOf = (L: Level | null | undefined) => (L?.fb ? SPORT.floorball : SPORT.hockey)

const BODY_CLEARANCE = 0.3
const BLADE_CLEARANCE = 0.06

function insideBoards(field: Field, x: number, y: number, h: number, reach: number) {
  let pos = clampToField(field, { x, y }, BODY_CLEARANCE).pos
  for (let i = 0; i < 3 && reach > 0; i++) {
    for (const a of [-0.35, 0, 0.35]) {
      const tip = { x: pos.x + Math.cos(h + a) * reach, y: pos.y + Math.sin(h + a) * reach }
      const c = clampToField(field, tip, BLADE_CLEARANCE).pos
      pos = { x: pos.x + c.x - tip.x, y: pos.y + c.y - tip.y }
    }
  }
  return clampToField(field, pos, BODY_CLEARANCE).pos
}

type ShotResult = 'goal' | 'save' | 'post' | 'miss'

interface PlayOut {
  start: number
  move: Move
  shooterId: string
  goal: Goal
  route: DekeRoute | null
  skateDur: number
  gk0: GoaliePose | null
  from: THREE.Vector3
  to: THREE.Vector3
  flight: number
  result: ShotResult
  released: boolean
  landed: boolean
  reacted: boolean
  poke: boolean
  skipTo: number | null
}

function playState(p: PlayOut, now: number) {
  const e = (now - p.start) / 1000
  const toGoal = (q: Vec) => Math.atan2(p.goal.pos.y - q.y, p.goal.pos.x - q.x)
  let puck: Vec = { x: p.from.x, y: p.from.z }
  let heading = toGoal(puck)
  if (p.route) {
    const k = Math.min(1, Math.max(0, e / p.skateDur))
    puck = bezier(p.route, k)
    if (k < 1) {
      const a = bezier(p.route, Math.max(0, k - 0.02))
      const b = bezier(p.route, Math.min(1, k + 0.02))
      heading = Math.atan2(b.y - a.y, b.x - a.x)
    } else heading = toGoal(puck)
  }
  const gk = p.gk0 ? (p.route ? goalieRecovery(p.goal, p.gk0, p.route.to, Math.min(e, p.skateDur)) : p.gk0.pos) : null
  const fk = Math.max(0, Math.min(1, (e - p.skateDur) / p.flight))
  return { e, skating: e < p.skateDur, puck, heading, gk, fk }
}

interface Engine {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  cam: THREE.PerspectiveCamera
  pip: THREE.PerspectiveCamera
  level: Level | null
  env: THREE.Texture | null
  tiles: THREE.Mesh
  tileTex: THREE.DataTexture
  tri: THREE.Mesh
  duel: Duel | null
  eye: THREE.Vector3
  look: THREE.Vector3
  pipEye: THREE.Vector3
  pipLook: THREE.Vector3
  ovTarget: THREE.Vector3
  orbit: { az: number; el: number; dist: number }
  gkShown: { pos: Vec; heading: number } | null
  nv: NetView | null
  nvKey: string
  lastT: number
  frozenAt: number
  shot: PlayOut | null
  autoShoot: boolean
  simReact: boolean
  gkPrev: Vec | null
  puckScale: number
  w: number
  h: number
}

interface Hud {
  cam: Cam
  lateral: number
  shotDist: number | null
  pct: number | null
  shooter?: string
  goalie?: string
  virtual: boolean
  depth: number | null
  adjusted: boolean
  duel: boolean
}

const kitOf = (s: Scenario, p: Pick<Player, 'team' | 'neutral' | 'role'>): Kit => {
  if (p.role === 'C') return { jersey: COACH, ink: '#fff' }
  if (p.neutral) return { jersey: NEUTRAL, ink: '#111' }
  const c = TEAM_COLORS[teamColorOf(s.settings, p.team)]
  return { jersey: c.fill, ink: c.ink }
}

function buildLevel(s: Scenario, maxAniso: number): Level {
  const field = fieldOf(s.settings)
  const fb = field.layout === 'floorball'
  const group = new THREE.Group()
  const colors = (['home', 'away'] as Team[]).map((t) => TEAM_COLORS[teamColorOf(s.settings, t)].fill)
  let hall: Hall | null = null
  let sun: THREE.DirectionalLight
  if (fb) {
    hall = buildHall(field, colors, maxAniso)
    group.add(hall.group)
    sun = hall.sun
  } else {
    group.add(buildArena(field, colors, maxAniso))
    sun = buildLights(group, field)
  }
  const goals = goalsOf(s)
  for (const g of goals) group.add(fb ? buildFloorballGoal(g) : buildGoal(g, true))
  for (const d of s.dividers ?? []) group.add(buildDivider(d))
  for (const c of s.cones ?? []) {
    const m = buildCone()
    m.position.copy(to3(c.pos.x, c.pos.y))
    group.add(m)
  }
  const figs = new Map<string, Figure>()
  for (const p of s.players) {
    const kit = kitOf(s, p)
    const seed = `${s.name}|${p.id}|${p.label}`
    const f = fb
      ? p.role === 'G'
        ? buildKidGoalie(seed, p.label, kit)
        : buildKidPlayer(seed, p.label, kit, { coach: p.role === 'C' })
      : p.role === 'G'
        ? buildGoalie(p.label, kit)
        : buildSkater(p.label, kit, { coach: p.role === 'C' })
    f.root.traverse((o) => (o.castShadow = o instanceof THREE.Mesh && o.castShadow))
    figs.set(p.id, f)
    group.add(f.root)
  }
  const virtualGoalie = new Map<Team, Figure>()
  for (const t of ['home', 'away'] as Team[]) {
    const f = fb ? buildKidGoalie(`${s.name}|virtual|${t}`, '1', kitOf(s, { team: t, role: 'G' })) : buildGoalie('', kitOf(s, { team: t, role: 'G' }))
    f.root.visible = false
    virtualGoalie.set(t, f)
    group.add(f.root)
  }
  const pucks = new Map<string, THREE.Object3D>()
  for (const k of s.pucks) {
    const m = fb ? buildBall() : buildPuck()
    pucks.set(k.id, m)
    group.add(m)
  }
  const shotPuck = fb ? buildBall() : buildPuck()
  shotPuck.visible = false
  group.add(shotPuck)
  return { group, figs, pucks, virtualGoalie, goals, sun, fb, hall, shotPuck }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    if (x instanceof THREE.Mesh) {
      x.geometry.dispose()
      const ms = Array.isArray(x.material) ? x.material : [x.material]
      ms.forEach((m) => {
        if ((m as THREE.MeshStandardMaterial).map && !(m as THREE.MeshStandardMaterial).map!.userData.shared) (m as THREE.MeshStandardMaterial).map!.dispose()
      })
    }
  })
}

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)

function verdict(pct: number) {
  if (pct >= 45) return { text: 'Massor av mål att skjuta på!', color: '#16a34a' }
  if (pct >= 25) return { text: 'Det finns bra luckor', color: '#65a30d' }
  if (pct >= 10) return { text: 'Lite plats – sikta noga', color: '#d97706' }
  return { text: 'Målvakten täcker nästan allt!', color: '#dc2626' }
}

const CALLOUTS: Record<Move['kind'], string> = {
  shoot: 'Skytten ser ett stort hål och skjuter direkt!',
  deke: 'Målvakten står långt ute – skytten åker runt honom!',
  chance: 'Inget stort hål – skytten måste chansa!',
}

const BANNERS: Record<string, string> = { goal: 'MÅÅÅL! 🚨', save: 'RÄDDNING! 🧤', poke: 'PETADE BORT DEN! 🏒', post: 'I STOLPEN! 🔔', miss: 'UTANFÖR!' }

function coach(depth: number, lateral: number) {
  const tips: { text: string; tone: 'good' | 'warn' | 'bad' }[] = []
  if (depth < 0.5) tips.push({ text: 'Du står på mållinjen – skytten ser massor av mål. Gå ut! ▲', tone: 'bad' })
  else if (depth < 1.3) tips.push({ text: 'Inne i målgården. Gå ut lite så krymper målet. ▲', tone: 'warn' })
  else if (depth < 2.4) tips.push({ text: 'Ytterkanten av målgården – bra läge!', tone: 'good' })
  else tips.push({ text: 'Ute och utmanar – modigt! Skytten ser mycket mindre mål.', tone: 'good' })
  if (Math.abs(lateral) > 0.22) tips.push({ text: `Du står snett. Flytta dig åt ${lateral > 0 ? 'vänster ◀' : 'höger ▶'} så du hamnar mitt i den gula triangeln.`, tone: 'warn' })
  return tips
}

function pipRect(w: number, h: number) {
  const pw = Math.round(Math.min(w * 0.36, 440))
  const ph = Math.round(pw * 0.6)
  return { x: w - pw - 12, top: Math.min(58, Math.max(8, h - ph - 8)), w: pw, h: ph }
}

export default function Rink3D({ sim, corner }: { sim: SimResult; corner?: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const simRef = useRef(sim)
  useEffect(() => {
    simRef.current = sim
  }, [sim])
  const scenario = useEditor((s) => s.scenario)
  const presenting = useEditor((s) => s.presenting)
  const cam = useView3d((s) => s.cam)
  const [hud, setHud] = useState<Hud>({ cam, lateral: 0, shotDist: null, pct: null, virtual: false, depth: null, adjusted: false, duel: false })
  const [banner, setBanner] = useState<{ kind: string; id: number } | null>(null)
  const [challenge, setChallenge] = useState(false)
  const [callout, setCallout] = useState<{ text: string; id: number } | null>(null)
  const challengeRef = useRef(false)
  const shootRef = useRef<() => void>(() => {})
  const showChallenge = (on: boolean) => {
    if (challengeRef.current === on) return
    challengeRef.current = on
    setChallenge(on)
  }
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 400)
    const pip = new THREE.PerspectiveCamera(55, 1.6, 0.05, 400)

    const tileData = new Uint8Array(NET_COLS * NET_ROWS * 4)
    const tileTex = new THREE.DataTexture(tileData, NET_COLS, NET_ROWS, THREE.RGBAFormat)
    tileTex.magFilter = THREE.LinearFilter
    tileTex.minFilter = THREE.LinearFilter
    tileTex.colorSpace = THREE.SRGBColorSpace
    tileTex.userData.shared = true
    const tiles = new THREE.Mesh(
      new THREE.PlaneGeometry(RINK.goalHalfWidth * 2, GOAL_HEIGHT),
      new THREE.MeshBasicMaterial({ map: tileTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    )
    tiles.renderOrder = 2
    scene.add(tiles)
    const triGeom = new THREE.BufferGeometry()
    triGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3))
    const tri = new THREE.Mesh(triGeom, new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }))
    tri.renderOrder = 1
    scene.add(tri)

    engineRef.current = {
      renderer,
      scene,
      cam,
      pip,
      level: null,
      env: null,
      tiles,
      tileTex,
      tri,
      duel: null,
      eye: new THREE.Vector3(0, 22, 30),
      look: new THREE.Vector3(),
      pipEye: new THREE.Vector3(0, 22, 30),
      pipLook: new THREE.Vector3(),
      ovTarget: new THREE.Vector3(),
      orbit: { az: 0, el: 0.62, dist: 30 },
      gkShown: null,
      nv: null,
      nvKey: '',
      lastT: useEditor.getState().time,
      frozenAt: -1,
      shot: null,
      autoShoot: false,
      simReact: false,
      gkPrev: null,
      puckScale: 1,
      w: 1,
      h: 1,
    }

    const ro = new ResizeObserver(() => {
      const r = wrapRef.current!.getBoundingClientRect()
      const E = engineRef.current!
      E.w = Math.max(1, Math.round(r.width))
      E.h = Math.max(1, Math.round(r.height))
      renderer.setSize(E.w, E.h, false)
      setSize({ w: E.w, h: E.h })
    })
    ro.observe(wrapRef.current!)
    return () => {
      ro.disconnect()
      if (engineRef.current?.level) disposeTree(engineRef.current.level.group)
      disposeTree(scene)
      renderer.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    const E = engineRef.current
    if (!E) return
    if (E.level) {
      E.scene.remove(E.level.group)
      disposeTree(E.level.group)
    }
    E.level = buildLevel(scenario, E.renderer.capabilities.getMaxAnisotropy())
    E.scene.add(E.level.group)
    E.duel = null
    E.gkShown = null
    E.shot = null
    E.frozenAt = -1
    const f = fieldOf(scenario.settings)
    const s = Math.max(f.halfLength, f.halfWidth) + 2
    Object.assign(E.level.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s })
    E.level.sun.shadow.camera.updateProjectionMatrix()
    if (E.level.fb) {
      if (!E.env) {
        const pm = new THREE.PMREMGenerator(E.renderer)
        E.env = pm.fromScene(new RoomEnvironment(), 0.04).texture
        E.env.userData.shared = true
        pm.dispose()
      }
      E.scene.environment = E.env
      E.scene.environmentIntensity = 0.3
      E.scene.background = new THREE.Color('#c9ced6')
      E.scene.fog = null
      E.renderer.toneMappingExposure = 1.0
    } else {
      E.scene.environment = null
      E.scene.background = new THREE.Color('#0b1220')
      E.scene.fog = new THREE.Fog('#0b1220', 60, 140)
      E.renderer.toneMappingExposure = 1.05
    }
    E.orbit.dist = f.layout === 'full' ? 30 : f.layout === 'floorball' ? 19 : 22
    E.orbit.el = f.layout === 'floorball' ? 0.42 : 0.62
    useView3d.getState().setAdjust(null)
  }, [scenario])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let hudAt = 0
    let hudKey = ''
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const E = engineRef.current
      if (!E || !E.level) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const st = useEditor.getState()
      const v = useView3d.getState()
      const sim = simRef.current
      const s = st.scenario
      const L = E.level
      const t = Math.min(st.time, sim.duration)
      const frame = frameAt(sim, t)
      const field = fieldOf(s.settings)
      const before = frameAt(sim, Math.max(0, t - 0.1))
      const animDt = st.playing ? dt * st.rate : 0

      if (st.playing) showChallenge(false)
      if (st.playing && t > E.lastT) {
        const challengeMode = v.freeze && v.cam !== 'overview'
        const shotEv = challengeMode || v.adjust ? sim.events.find((e) => e.kind === 'shot' && e.t !== E.frozenAt && e.t - FREEZE_LEAD > E.lastT && e.t - FREEZE_LEAD <= t) : undefined
        if (shotEv) {
          E.frozenAt = shotEv.t
          st.setPlaying(false)
          st.setTime(Math.max(0, shotEv.t - FREEZE_LEAD))
          if (challengeMode) showChallenge(true)
          else E.autoShoot = true
          E.lastT = shotEv.t - FREEZE_LEAD
          return
        }
        for (const ev of sim.events) {
          if (ev.t <= E.lastT || ev.t > t) continue
          if (ev.kind === 'shot') {
            playShot()
            E.simReact = true
          }
          if ((ev.kind === 'goal' || ev.kind === 'save') && !v.adjust) {
            setBanner({ kind: ev.kind, id: now })
            L.hall?.cheer(ev.kind)
            if (ev.kind === 'goal') playGoal()
            else playSave()
          }
        }
      }
      E.lastT = t

      const found = findDuel(frame, s.players, L.goals, s.settings, E.duel, s.focusId)
      E.duel = found
      let duel = found
      const shooter = found ? s.players.find((p) => p.id === found.shooterId) : undefined
      const realGk = found?.goalieId ? s.players.find((p) => p.id === found.goalieId) : undefined
      const needVirtual = !!duel && !realGk && (v.cam === 'goalie' || !!v.adjust)
      const gkTeam: Team | undefined = realGk?.team ?? (shooter ? (shooter.team === 'home' ? 'away' : 'home') : undefined)

      let gkTarget: { pos: Vec; heading: number } | null = null
      if (duel) {
        if (v.adjust) gkTarget = placeGoalie(duel.goal, duel.puck, v.adjust)
        else if (realGk && frame.players[realGk.id]) gkTarget = { pos: frame.players[realGk.id], heading: frame.players[realGk.id].h }
        else if (needVirtual) gkTarget = placeGoalie(duel.goal, duel.puck, DEFAULT_ADJUST)
      }
      if (gkTarget) {
        if (!E.gkShown || !v.adjust) E.gkShown = { pos: { ...gkTarget.pos }, heading: gkTarget.heading }
        else {
          const k = damp(14, dt)
          E.gkShown.pos.x += (gkTarget.pos.x - E.gkShown.pos.x) * k
          E.gkShown.pos.y += (gkTarget.pos.y - E.gkShown.pos.y) * k
          E.gkShown.heading = gkTarget.heading
        }
      } else E.gkShown = null

      if (E.autoShoot && !E.shot) {
        E.autoShoot = false
        shootRef.current()
      }
      const play = E.shot ? playState(E.shot, now) : null
      if (play && E.shot && duel) {
        duel = { ...duel, goal: E.shot.goal, puck: play.puck, carrying: play.skating }
        if (play.gk) E.gkShown = { pos: play.gk, heading: Math.atan2(play.puck.y - play.gk.y, play.puck.x - play.gk.x) }
      }

      const goalieFig = realGk ? L.figs.get(realGk.id) : needVirtual && gkTeam ? L.virtualGoalie.get(gkTeam) : undefined
      const gkSpeed = E.gkShown && E.gkPrev && dt > 0 ? Math.hypot(E.gkShown.pos.x - E.gkPrev.x, E.gkShown.pos.y - E.gkPrev.y) / dt : 0
      E.gkPrev = E.gkShown ? { ...E.gkShown.pos } : null
      if (E.simReact) {
        E.simReact = false
        goalieFig?.react?.('butterfly')
      }
      const carriers = new Set(Object.values(frame.pucks).map((k) => k.c))
      const sport = sportOf(L)
      const firstPuck = Object.values(frame.pucks)[0]
      const focus = play ? new THREE.Vector3(play.puck.x, 0.04, play.puck.y) : firstPuck ? new THREE.Vector3(firstPuck.x, 0.04, firstPuck.y) : null
      if (E.shot && play && !play.skating) focus?.copy(E.shot.from).lerp(E.shot.to, play.fk)
      const swingOf = (id: string) => {
        if (!L.fb) return {}
        for (const ev of sim.events) {
          if (ev.playerId !== id || (ev.kind !== 'shot' && ev.kind !== 'pass')) continue
          const lead = ev.kind === 'shot' ? 0.35 : 0.22
          const span = ev.kind === 'shot' ? 0.5 : 0.4
          const k = (t - ev.t + lead) / span
          if (k >= 0 && k <= 1) return ev.kind === 'shot' ? { shot: k } : { pass: k }
        }
        return {}
      }
      for (const p of s.players) {
        const fig = L.figs.get(p.id)!
        const fp = frame.players[p.id]
        if (!fp) {
          fig.root.visible = false
          continue
        }
        fig.root.visible = true
        let x = fp.x
        let y = fp.y
        let h = fp.h
        if (realGk && p.id === realGk.id && E.gkShown) {
          x = E.gkShown.pos.x
          y = E.gkShown.pos.y
          h = E.gkShown.heading
        }
        const acting = play && E.shot?.shooterId === p.id
        if (acting) {
          h = play.heading
          x = play.puck.x - Math.cos(h) * sport.stickOffset
          y = play.puck.y - Math.sin(h) * sport.stickOffset
        }
        const inside = insideBoards(field, x, y, h, p.role === 'G' ? 0 : sport.reach)
        x = inside.x
        y = inside.y
        fig.root.position.set(x, 0, y)
        fig.root.rotation.y = -h
        const bp = before.players[p.id]
        const vel = bp ? { x: (fp.x - bp.x) / 0.1, y: (fp.y - bp.y) / 0.1 } : { x: 0, y: 0 }
        if (p.role === 'G') {
          fig.update(realGk && p.id === realGk.id ? gkSpeed : bp ? Math.hypot(fp.x - bp.x, fp.y - bp.y) / 0.1 : 0, dt, { focus: focus ?? undefined, live: dt })
        } else if (acting && E.shot) {
          const k = (play.e - (E.shot.skateDur - WINDUP)) / (WINDUP / 0.7)
          const sp = play.skating && E.shot.route ? SHOOTER_SPEED : 0
          fig.update(sp, dt, { puck: true, shot: k >= 0 && k <= 1 ? k : undefined, vel: { x: Math.cos(h) * sp, y: Math.sin(h) * sp }, focus: focus ?? undefined, live: dt })
        } else {
          fig.update(bp ? Math.hypot(fp.x - bp.x, fp.y - bp.y) / 0.1 : 0, animDt, { puck: carriers.has(p.id), vel, focus: focus ?? undefined, live: dt, ...swingOf(p.id) })
        }
        fig.setHighlight(!!duel?.carrying && p.id === duel.shooterId)
        fig.setFirstPerson?.(false)
      }
      for (const [team, fig] of L.virtualGoalie) {
        const on = needVirtual && team === gkTeam && !!E.gkShown
        fig.root.visible = on
        if (on) {
          fig.root.position.set(E.gkShown!.pos.x, 0, E.gkShown!.pos.y)
          fig.root.rotation.y = -E.gkShown!.heading
          fig.update(gkSpeed, dt, { focus: focus ?? undefined, live: dt })
        }
      }
      for (const k of s.pucks) {
        const m = L.pucks.get(k.id)!
        const fk = frame.pucks[k.id]
        if (!fk) {
          m.visible = false
          continue
        }
        m.visible = !(E.shot && fk.c === E.shot.shooterId)
        m.scale.setScalar((fk.s && !L.fb ? 0.8 : 1) * E.puckScale)
        const held = L.fb && fk.c ? L.figs.get(fk.c)?.ballAt?.() : null
        if (L.fb) rollTo(m, held?.x ?? fk.x, held ? held.y - 0.048 * E.puckScale : 0, held?.z ?? fk.y)
        else m.position.set(fk.x, 0, fk.y)
      }

      if (E.shot && play) {
        const sh = E.shot
        const sp = L.shotPuck
        sp.visible = true
        const held = L.fb && play.skating ? L.figs.get(sh.shooterId)?.ballAt?.() : null
        const at = held ? held.clone().setY(held.y - 0.048) : play.skating ? new THREE.Vector3(play.puck.x, 0, play.puck.y) : new THREE.Vector3().lerpVectors(sh.from, sh.to, play.fk)
        if (L.fb) {
          if (!play.skating && !held) at.y = Math.max(0, at.y - 0.048)
          rollTo(sp, at.x, at.y, at.z)
        } else {
          sp.position.copy(at)
          if (!play.skating) sp.rotation.x += dt * 20
        }
        if (!play.skating && !sh.released) {
          sh.released = true
          if (!sh.poke) playShot()
        }
        if (!sh.reacted && goalieFig && E.gkShown && (sh.result === 'save' ? play.e >= sh.skateDur - 0.05 : play.fk > 0.55)) {
          sh.reacted = true
          const g = E.gkShown
          const side = (sh.to.x - g.pos.x) * Math.sin(g.heading) - (sh.to.z - g.pos.y) * Math.cos(g.heading)
          goalieFig.react?.(sh.poke || sh.to.y < 0.45 ? 'butterfly' : side > 0 ? 'glove' : 'blocker')
        }
        if (play.fk >= 1 && !sh.landed) {
          sh.landed = true
          setBanner({ kind: sh.poke ? 'poke' : sh.result, id: now })
          if (sh.result === 'goal' || sh.result === 'save') L.hall?.cheer(sh.result)
          if (sh.result === 'goal') playGoal()
          else if (sh.result === 'save') playSave()
          else playPost()
          v.addScore(sh.result === 'goal' ? 'goals' : 'saves')
        }
        if (play.e > sh.skateDur + sh.flight + 1.8) {
          if (sh.skipTo !== null) {
            st.setTime(sh.skipTo)
            E.lastT = sh.skipTo
          }
          E.shot = null
          L.shotPuck.visible = false
          L.shotPuck.rotation.set(0, 0, 0)
        }
      }

      const canShoot = !!duel && duel.carrying && depthFromGoal(duel.goal, duel.puck) > MIN_SHOT_DEPTH
      if (canShoot && duel) {
        const pose = E.gkShown ? { pos: E.gkShown.pos, heading: E.gkShown.heading, scale: 1, boxes: sport.boxes } : undefined
        const key = `${duel.goal.id}|${duel.puck.x.toFixed(2)},${duel.puck.y.toFixed(2)}|${pose ? `${pose.pos.x.toFixed(3)},${pose.pos.y.toFixed(3)},${pose.heading.toFixed(3)}` : '-'}`
        if (key !== E.nvKey) {
          E.nvKey = key
          E.nv = netView(duel.goal, duel.puck, pose)
          const data = E.tileTex.image.data as Uint8Array
          for (let j = 0; j < NET_ROWS; j++) {
            for (let i = 0; i < NET_COLS; i++) {
              const c = E.nv.cells[j * NET_COLS + i]
              const o = (j * NET_COLS + (NET_COLS - 1 - i)) * 4
              const [r, g, b, a] = c === CELL_OPEN ? [34, 220, 94, 150] : c === CELL_TIGHT ? [250, 204, 21, 140] : [0, 0, 0, 0]
              data[o] = r
              data[o + 1] = g
              data[o + 2] = b
              data[o + 3] = a
            }
          }
          E.tileTex.needsUpdate = true
        }
        const n = goalNormal(duel.goal)
        E.tiles.visible = true
        E.tiles.position.set(duel.goal.pos.x + n.x * 0.04, GOAL_HEIGHT / 2, duel.goal.pos.y + n.y * 0.04)
        E.tiles.rotation.set(0, -duel.goal.angle + Math.PI / 2, 0)
        const a = goalAcross(duel.goal)
        const pos = E.tri.geometry.getAttribute('position') as THREE.BufferAttribute
        pos.setXYZ(0, duel.puck.x, 0.008, duel.puck.y)
        pos.setXYZ(1, duel.goal.pos.x + a.x * RINK.goalHalfWidth, 0.008, duel.goal.pos.y + a.y * RINK.goalHalfWidth)
        pos.setXYZ(2, duel.goal.pos.x - a.x * RINK.goalHalfWidth, 0.008, duel.goal.pos.y - a.y * RINK.goalHalfWidth)
        pos.needsUpdate = true
        E.tri.geometry.computeBoundingSphere()
        E.tri.visible = true
      } else {
        E.tiles.visible = false
        E.tri.visible = false
        E.nv = null
        E.nvKey = ''
      }

      const shooterCam = (eye: THREE.Vector3, look: THREE.Vector3) => {
        if (!duel) return 0
        const dx = duel.goal.pos.x - duel.puck.x
        const dy = duel.goal.pos.y - duel.puck.y
        const d = Math.hypot(dx, dy) || 1
        const fx = dx / d
        const fy = dy / d
        const back = 0.8
        eye.set(duel.puck.x - fx * back, sport.shooterEye, duel.puck.y - fy * back)
        look.set(duel.goal.pos.x, 0.5, duel.goal.pos.y)
        return THREE.MathUtils.clamp((2 * Math.atan(2.6 / (d + back)) * 180) / Math.PI, 24, 62)
      }
      const goalieCam = (eye: THREE.Vector3, look: THREE.Vector3) => {
        if (!duel || !E.gkShown) return false
        const g = E.gkShown
        eye.set(g.pos.x + Math.cos(g.heading) * 0.06, sport.goalieEye, g.pos.y + Math.sin(g.heading) * 0.06)
        look.set(duel.puck.x, 0.45, duel.puck.y)
        return true
      }
      const wantEye = new THREE.Vector3()
      const wantLook = new THREE.Vector3()
      let mode: Cam = v.cam
      const shooterFov = mode === 'shooter' ? shooterCam(wantEye, wantLook) : 0
      if (mode === 'shooter' && !shooterFov) mode = 'overview'
      if (mode === 'goalie' && !goalieCam(wantEye, wantLook)) mode = 'overview'
      if (mode === 'overview') {
        const focus = duel?.puck ?? Object.values(frame.pucks)[0] ?? { x: 0, y: 0 }
        E.ovTarget.lerp(new THREE.Vector3(focus.x, 0, focus.y), damp(2.5, dt))
        const o = E.orbit
        wantLook.copy(E.ovTarget)
        wantEye.set(E.ovTarget.x + Math.sin(o.az) * Math.cos(o.el) * o.dist, Math.sin(o.el) * o.dist, E.ovTarget.z + Math.cos(o.az) * Math.cos(o.el) * o.dist)
        if (L.fb) {
          wantEye.x = THREE.MathUtils.clamp(wantEye.x, HALL.x0 + 0.8, HALL.x1 - 0.8)
          wantEye.z = THREE.MathUtils.clamp(wantEye.z, HALL.z0 + 0.8, HALL.z1 - 0.8)
          wantEye.y = Math.min(wantEye.y, HALL.h - 2.8)
        }
      }
      const k = damp(mode === 'overview' ? 7 : 5, dt)
      E.eye.lerp(wantEye, k)
      E.look.lerp(wantLook, k)
      E.puckScale = mode === 'overview' ? THREE.MathUtils.clamp(E.eye.distanceTo(E.look) / (L.fb ? 18 : 14), 1, L.fb ? 1.7 : 2.2) : 1
      L.shotPuck.scale.setScalar(E.puckScale)
      L.hall?.update(dt, focus, t)
      E.cam.position.copy(E.eye)
      E.cam.lookAt(E.look)
      const wantFov = mode === 'goalie' ? 68 : mode === 'shooter' ? shooterFov : 50
      E.cam.fov += (wantFov - E.cam.fov) * k
      E.cam.aspect = E.w / E.h
      E.cam.updateProjectionMatrix()

      const r = E.renderer
      r.setScissorTest(true)
      r.setViewport(0, 0, E.w, E.h)
      r.setScissor(0, 0, E.w, E.h)
      const gkFig = realGk ? L.figs.get(realGk.id) : gkTeam ? L.virtualGoalie.get(gkTeam) : undefined
      const shooterFig = duel ? L.figs.get(duel.shooterId) : undefined
      gkFig?.setFirstPerson?.(mode === 'goalie')
      shooterFig?.setFirstPerson?.(mode === 'shooter')
      r.render(E.scene, E.cam)
      if (mode === 'goalie') {
        gkFig?.setFirstPerson?.(false)
        shooterFig?.setFirstPerson?.(true)
        const pe = new THREE.Vector3()
        const pl = new THREE.Vector3()
        const pipFov = shooterCam(pe, pl)
        const kk = damp(6, dt)
        E.pip.fov += (pipFov - E.pip.fov) * kk
        E.pipEye.lerp(pe, kk)
        E.pipLook.lerp(pl, kk)
        const rect = pipRect(E.w, E.h)
        E.pip.position.copy(E.pipEye)
        E.pip.lookAt(E.pipLook)
        E.pip.aspect = rect.w / rect.h
        E.pip.updateProjectionMatrix()
        const y = E.h - rect.top - rect.h
        r.setViewport(rect.x, y, rect.w, rect.h)
        r.setScissor(rect.x, y, rect.w, rect.h)
        r.render(E.scene, E.pip)
      } else {
        E.pipEye.copy(E.eye)
        E.pipLook.copy(E.look)
      }
      r.setScissorTest(false)

      if (now - hudAt > 120) {
        hudAt = now
        const gkLabel = realGk ? realGk.label : needVirtual ? 'Du' : undefined
        const adj = E.gkShown && duel ? adjustOf(duel.goal, duel.puck, E.gkShown.pos) : null
        const depth = adj?.depth ?? null
        const next: Hud = {
          cam: mode,
          lateral: adj ? Math.round(adj.lateral * 100) / 100 : 0,
          shotDist: duel ? Math.round(Math.hypot(duel.puck.x - duel.goal.pos.x, duel.puck.y - duel.goal.pos.y) * 10) / 10 : null,
          pct: canShoot && E.nv ? Math.round(E.nv.open * 100) : null,
          shooter: shooter?.label,
          goalie: gkLabel,
          virtual: needVirtual,
          depth: depth === null ? null : Math.round(depth * 10) / 10,
          adjusted: !!v.adjust,
          duel: !!duel,
        }
        const key = JSON.stringify(next)
        if (key !== hudKey) {
          hudKey = key
          setHud(next)
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!callout) return
    const id = window.setTimeout(() => setCallout(null), 2200)
    return () => window.clearTimeout(id)
  }, [callout])

  useEffect(() => {
    if (!banner) return
    const id = window.setTimeout(() => setBanner(null), 1800)
    return () => window.clearTimeout(id)
  }, [banner])

  const shoot = () => {
    const sim = simRef.current
    const E = engineRef.current
    const duel = E?.duel
    if (!E || !duel?.carrying || E.shot || depthFromGoal(duel.goal, duel.puck) <= MIN_SHOT_DEPTH) return
    const st = useEditor.getState()
    if (st.playing) st.setPlaying(false)
    showChallenge(false)
    const boxes = sportOf(E.level).boxes
    const gk0: GoaliePose | null = E.gkShown ? { pos: { ...E.gkShown.pos }, heading: E.gkShown.heading, scale: 1, boxes } : null
    const move = decide(duel.goal, duel.puck, gk0 ?? undefined)
    const route = move.kind === 'deke' && gk0 ? dekeRoute(duel.goal, duel.puck, gk0, move.side) : null
    const gap0 = gk0 ? Math.hypot(gk0.pos.x - duel.puck.x, gk0.pos.y - duel.puck.y) : Infinity
    const poke = !!route && gap0 < POKE_RANGE && Math.random() < POKE_CHANCE
    const skateDur = poke ? 0.45 : route ? route.length / SHOOTER_SPEED : move.kind === 'shoot' ? 0.45 : 0.6
    const shotFrom = route ? route.to : duel.puck
    const gkAt = gk0 ? (route ? goalieRecovery(duel.goal, gk0, route.to, skateDur) : gk0.pos) : null
    const nv = netView(duel.goal, shotFrom, gkAt ? { pos: gkAt, heading: Math.atan2(shotFrom.y - gkAt.y, shotFrom.x - gkAt.x), scale: 1, boxes } : undefined)
    const base = holeTarget(duel.goal, nv)
    const spread = AIM_JITTER * (move.kind === 'chance' ? 1.6 : 1)
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * spread * 1.6
    const half = RINK.goalHalfWidth
    const lat = THREE.MathUtils.clamp(base.lat + gauss(), -half - 0.1, half + 0.1)
    const z = THREE.MathUtils.clamp(base.z + gauss(), 0.03, GOAL_HEIGHT + 0.1)
    const i = Math.floor(((lat + half) / (2 * half)) * NET_COLS)
    const j = Math.floor((z / GOAL_HEIGHT) * NET_ROWS)
    const inside = i >= 0 && i < NET_COLS && j >= 0 && j < NET_ROWS
    const nearFrame = Math.abs(Math.abs(lat) - half) < 0.05 || Math.abs(z - GOAL_HEIGHT) < 0.05
    const cell = inside ? nv.cells[j * NET_COLS + i] : -1
    let result: ShotResult = !inside ? (nearFrame ? 'post' : 'miss') : cell === CELL_BLOCKED || (cell === CELL_TIGHT && Math.random() < 0.5) ? 'save' : 'goal'
    if (result === 'goal' && gkAt) {
      const far = Math.hypot(shotFrom.x - duel.goal.pos.x, shotFrom.y - duel.goal.pos.y)
      if (Math.random() < saveChance(far, roomAt(nv, i, j))) result = 'save'
    }
    if (poke) result = 'save'
    const a = goalAcross(duel.goal)
    const n = goalNormal(duel.goal)
    const from = new THREE.Vector3(shotFrom.x, SHOT_HEIGHT, shotFrom.y)
    const mouth = new THREE.Vector3(duel.goal.pos.x + a.x * lat, z, duel.goal.pos.y + a.y * lat)
    let to = mouth.clone()
    if (result === 'goal') to.add(new THREE.Vector3(-n.x * 0.7, 0, -n.y * 0.7)).setY(Math.max(0.03, z * 0.8))
    if (result === 'miss') to = from.clone().lerp(mouth, 1.25)
    if (poke && gk0) {
      const stop = new THREE.Vector3(gk0.pos.x + Math.cos(gk0.heading) * 0.6, 0.02, gk0.pos.y + Math.sin(gk0.heading) * 0.6)
      to = stop.clone().add(new THREE.Vector3(Math.sin(gk0.heading) * 1.5, 0, -Math.cos(gk0.heading) * 1.5))
    } else if (result === 'save' && gkAt) {
      const toGk = Math.hypot(gkAt.x - shotFrom.x, gkAt.y - shotFrom.y)
      const toGoal = Math.hypot(mouth.x - from.x, mouth.z - from.z) || 1
      to = from.clone().lerp(mouth, Math.min(1, Math.max(0, (toGk - 0.15) / toGoal)))
    }
    if (poke) from.set(duel.puck.x, 0.02, duel.puck.y)
    const flight = Math.max(0.2, from.distanceTo(to) / (poke ? 6 : TEST_SHOT_SPEED))
    const atFreeze = E.frozenAt >= 0 && Math.abs(st.time - (E.frozenAt - FREEZE_LEAD)) < 0.05
    const after = sim.events.find((e) => e.t > E.frozenAt && (e.kind === 'goal' || e.kind === 'save' || e.kind === 'rebound' || e.kind === 'steal'))
    const skipTo = atFreeze ? Math.min(sim.duration, (after?.t ?? E.frozenAt + 0.7) + 0.5) : null
    E.shot = {
      start: performance.now(),
      move,
      shooterId: duel.shooterId,
      goal: duel.goal,
      route: poke ? null : route,
      skateDur,
      gk0,
      from,
      to,
      flight,
      result,
      released: false,
      landed: false,
      reacted: false,
      poke,
      skipTo,
    }
    const sp = sportOf(E.level)
    setCallout({ text: poke ? sp.poke : move.kind === 'deke' ? sp.deke : CALLOUTS[move.kind], id: performance.now() })
  }

  useEffect(() => {
    shootRef.current = shoot
  })

  const nudge = (dDepth: number, dLat: number) => {
    const E = engineRef.current
    const duel = E?.duel
    if (!E || !duel) return
    const v = useView3d.getState()
    const base = v.adjust ?? (E.gkShown ? adjustOf(duel.goal, duel.puck, E.gkShown.pos) : DEFAULT_ADJUST)
    v.setAdjust(clampAdjust({ depth: base.depth + dDepth, lateral: base.lateral + dLat }))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text') return
      if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const v = useView3d.getState()
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const stop = () => {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      const cams: Record<string, Cam> = { '1': 'overview', '2': 'shooter', '3': 'goalie' }
      if (cams[key]) {
        stop()
        v.setCam(cams[key])
      } else if (key === 'a' || key === 'd') {
        stop()
        const i = CAM_ORDER.indexOf(v.cam) + (key === 'd' ? 1 : -1)
        v.setCam(CAM_ORDER[(i + CAM_ORDER.length) % CAM_ORDER.length])
      } else if (key === 's' || (key === 'Enter' && !el.closest('button')) || (key === ' ' && challengeRef.current)) {
        stop()
        shoot()
      } else if (MOVES[key]) {
        stop()
        nudge(...MOVES[key])
      } else if (key === '0') {
        stop()
        v.setAdjust(null)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    const E = engineRef.current
    if (!d || !E || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    if (useView3d.getState().cam === 'overview') {
      E.orbit.az -= dx * 0.006
      E.orbit.el = Math.min(1.45, Math.max(0.12, E.orbit.el + dy * 0.004))
    }
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    const st = useEditor.getState()
    if (st.presenting && st.idle && st.playing) return
    st.togglePlay(simRef.current.duration)
  }
  const onWheel = (e: RWheelEvent) => {
    const E = engineRef.current
    if (!E || useView3d.getState().cam !== 'overview') return
    E.orbit.dist = Math.min(70, Math.max(6, E.orbit.dist * Math.exp(e.deltaY * 0.001)))
  }

  const setCam = useView3d((s) => s.setCam)
  const freeze = useView3d((s) => s.freeze)
  const setFreeze = useView3d((s) => s.setFreeze)
  const muted = useView3d((s) => s.muted)
  const setMutedState = useView3d((s) => s.setMuted)
  const score = useView3d((s) => s.score)
  const resetScore = useView3d((s) => s.resetScore)
  const setAdjust = useView3d((s) => s.setAdjust)
  const pip = pipRect(size.w, size.h)
  const words = fieldOf(scenario.settings).layout === 'floorball' ? SPORT.floorball : SPORT.hockey
  const v = hud.pct !== null ? verdict(hud.pct) : null
  const holdRef = useRef(0)
  const hold = (dd: number, dl: number) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.stopPropagation()
      nudge(dd, dl)
      window.clearInterval(holdRef.current)
      holdRef.current = window.setInterval(() => nudge(dd, dl), 110)
    },
    onPointerUp: () => window.clearInterval(holdRef.current),
    onPointerLeave: () => window.clearInterval(holdRef.current),
    onPointerCancel: () => window.clearInterval(holdRef.current),
  })

  return (
    <div className={`board-wrap r3d ${presenting ? 'presenting' : ''}`} ref={wrapRef}>
      {corner}
      <canvas ref={canvasRef} className="r3d-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)} onWheel={onWheel} />

      <div className="r3d-cams" role="group" aria-label="Kamera">
        {(
          [
            ['overview', '🎥', 'Översikt', '1'],
            ['shooter', '🏒', 'Skytten', '2'],
            ['goalie', '🥅', 'Målvakten', '3'],
          ] as const
        ).map(([key, icon, label, k]) => (
          <button key={key} className={cam === key ? 'on' : ''} onClick={() => setCam(key)} title={`${label} (${k}). Byt vy med A och D.`}>
            <span className="r3d-ico">{icon}</span> {label}
          </button>
        ))}
        <span className="r3d-sep" />
        <button className={`r3d-small ${freeze ? 'on-soft' : ''}`} onClick={() => setFreeze(!freeze)} title="Pausa precis före varje skott i skytt- och målvaktsvyn">
          ⏸<span className="r3d-lbl"> Frys före skott</span>
        </button>
        <button className="r3d-small" onClick={() => setMutedState(!muted)} title={muted ? 'Slå på ljudet' : 'Stäng av ljudet'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {score.saves + score.goals > 0 && (
        <button className="r3d-score" onClick={resetScore} title="Nollställ">
          <span>🧤 {score.saves}</span>
          <small>räddningar</small>
          <span>🚨 {score.goals}</span>
          <small>mål</small>
        </button>
      )}

      {challenge && (
        <div className="r3d-challenge">
          <strong>⏸ Skytten{hud.shooter ? ` #${hud.shooter}` : ''} ska skjuta!</strong>
          {hud.cam === 'goalie' ? (
            <span>Flytta dig med piltangenterna och se hur mycket mål skytten får. Tryck sedan S så skjuter skytten.</span>
          ) : (
            <span>Var finns det mest mål att skjuta på? Flytta målvakten med piltangenterna (byt vy med A/D) och tryck S för skott.</span>
          )}
        </div>
      )}

      {hud.pct !== null && v && (
        <div className="r3d-meter" style={{ ['--meter' as string]: v.color }}>
          <div className="r3d-meter-head">
            <span>{hud.shooter ? `Skytt #${hud.shooter} ser` : 'Skytten ser'}</span>
            <strong>{hud.pct} %</strong>
          </div>
          <div className="r3d-bar">
            <i style={{ width: `${hud.pct}%` }} />
          </div>
          <div className="r3d-verdict">{v.text}</div>
          <div className="r3d-legend">
            <span className="sw open" /> öppet <span className="sw tight" /> trångt
          </div>
          <button className="r3d-shoot" onClick={shoot} title="Skytten väljer: skjuta direkt, åka runt eller chansa (S)">
            🏒 Skjut! (S)
          </button>
        </div>
      )}
      {hud.pct === null && hud.cam !== 'overview' && (
        <div className="r3d-meter muted">{hud.duel ? `Ingen skottchans just nu – spela upp eller spola till när någon har ${words.puck}.` : `Ingen har ${words.puck} just nu.`}</div>
      )}

      {hud.cam === 'goalie' && (
        <>
          <div className="r3d-pip-label" style={{ left: pip.x, top: pip.top, width: pip.w }}>
            Så ser skytten{hud.shooter ? ` #${hud.shooter}` : ''} målet
          </div>
          <div className="r3d-pip-frame" style={{ left: pip.x, top: pip.top, width: pip.w, height: pip.h }} />
        </>
      )}

      {(hud.cam === 'goalie' || hud.adjusted) && (
        <div className="r3d-goalie">
          <div className="r3d-goalie-title">
            {hud.virtual ? '🥅 Du är målvakt' : `🥅 Målvakt ${hud.goalie ?? ''}`}
            {hud.depth !== null && <span> · {hud.depth.toFixed(1).replace('.', ',')} m ut</span>}
          </div>
          {hud.depth !== null &&
            coach(hud.depth, hud.lateral).map((c) => (
              <div key={c.text} className={`r3d-tip ${c.tone}`}>
                {c.text}
              </div>
            ))}
          {hud.cam === 'goalie' && (
            <div className="r3d-pad">
              <button {...hold(STEP_DEPTH, 0)} title={`Närmare ${words.puck} (↑)`}>
                ▲ Ut
              </button>
              <div>
                <button {...hold(0, -STEP_LAT)} title="Ett steg åt vänster (←)">
                  ◀
                </button>
                <button {...hold(0, STEP_LAT)} title="Ett steg åt höger (→)">
                  ▶
                </button>
              </div>
              <button {...hold(-STEP_DEPTH, 0)} title="Bakåt mot målet (↓)">
                ▼ In
              </button>
            </div>
          )}
          {hud.adjusted && (
            <button className="r3d-reset" onClick={() => setAdjust(null)} title="Tillbaka till målvaktens position i övningen (0)">
              ↺ Som i övningen
            </button>
          )}
        </div>
      )}

      {callout && (
        <div key={callout.id} className="r3d-callout">
          {callout.text}
        </div>
      )}

      {banner && <div className={`r3d-banner ${banner.kind}`}>{banner.kind === 'poke' ? words.pokeBanner : BANNERS[banner.kind]}</div>}
    </div>
  )
}
