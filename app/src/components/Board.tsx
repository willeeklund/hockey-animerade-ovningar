import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { CONFIG } from '../config'
import { chaikin, simplify, wavy } from '../engine/path'
import { closestOnSegment, dividerEnds } from '../engine/walls'
import { layoutDividers } from '../editor/dividers'
import type { SimResult } from '../engine/simulate'
import { GOALIE_CORE, GOALIE_REACH } from '../engine/world'
import { goalieSpot } from '../engine/ai'
import { dist, wrapAngle } from '../engine/vec'
import { clampToField, defendSide, DIVIDER, fieldOf, goalAcross, goalNormal, goalPoint, goalsOf, goalSide, nearestGoal, RINK } from '../model/rink'
import type { Action, Frame, Goal, Player, Vec } from '../model/types'
import { editContext, initialCarrierMap, openingActions, roundAt, type EditContext } from '../editor/staticPlan'
import { useEditor, type NewAction } from '../editor/store'
import { RinkLines } from './RinkLines'

const TEAM_COLOR = { home: 'var(--home)', away: 'var(--away)' }
const PAD = 1.5

type Drag =
  | { kind: 'move'; id: string; pucks: string[] }
  | { kind: 'draw'; playerId: string; pts: Vec[]; timed: boolean }
  | { kind: 'divider'; from: Vec; to: Vec }
  | { kind: 'aim'; playerId: string; goalId: string; start: Vec; aim: number; moved: boolean }
  | null

function frameAt(sim: SimResult, t: number): Frame {
  const i = t / sim.dt
  const i0 = Math.max(0, Math.min(sim.frames.length - 1, Math.floor(i)))
  const i1 = Math.min(sim.frames.length - 1, i0 + 1)
  const a = sim.frames[i0]
  const b = sim.frames[i1]
  const k = Math.max(0, Math.min(1, i - i0))
  const players: Frame['players'] = {}
  for (const id in a.players) {
    const pa = a.players[id]
    const pb = b.players[id] ?? pa
    players[id] = { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, h: pa.h + wrapAngle(pb.h - pa.h) * k, q: pa.q }
  }
  const pucks: Frame['pucks'] = {}
  for (const id in a.pucks) {
    const ka = a.pucks[id]
    const kb = b.pucks[id] ?? ka
    pucks[id] = { x: ka.x + (kb.x - ka.x) * k, y: ka.y + (kb.y - ka.y) * k, c: ka.c, s: ka.s }
  }
  return { t, players, pucks }
}

const pts2 = (pts: Vec[]) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

function ActionShape({ a, from, to, withPuck, color }: { a: Action; from: Vec; to?: Vec; withPuck: boolean; color: string }) {
  if (a.kind === 'skate') {
    const full = [from, ...a.path]
    const line = withPuck ? wavy(full) : full
    const dash = a.speed === 'slow' ? '0.5 0.35' : undefined
    return <polyline points={pts2(line)} fill="none" stroke={color} strokeWidth={a.speed === 'fast' ? 0.2 : 0.13} strokeDasharray={dash} markerEnd="url(#arrow)" style={{ color }} />
  }
  if (a.kind === 'pass' && to) {
    return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#111" strokeWidth={0.12} strokeDasharray="0.45 0.3" markerEnd="url(#arrow)" style={{ color: '#111' }} />
  }
  if (a.kind === 'shoot' && to) {
    const d = dist(from, to) || 1
    const nx = (-(to.y - from.y) / d) * 0.18
    const ny = ((to.x - from.x) / d) * 0.18
    return (
      <g stroke="#111" strokeWidth={0.1} style={{ color: '#111' }}>
        <line x1={from.x + nx} y1={from.y + ny} x2={to.x + nx} y2={to.y + ny} />
        <line x1={from.x - nx} y1={from.y - ny} x2={to.x - nx} y2={to.y - ny} markerEnd="url(#arrow)" />
      </g>
    )
  }
  if (a.kind === 'wait') {
    return (
      <text x={from.x + 1.1} y={from.y - 1.1} fontSize={0.8} fill="#111">
        ⏱ {a.seconds}s
      </text>
    )
  }
  return null
}

const GOALIE_DRAW_SCALE = 1.6

function GoalieGlyph({ p, x, y, h, faded, selected, pending, drawScale = GOALIE_DRAW_SCALE }: { p: Player; x: number; y: number; h: number; faded: boolean; selected: boolean; pending: boolean; drawScale?: number }) {
  const fill = TEAM_COLOR[p.team]
  const r = GOALIE_REACH
  const c = GOALIE_CORE
  return (
    <g transform={`translate(${x} ${y})`} style={{ cursor: 'pointer' }} opacity={faded ? 0.45 : 1}>
      {(selected || pending) && <circle r={1.6} fill="none" stroke={pending ? '#f97316' : '#facc15'} strokeWidth={0.16} strokeDasharray="0.4 0.25" />}
      <g transform={`rotate(${(h * 180) / Math.PI}) scale(${drawScale})`}>
        <path d={`M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r}`} fill="none" stroke="#111" strokeWidth={0.04} strokeDasharray="0.12 0.1" opacity={0.5} />
        <rect x={-0.18} y={-c} width={0.36} height={c * 2} rx={0.14} fill="#f8fafc" stroke="#111" strokeWidth={0.06} />
        <path d={`M -0.1 -0.04 H 0.12 M -0.1 0.04 H 0.12`} stroke="#111" strokeWidth={0.04} />
        <ellipse cx={-0.2} rx={0.26} ry={0.36} fill={fill} stroke="#111" strokeWidth={0.06} />
        <circle cx={-0.15} r={0.15} fill="#e5e7eb" stroke="#111" strokeWidth={0.05} />
        <circle cx={0.02} cy={r - 0.17} r={0.17} fill="#fde68a" stroke="#111" strokeWidth={0.05} />
        <rect x={-0.08} y={-r} width={0.2} height={0.3} rx={0.04} fill="#fde68a" stroke="#111" strokeWidth={0.05} />
        <path d={`M 0.02 ${-r + 0.3} L 0.26 ${-r + 0.42} L 0.26 0.15`} fill="none" stroke="#3b2a1a" strokeWidth={0.09} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {drawScale === GOALIE_DRAW_SCALE && (
      <text x={-Math.cos(h) * 1.35} y={-Math.sin(h) * 1.35 + 0.2} textAnchor="middle" fontSize={0.55} fontWeight={700} fill="#111" stroke="#fff" strokeWidth={0.08} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
        {p.label}
      </text>
      )}
    </g>
  )
}

const HEADING_LEN = 1.3
const SHOT_VIEW_RANGE = 16
const OPEN_COLOR = '#16a34a'
const CHANCE_COLOR = '#eab308'
const BLOCKED_COLOR = '#dc2626'

type Zone = { a: number; b: number; color: string }

function shotZones(goal: Goal, puck: Vec, goalie: Vec | undefined): Zone[] {
  const half = RINK.goalHalfWidth
  if (!goalie) return [{ a: -half, b: half, color: OPEN_COLOR }]
  const n = goalNormal(goal)
  const across = goalAcross(goal)
  const rel = (v: Vec) => ({ d: (v.x - goal.pos.x) * n.x + (v.y - goal.pos.y) * n.y, l: (v.x - goal.pos.x) * across.x + (v.y - goal.pos.y) * across.y })
  const s = rel(puck)
  const g = rel(goalie)
  const k = s.d / Math.max(0.3, s.d - g.d)
  const center = s.l + (g.l - s.l) * k
  const gaps = (reach: number) =>
    [
      [-half, Math.min(half, center - reach * k)],
      [Math.max(-half, center + reach * k), half],
    ].filter(([a, b]) => b - a > 0.05)
  return [...gaps(GOALIE_CORE).map(([a, b]) => ({ a, b, color: CHANCE_COLOR })), ...gaps(GOALIE_REACH).map(([a, b]) => ({ a, b, color: OPEN_COLOR }))]
}

const zoneAt = (zones: Zone[], lat: number) => zones.filter((z) => lat >= z.a && lat <= z.b).at(-1)?.color ?? BLOCKED_COLOR

function ZoneShapes({ goal, puck, zones, posts = true }: { goal: Goal; puck: Vec; zones: Zone[]; posts?: boolean }) {
  const at = (l: number) => goalPoint(goal, l)
  const half = RINK.goalHalfWidth
  return (
    <g style={{ pointerEvents: 'none' }}>
      {zones.map(({ a, b, color }) => (
        <g key={`${color}${a}`}>
          <polygon points={pts2([puck, at(a), at(b)])} fill={color} opacity={0.22} />
          <line x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} stroke={color} strokeWidth={0.22} strokeLinecap="round" />
        </g>
      ))}
      {posts &&
        [-half, half].map((l) => <line key={l} x1={puck.x} y1={puck.y} x2={at(l).x} y2={at(l).y} stroke="#0f172a" strokeWidth={0.05} strokeDasharray="0.25 0.2" opacity={0.5} />)}
    </g>
  )
}

function ShotLanes({ frame, players, goals }: { frame: Frame; players: Player[]; goals: Goal[] }) {
  const out: ReactNode[] = []
  for (const gk of players) {
    const gp = frame.players[gk.id]
    if (gk.role !== 'G' || !gp || gp.q) continue
    const goal = nearestGoal(goals, gp)
    if (!goal) continue
    const shooter = Object.values(frame.pucks)
      .filter((k) => k.c && !k.s)
      .map((k) => ({ k, p: players.find((q) => q.id === k.c) }))
      .find(({ p }) => p && p.team !== gk.team && p.role !== 'G' && p.role !== 'C')
    if (!shooter) continue
    const puck = shooter.k
    const n = goalNormal(goal)
    if ((puck.x - goal.pos.x) * n.x + (puck.y - goal.pos.y) * n.y < 0.8 || dist(puck, goal.pos) > SHOT_VIEW_RANGE) continue
    out.push(<ZoneShapes key={gk.id} goal={goal} puck={puck} zones={shotZones(goal, puck, gp)} />)
  }
  return <>{out}</>
}

const AIM_GAIN = 0.25
const AIM_MAX = RINK.goalHalfWidth - 0.05
const AIM_MIN_DRAG = 0.4
const MAG = 2.6
const MAG_R = 4.2
const MAG_FOCUS = 1

function AimView({ goal, from, aim, goalie }: { goal: Goal; from: Vec; aim: number; goalie?: { p: Player; pos: Vec } }) {
  const n = goalNormal(goal)
  const across = goalAcross(goal)
  const gRef = { pos: goal.pos, n, perp: across }
  const spot = goalie ? goalieSpot(gRef, from) : undefined
  const zones = shotZones(goal, from, spot)
  const target = goalPoint(goal, aim)
  const color = zoneAt(zones, aim)
  const side = (from.x - goal.pos.x) * across.x + (from.y - goal.pos.y) * across.y > 0 ? -1 : 1
  const c = { x: goal.pos.x + n.x * (MAG_R + 2.2) + across.x * side * (MAG_R + 1), y: goal.pos.y + n.y * (MAG_R + 2.2) + across.y * side * (MAG_R + 1) }
  const face = spot ? Math.atan2(from.y - spot.y, from.x - spot.x) : 0
  const scene = (
    <>
      <ZoneShapes goal={goal} puck={from} zones={zones} />
      <line x1={from.x} y1={from.y} x2={target.x} y2={target.y} stroke={color} strokeWidth={0.12} strokeLinecap="round" />
      <circle cx={target.x} cy={target.y} r={0.14} fill="#fff" stroke={color} strokeWidth={0.07} />
    </>
  )
  return (
    <g style={{ pointerEvents: 'none' }}>
      {scene}
      <defs>
        <clipPath id="aim-mag">
          <circle cx={c.x} cy={c.y} r={MAG_R} />
        </clipPath>
      </defs>
      <line x1={c.x} y1={c.y} x2={goal.pos.x} y2={goal.pos.y} stroke="#0f172a" strokeWidth={0.08} opacity={0.35} />
      <g clipPath="url(#aim-mag)">
        <circle cx={c.x} cy={c.y} r={MAG_R} fill="#f8fafc" />
        <g transform={`translate(${c.x} ${c.y}) scale(${MAG}) translate(${-goal.pos.x - n.x * MAG_FOCUS} ${-goal.pos.y - n.y * MAG_FOCUS})`}>
          <GoalGlyph g={goal} selected={false} />
          <ZoneShapes goal={goal} puck={from} zones={zones} posts={false} />
          {goalie && spot && <GoalieGlyph p={goalie.p} x={spot.x} y={spot.y} h={face} faded={false} selected={false} pending={false} drawScale={1} />}
          <line x1={from.x} y1={from.y} x2={target.x} y2={target.y} stroke={color} strokeWidth={0.05} strokeLinecap="round" />
          <circle cx={target.x} cy={target.y} r={0.09} fill="#fff" stroke={color} strokeWidth={0.04} />
          <path d={`M ${target.x - 0.2} ${target.y} H ${target.x + 0.2} M ${target.x} ${target.y - 0.2} V ${target.y + 0.2}`} stroke="#0f172a" strokeWidth={0.02} />
        </g>
      </g>
      <circle cx={c.x} cy={c.y} r={MAG_R} fill="none" stroke={color} strokeWidth={0.2} />
    </g>
  )
}

const INSTRUCTION_TOOLS = new Set(['skate', 'pass', 'shoot', 'mark'])
const MIN_LEAD = 0.15
const GHOST_MIN = 1

const TRAIL_OPACITY = 0.28
const TRAIL_SELECTED_OPACITY = 0.6
const GHOST_OPACITY = 0.18

function LookAhead({ sim, ctx, players, selectedId, detailed }: { sim: SimResult; ctx: EditContext; players: Player[]; selectedId: string | null; detailed: boolean }) {
  const i0 = Math.round(ctx.startT / sim.dt)
  const i1 = Math.round(ctx.focusT / sim.dt)
  const step = Math.max(1, Math.round(0.1 / sim.dt))
  return (
    <g style={{ pointerEvents: 'none' }}>
      {players.map((p) => {
        const start = ctx.pos[p.id]
        const now = ctx.now[p.id]
        if (!start || !now || dist(start, now) < GHOST_MIN) return null
        const drawn = ctx.actions.some((a) => a.playerId === p.id && a.kind === 'skate')
        const pts: Vec[] = []
        for (let i = i0; i <= i1; i += step) {
          const fp = sim.frames[i]?.players[p.id]
          if (fp) pts.push(fp)
        }
        pts.push(now)
        const id = `look-${p.id}`
        const peak = p.id === selectedId ? TRAIL_SELECTED_OPACITY : TRAIL_OPACITY
        return (
          <g key={p.id}>
            {!drawn && (
              <>
                <defs>
                  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={now.x} y2={now.y}>
                    <stop offset="0" style={{ stopColor: TEAM_COLOR[p.team], stopOpacity: 0.04 }} />
                    <stop offset="1" style={{ stopColor: TEAM_COLOR[p.team], stopOpacity: peak }} />
                  </linearGradient>
                </defs>
                <polyline points={pts2(pts)} fill="none" stroke={`url(#${id})`} strokeWidth={0.12} strokeDasharray="0.3 0.25" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
            <g opacity={GHOST_OPACITY}>
              <PlayerGlyph p={p} x={start.x} y={start.y} h={ctx.heading[p.id] ?? p.heading} faded={false} selected={false} pending={false} detailed={detailed} />
            </g>
          </g>
        )
      })}
    </g>
  )
}

function PlayerGlyph({ p, x, y, h, faded, selected, pending, detailed = false }: { p: Player; x: number; y: number; h: number; faded: boolean; selected: boolean; pending: boolean; detailed?: boolean }) {
  if (detailed && p.role === 'G') return <GoalieGlyph p={p} x={x} y={y} h={h} faded={faded} selected={selected} pending={pending} />
  const goalie = p.role === 'G'
  const fill = p.role === 'C' ? '#334155' : TEAM_COLOR[p.team]
  return (
    <g transform={`translate(${x} ${y})`} style={{ cursor: 'pointer' }} opacity={faded ? 0.45 : 1}>
      {(selected || pending) && <circle r={1.45} fill="none" stroke={pending ? '#f97316' : '#facc15'} strokeWidth={0.18} strokeDasharray="0.4 0.25" />}
      <line x1={0} y1={0} x2={Math.cos(h) * HEADING_LEN} y2={Math.sin(h) * HEADING_LEN} stroke="#3b2a1a" strokeWidth={0.09} strokeLinecap="round" opacity={0.75} />
      <circle r={0.95} fill={fill} stroke={goalie ? '#111' : '#fff'} strokeWidth={goalie ? 0.22 : 0.14} />
      <text y={0.32} textAnchor="middle" fontSize={p.label.length > 2 ? 0.65 : 0.85} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
        {p.label}
      </text>
    </g>
  )
}

const FOCUS_COLOR = '#facc15'
const GOAL_RED = '#c8102e'

function GoalGlyph({ g, selected }: { g: Goal; selected: boolean }) {
  const w = RINK.goalHalfWidth
  const c = RINK.creaseR
  return (
    <g transform={`translate(${g.pos.x} ${g.pos.y}) rotate(${(g.angle * 180) / Math.PI})`} style={{ cursor: 'pointer' }}>
      <path d={`M 0 ${-c} A ${c} ${c} 0 0 1 0 ${c} Z`} fill="#bfe3f7" stroke={GOAL_RED} strokeWidth={0.05} />
      <rect x={-RINK.goalDepth} y={-w} width={RINK.goalDepth} height={w * 2} rx={0.3} fill="#fff" stroke={GOAL_RED} strokeWidth={0.12} />
      <path d={`M 0 ${-w} V ${w}`} stroke={GOAL_RED} strokeWidth={0.15} />
      {selected && <circle cx={0.2} r={2.3} fill="none" stroke="#facc15" strokeWidth={0.18} strokeDasharray="0.4 0.25" />}
    </g>
  )
}

function FocusRing({ x, y }: { x: number; y: number }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={1.35} fill="none" stroke={FOCUS_COLOR} strokeWidth={0.18} />
      <text x={x} y={y - 1.7} textAnchor="middle" fontSize={0.9} fill={FOCUS_COLOR} stroke="#1f2937" strokeWidth={0.08} paintOrder="stroke">
        ★
      </text>
    </g>
  )
}

function stepText(tool: string, fromLabel: string | undefined, goalCount: number): { count: string; text: string } | null {
  if (tool === 'mark') {
    return fromLabel
      ? { count: 'Steg 2 av 2', text: `Klicka på motståndaren som ${fromLabel} ska markera` }
      : { count: 'Steg 1 av 2', text: 'Klicka på försvararen, alltså den som ska markera' }
  }
  if (tool === 'pass') {
    return fromLabel ? { count: 'Passa', text: `Klicka på spelaren som ${fromLabel} passar till` } : { count: 'Passa', text: 'Klicka på puckföraren som ska passa' }
  }
  if (tool === 'divider') return { count: 'Sarg', text: 'Dra en linje där sargen ska stå, 2 m per bit. Ett klick lägger en bit.' }
  if (tool === 'shoot') {
    if (!fromLabel) return { count: 'Skjut', text: 'Klicka på puckföraren som ska skjuta' }
    return { count: 'Skjut', text: `${goalCount === 1 ? 'Klicka på planen' : 'Klicka nära målet'} för att låta ${fromLabel} skjuta. Håll kvar och dra i sidled för att sikta.` }
  }
  return null
}

export function Board({ sim, corner }: { sim: SimResult; corner?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const st = useEditor()
  const { scenario, tool, time, playing, selectedId, pending, showPaths, showTrails, showDetails, activeRound } = st
  const editing = st.editing && !playing
  const field = fieldOf(scenario.settings)
  const view = `${-field.halfLength - PAD} ${-field.halfWidth - PAD} ${2 * (field.halfLength + PAD)} ${2 * (field.halfWidth + PAD)}`
  const shownRound = editing ? activeRound : roundAt(scenario, time)
  const ctx = useMemo(() => editContext(scenario, shownRound, sim), [scenario, shownRound, sim])
  const frame = useMemo(() => (editing ? null : frameAt(sim, time)), [editing, sim, time])
  const firstRound = ctx.round === 0
  const lookAhead = (c: EditContext) => INSTRUCTION_TOOLS.has(tool) && c.focusT > c.startT + 0.05
  const ahead = editing && lookAhead(ctx)

  const toM = (e: PointerEvent): Vec => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }

  const hitPlayer = (c: EditContext, p: Vec, useEnd = false) => {
    let best: Player | undefined
    let bestD = 1.3
    for (const pl of scenario.players) {
      const cands = lookAhead(c) ? [c.now[pl.id]] : useEnd ? [c.plan.endPos[pl.id], c.pos[pl.id]] : [c.pos[pl.id]]
      for (const q of cands) {
        if (!q) continue
        const d = dist(q, p)
        if (d < bestD) {
          bestD = d
          best = pl
        }
      }
    }
    return best
  }
  const hitPuck = (p: Vec) => scenario.pucks.find((k) => dist(k.pos, p) < 0.8)
  const goals = goalsOf(scenario)
  const hitGoal = (p: Vec) =>
    goals.find((g) => {
      const n = goalNormal(g)
      return dist(p, { x: g.pos.x - n.x * 0.3, y: g.pos.y - n.y * 0.3 }) < 1.4
    })
  const hitCone = (p: Vec) => scenario.cones?.find((c) => dist(c.pos, p) < 0.8)
  const hitDivider = (p: Vec) =>
    scenario.dividers?.find((d) => {
      const [a, b] = dividerEnds(d)
      return dist(p, closestOnSegment(p, a, b)) < 0.6
    })

  const carriersOf = (c: EditContext) => (lookAhead(c) ? c.nowCarriers : c.plan.carriers)
  const startOf = (c: EditContext, id: string): Vec => (lookAhead(c) ? c.now[id] : c.plan.endPos[id])

  const passer = (c: EditContext) => {
    const carriers = carriersOf(c)
    if (selectedId && carriers.has(selectedId)) return selectedId
    return carriers.size === 1 ? [...carriers][0] : undefined
  }

  const addTimed = (a: NewAction, timed = true) => {
    const c = currentContext()
    const mine = c.actions.filter((x) => x.playerId === a.playerId)
    const ends = mine.map((x) => sim.actionEnds[x.id])
    const lastEnd = mine.length === 0 ? c.startT : ends.every((t) => t !== undefined) ? Math.max(...(ends as number[])) : Infinity
    const gap = timed ? c.focusT - lastEnd : 0
    const seconds = Math.round(gap * 100) / 100
    const lead: NewAction[] = gap > MIN_LEAD ? [scenario.settings.autonomous ? { kind: 'play', playerId: a.playerId, seconds, keepPuck: true } : { kind: 'wait', playerId: a.playerId, seconds }] : []
    st.addActions([...lead, a])
  }

  useEffect(() => {
    if (!editing || (tool !== 'pass' && tool !== 'shoot') || pending) return
    const id = passer(ctx)
    if (!id) return
    st.setPending({ kind: tool, fromId: id })
    st.select(id)
  })

  const currentContext = (): EditContext => {
    const now = useEditor.getState()
    return editContext(now.scenario, now.activeRound, sim)
  }

  const onDown = (e: PointerEvent) => {
    const p = toM(e)
    const capture = () => (e.target as Element).setPointerCapture?.(e.pointerId)
    const inside = clampToField(field, p, 0.6).pos
    if (st.presenting) return st.idle && playing ? undefined : st.togglePlay(sim.duration)
    if (playing) return st.setPlaying(false)

    if (!editing) {
      if (tool === 'skate' || tool === 'pass' || tool === 'shoot' || tool === 'mark') {
        st.beginEditHere()
      } else {
        const hp = scenario.players.find((pl) => frame?.players[pl.id] && dist(frame.players[pl.id], p) < 1.3)
        st.select(hp?.id ?? null)
        if (tool !== 'select') st.setMessage('Pausat. Välj Åk, Passa eller Skjut för att ge nästa runda instruktioner härifrån.')
        return
      }
    }
    const c = editing ? ctx : currentContext()

    if (tool === 'divider') {
      if (!firstRound) return st.setMessage('Sarger läggs ut i runda 1.')
      setDrag({ kind: 'divider', from: inside, to: inside })
      capture()
      return
    }

    if (tool === 'select' || tool === 'home' || tool === 'away' || tool === 'goalie' || tool === 'coach' || tool === 'goal' || tool === 'puck' || tool === 'cone') {
      const grabPuck = firstRound ? scenario.pucks.find((k) => dist(k.pos, p) < 0.5) : undefined
      const hp = grabPuck ? undefined : hitPlayer(c, p)
      const hg = grabPuck || hp || tool === 'goalie' ? undefined : hitGoal(p)
      const hk = grabPuck ?? (hp || hg || !firstRound ? undefined : (hitPuck(p) ?? hitCone(p) ?? hitDivider(p)))
      if (hp || hg || hk) {
        const id = (hp ?? hg ?? hk)!.id
        st.select(hp || hg ? id : null)
        if (hg) {
          if (!firstRound) return
          st.checkpoint()
          setDrag({ kind: 'move', id, pucks: [] })
          capture()
          return
        }
        if (!firstRound) return
        st.checkpoint()
        const carried = [...initialCarrierMap(scenario)].filter(([, carrier]) => carrier === id).map(([puckId]) => puckId)
        setDrag({ kind: 'move', id, pucks: carried })
        capture()
        return
      }
      if (tool === 'select') return st.select(null)
      if (!firstRound) return st.setMessage('Spelare och puckar läggs ut i runda 1.')
      if (tool === 'puck') return st.addPuck(inside)
      if (tool === 'cone') return st.addCone(inside)
      if (tool === 'goal') return st.addGoal(clampToField(field, p, 1.5).pos)
      if (tool === 'coach') return st.addPlayer('home', 'C', inside)
      if (tool === 'goalie') {
        const goal = nearestGoal(goals, p)
        if (!goal) return st.setMessage('Lägg ut en målbur först.')
        const team = goalSide(goal) === defendSide('away', scenario.settings) ? 'away' : 'home'
        const n = goalNormal(goal)
        return st.addPlayer(team, 'G', { x: goal.pos.x + n.x, y: goal.pos.y + n.y })
      }
      return st.addPlayer(tool, 'F', inside)
    }

    if (tool === 'skate') {
      const ghost = lookAhead(c) ? scenario.players.find((pl) => !c.actions.some((a) => a.playerId === pl.id) && dist(c.pos[pl.id], p) < 1.3 && dist(c.pos[pl.id], c.now[pl.id]) > GHOST_MIN) : undefined
      const hp = ghost ?? hitPlayer(c, p, true) ?? scenario.players.find((x) => x.id === selectedId)
      if (!hp) return st.setMessage('Börja dra från en spelare')
      st.select(hp.id)
      st.setMessage(null)
      setDrag({ kind: 'draw', playerId: hp.id, pts: [ghost ? c.pos[hp.id] : startOf(c, hp.id)], timed: !ghost })
      capture()
      return
    }

    if (tool === 'pass' || tool === 'shoot') {
      const hp = hitPlayer(c, p, true)
      const switchTo = hp && carriersOf(c).has(hp.id) && hp.id !== pending?.fromId ? hp : undefined
      const fromId = switchTo ? undefined : pending?.kind === tool ? pending.fromId : passer(c)
      if (!fromId) {
        if (!hp) return
        if (!switchTo) return st.setMessage(`${hp.label} har inte pucken. Lägg pucken intill en spelare eller passa först.`)
        st.setPending({ kind: tool, fromId: hp.id })
        st.select(hp.id)
        st.setMessage(null)
        return
      }
      if (tool === 'pass') {
        if (!hp || hp.id === fromId) return
        addTimed({ kind: 'pass', playerId: fromId, toPlayerId: hp.id })
      } else {
        const goal = nearestGoal(goals, p)
        if (!goal) return st.setMessage('Det finns ingen målbur att skjuta på.')
        setDrag({ kind: 'aim', playerId: fromId, goalId: goal.id, start: p, aim: 0, moved: false })
        capture()
        return
      }
      st.setPending(null)
      st.setMessage(null)
      return
    }

    if (tool === 'mark') {
      const hp = hitPlayer(c, p, true)
      if (!hp) return
      if (!pending) {
        if (hp.role === 'G') return st.setMessage('Målvakten kan inte markera.')
        st.setPending({ kind: 'mark', fromId: hp.id })
        st.select(hp.id)
        st.setMessage(null)
        return
      }
      const from = scenario.players.find((x) => x.id === pending.fromId)
      if (hp.id === pending.fromId || !from) return
      if (hp.team === from.team || hp.role === 'G') return st.setMessage('Välj en utespelare i motståndarlaget.')
      st.addMark(from.id, hp.id)
      st.setPending(null)
      st.setMessage(null)
      st.setTool('select')
      return
    }

    if (tool === 'erase') {
      if (!firstRound) return st.setMessage('Spelare och puckar tas bort i runda 1.')
      const hit = hitPlayer(c, p) ?? hitPuck(p) ?? hitCone(p) ?? hitDivider(p) ?? hitGoal(p)
      if (hit) st.removeObject(hit.id)
    }
  }

  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const p = toM(e)
    if (drag.kind === 'move') {
      st.moveObject(drag.id, clampToField(field, p, 0.6).pos, drag.pucks)
    } else if (drag.kind === 'divider') {
      setDrag({ ...drag, to: clampToField(field, p, 0.6).pos })
    } else if (drag.kind === 'aim') {
      const goal = goals.find((g) => g.id === drag.goalId)
      if (!goal) return
      const across = goalAcross(goal)
      const lateral = (p.x - drag.start.x) * across.x + (p.y - drag.start.y) * across.y
      setDrag({ ...drag, aim: Math.max(-AIM_MAX, Math.min(AIM_MAX, lateral * AIM_GAIN)), moved: drag.moved || dist(p, drag.start) > AIM_MIN_DRAG })
    } else {
      const last = drag.pts[drag.pts.length - 1]
      if (dist(last, p) > 0.3) setDrag({ ...drag, pts: [...drag.pts, clampToField(field, p, 0.6).pos] })
    }
  }

  const onUp = () => {
    if (drag?.kind === 'move' && scenario.pucks.some((k) => k.id === drag.id)) st.snapPuck(drag.id)
    if (drag?.kind === 'divider') st.addDividers(drag.from, drag.to)
    if (drag?.kind === 'aim') {
      const goal = goals.find((g) => g.id === drag.goalId)
      if (goal) addTimed({ kind: 'shoot', playerId: drag.playerId, goal: goalSide(goal), goalId: goal.id, ...(drag.moved ? { aim: Math.round(drag.aim * 100) / 100 } : {}) })
      st.setPending(null)
      st.setMessage(null)
    }
    if (drag?.kind === 'draw') {
      const raw = drag.pts
      const length = raw.reduce((acc, q, i) => (i ? acc + dist(raw[i - 1], q) : 0), 0)
      if (length > 1) {
        const path = chaikin(simplify(raw, 0.15), 2).slice(1)
        addTimed({ kind: 'skate', playerId: drag.playerId, path, speed: st.drawSpeed }, drag.timed)
      }
    }
    setDrag(null)
  }

  const teamOf = (id: string) => scenario.players.find((p) => p.id === id)?.team ?? 'home'

  const trails = useMemo(() => {
    if (editing || !showTrails) return []
    const end = Math.floor(time / sim.dt)
    const start = Math.max(0, end - Math.round(CONFIG.trailSeconds / sim.dt))
    return scenario.players.filter((p) => showDetails || p.role !== 'G').map((p) => {
      const pts: Vec[] = []
      for (let i = start; i <= end; i += 2) {
        const f = sim.frames[i]?.players[p.id]
        if (f) pts.push(f)
      }
      return { id: p.id, team: p.team, pts }
    })
  }, [editing, showTrails, showDetails, time, sim, scenario.players])

  const focus = scenario.players.find((p) => p.id === scenario.focusId)
  const posOf = (p: Player) => {
    const f = frame?.players[p.id]
    if (f) return f
    if (ahead && ctx.now[p.id]) return ctx.now[p.id]
    const q = ctx.pos[p.id] ?? p.pos
    return { x: q.x, y: q.y, h: ctx.heading[p.id] ?? p.heading }
  }

  const pendingFrom = scenario.players.find((p) => p.id === pending?.fromId)
  const step = stepText(tool, pending?.kind === tool ? pendingFrom?.label : undefined, goals.length)
  const aimView = (() => {
    if (drag?.kind !== 'aim') return null
    const goal = goals.find((g) => g.id === drag.goalId)
    const from = startOf(ctx, drag.playerId)
    if (!goal || !from) return null
    const shooterTeam = teamOf(drag.playerId)
    const gk = scenario.players.find((q) => q.role === 'G' && q.team !== shooterTeam && posOf(q) && nearestGoal(goals, posOf(q)) === goal)
    return <AimView goal={goal} from={from} aim={drag.moved ? drag.aim : 0} goalie={gk ? { p: gk, pos: posOf(gk) } : undefined} />
  })()

  const shotFrom = editing && tool === 'shoot' && pending?.kind === 'shoot' && goals.length === 1 ? startOf(ctx, pending.fromId) : undefined

  return (
    <div className="board-wrap">
      {corner}
      {step && !st.presenting && (
        <div className="step-banner" role="status">
          <span className="step-count">{step.count}</span>
          <span>{step.text}</span>
          {st.message && <span className="step-error">{st.message}</span>}
        </div>
      )}
      <svg
        ref={svgRef}
        className={`board tool-${tool}`}
        viewBox={view}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <RinkLines field={field} />
        {goals.map((g) => (
          <GoalGlyph key={g.id} g={g} selected={g.id === selectedId} />
        ))}

        {showPaths && (
          <g opacity={editing ? 0.9 : 0.25} style={{ pointerEvents: 'none' }}>
            {openingActions(ctx.actions).map((a) => {
              const g = ctx.plan.geom[a.id]
              if (!g || (!editing && a.kind === 'wait')) return null
              const live = editing ? ctx.simGeom[a.id] : undefined
              return <ActionShape key={a.id} a={a} from={live?.from ?? g.from} to={live?.to ?? g.to} withPuck={g.withPuck} color={TEAM_COLOR[teamOf(a.playerId)]} />
            })}
          </g>
        )}

        {shotFrom && (
          <line
            x1={shotFrom.x}
            y1={shotFrom.y}
            x2={goals[0].pos.x}
            y2={goals[0].pos.y}
            stroke="#111"
            strokeWidth={0.1}
            strokeDasharray="0.45 0.3"
            markerEnd="url(#arrow)"
            opacity={0.45}
            style={{ color: '#111', pointerEvents: 'none' }}
          />
        )}

        {drag?.kind === 'draw' && (
          <polyline points={pts2(drag.pts)} fill="none" stroke={TEAM_COLOR[teamOf(drag.playerId)]} strokeWidth={0.15} strokeDasharray="0.3 0.2" />
        )}

        {[
          ...(scenario.dividers ?? []).map((d) => ({ ...d, preview: false })),
          ...(drag?.kind === 'divider' ? layoutDividers(drag.from, drag.to).map((d, i) => ({ ...d, id: `preview-${i}`, preview: true })) : []),
        ].map((d) => (
          <rect
            key={d.id}
            x={-DIVIDER.length / 2}
            y={-DIVIDER.thickness / 2}
            width={DIVIDER.length}
            height={DIVIDER.thickness}
            rx={0.08}
            transform={`translate(${d.pos.x} ${d.pos.y}) rotate(${(d.angle * 180) / Math.PI})`}
            fill="#2563eb"
            stroke="#1e3a8a"
            strokeWidth={0.05}
            opacity={d.preview ? 0.5 : 1}
            style={{ cursor: 'pointer' }}
          />
        ))}

        {scenario.cones?.map((c) => (
          <g key={c.id} transform={`translate(${c.pos.x} ${c.pos.y})`} style={{ cursor: 'pointer' }}>
            <circle r={0.55} fill="#fb923c" stroke="#c2410c" strokeWidth={0.1} />
            <circle r={0.2} fill="#fff7ed" />
          </g>
        ))}

        {showPaths &&
          ctx.actions.map((a) => {
            if (a.kind !== 'mark') return null
            const marker = scenario.players.find((p) => p.id === a.playerId)
            const man = scenario.players.find((p) => p.id === a.targetId)
            if (!marker || !man) return null
            const q1 = posOf(marker)
            const q2 = posOf(man)
            return (
              <g key={a.id} style={{ pointerEvents: 'none' }} opacity={editing ? 0.9 : 0.6}>
                <line x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke={TEAM_COLOR[marker.team]} strokeWidth={0.12} strokeDasharray="0.25 0.2" />
                <circle cx={q2.x} cy={q2.y} r={1.25} fill="none" stroke={TEAM_COLOR[marker.team]} strokeWidth={0.1} strokeDasharray="0.3 0.2" />
              </g>
            )
          })}

        {trails.map((tr) => (
          <polyline
            key={tr.id}
            points={pts2(tr.pts)}
            fill="none"
            stroke={tr.id === scenario.focusId ? FOCUS_COLOR : TEAM_COLOR[tr.team]}
            strokeOpacity={tr.id === scenario.focusId ? 0.9 : 0.35}
            strokeWidth={0.35}
            strokeLinecap="round"
          />
        ))}

        {frame && showDetails && <ShotLanes frame={frame} players={scenario.players} goals={goals} />}

        {ahead && <LookAhead sim={sim} ctx={ctx} players={showDetails ? scenario.players : scenario.players.filter((p) => p.role !== 'G')} selectedId={selectedId} detailed={showDetails} />}

        {scenario.players.map((p) => {
          const q = posOf(p)
          const first = scenario.actions.find((a) => a.playerId === p.id)
          const later = !first && scenario.rounds?.some((r) => r.actions.some((a) => a.playerId === p.id && a.kind !== 'wait'))
          const f = frame?.players[p.id]
          return (
            <PlayerGlyph
              key={p.id}
              p={p}
              x={q.x}
              y={q.y}
              h={q.h}
              faded={f ? !!f.q : !!p.idle && !later && (!first || first.kind === 'wait')}
              selected={p.id === selectedId}
              pending={pending?.fromId === p.id}
              detailed={showDetails}
            />
          )
        })}

        {scenario.pucks.map((k) => {
          const f = frame?.pucks[k.id]
          const q = f ?? (ahead ? ctx.nowPucks[k.id] : undefined) ?? ctx.pucks[k.id] ?? k.pos
          const spare = f ? !!f.s : !!k.spare
          return <circle key={k.id} cx={q.x} cy={q.y} r={spare ? 0.26 : 0.32} fill="#0a0a0a" stroke="#fff" strokeWidth={0.06} opacity={spare ? 0.3 : 1} />
        })}

        {focus && <FocusRing {...posOf(focus)} />}

        {aimView}
      </svg>
      {ahead && <div className="look-ahead">Läget vid {ctx.focusT.toFixed(1)} s, när senaste instruktionen är klar</div>}
    </div>
  )
}
