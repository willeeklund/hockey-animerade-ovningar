import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { CONFIG } from '../config'
import { chaikin, simplify, wavy } from '../engine/path'
import { closestOnSegment, dividerEnds } from '../engine/walls'
import { layoutDividers } from '../editor/dividers'
import type { SimResult } from '../engine/simulate'
import { dist, wrapAngle } from '../engine/vec'
import { clampToField, DIVIDER, fieldOf } from '../model/rink'
import type { Action, Frame, Player, Vec } from '../model/types'
import { editContext, initialCarrierMap, roundAt, type EditContext } from '../editor/staticPlan'
import { useEditor } from '../editor/store'
import { RinkLines } from './RinkLines'

const TEAM_COLOR = { home: 'var(--home)', away: 'var(--away)' }
const PAD = 1.5

type Drag =
  | { kind: 'move'; id: string; pucks: string[] }
  | { kind: 'draw'; playerId: string; pts: Vec[] }
  | { kind: 'divider'; from: Vec; to: Vec }
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
    players[id] = { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, h: pa.h + wrapAngle(pb.h - pa.h) * k }
  }
  const pucks: Frame['pucks'] = {}
  for (const id in a.pucks) {
    const ka = a.pucks[id]
    const kb = b.pucks[id] ?? ka
    pucks[id] = { x: ka.x + (kb.x - ka.x) * k, y: ka.y + (kb.y - ka.y) * k, c: ka.c }
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

function PlayerGlyph({ p, x, y, h, selected, pending }: { p: Player; x: number; y: number; h: number; selected: boolean; pending: boolean }) {
  const goalie = p.role === 'G'
  return (
    <g transform={`translate(${x} ${y})`} style={{ cursor: 'pointer' }}>
      {(selected || pending) && <circle r={1.45} fill="none" stroke={pending ? '#f97316' : '#facc15'} strokeWidth={0.18} strokeDasharray="0.4 0.25" />}
      <line x1={0} y1={0} x2={Math.cos(h) * 1.6} y2={Math.sin(h) * 1.6} stroke="#3b2a1a" strokeWidth={0.16} strokeLinecap="round" />
      <circle r={0.95} fill={TEAM_COLOR[p.team]} stroke={goalie ? '#111' : '#fff'} strokeWidth={goalie ? 0.22 : 0.14} />
      <text y={0.32} textAnchor="middle" fontSize={p.label.length > 2 ? 0.65 : 0.85} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
        {p.label}
      </text>
    </g>
  )
}

const FOCUS_COLOR = '#facc15'

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

function stepText(tool: string, fromLabel: string | undefined): { count: string; text: string } | null {
  if (tool === 'mark') {
    return fromLabel
      ? { count: 'Steg 2 av 2', text: `Klicka på motståndaren som ${fromLabel} ska markera` }
      : { count: 'Steg 1 av 2', text: 'Klicka på försvararen, alltså den som ska markera' }
  }
  if (tool === 'pass') {
    return fromLabel ? { count: 'Steg 2 av 2', text: `Klicka på spelaren som ${fromLabel} passar till` } : { count: 'Steg 1 av 2', text: 'Klicka på puckföraren som ska passa' }
  }
  if (tool === 'divider') return { count: 'Sarg', text: 'Dra en linje där sargen ska stå, 2 m per bit. Ett klick lägger en bit.' }
  if (tool === 'shoot') {
    return fromLabel ? { count: 'Steg 2 av 2', text: `Klicka på målet som ${fromLabel} skjuter mot` } : { count: 'Steg 1 av 2', text: 'Klicka på puckföraren som ska skjuta' }
  }
  return null
}

export function Board({ sim, corner }: { sim: SimResult; corner?: ReactNode }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const st = useEditor()
  const { scenario, tool, time, playing, selectedId, pending, showPaths, showTrails, activeRound } = st
  const editing = st.editing && !playing
  const field = fieldOf(scenario.settings)
  const view = `${-field.halfLength - PAD} ${-field.halfWidth - PAD} ${2 * (field.halfLength + PAD)} ${2 * (field.halfWidth + PAD)}`
  const shownRound = editing ? activeRound : roundAt(scenario, time)
  const ctx = useMemo(() => editContext(scenario, shownRound, sim), [scenario, shownRound, sim])
  const frame = useMemo(() => (editing ? null : frameAt(sim, time)), [editing, sim, time])
  const firstRound = ctx.round === 0

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
      const cands = useEnd ? [c.plan.endPos[pl.id], c.pos[pl.id]] : [c.pos[pl.id]]
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
  const hitCone = (p: Vec) => scenario.cones?.find((c) => dist(c.pos, p) < 0.8)
  const hitDivider = (p: Vec) =>
    scenario.dividers?.find((d) => {
      const [a, b] = dividerEnds(d)
      return dist(p, closestOnSegment(p, a, b)) < 0.6
    })

  const currentContext = (): EditContext => {
    const now = useEditor.getState()
    return editContext(now.scenario, now.activeRound, sim)
  }

  const onDown = (e: PointerEvent) => {
    const p = toM(e)
    const capture = () => (e.target as Element).setPointerCapture?.(e.pointerId)
    const inside = clampToField(field, p, 0.6).pos
    if (st.presenting) return st.togglePlay(sim.duration)
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

    if (tool === 'select' || tool === 'home' || tool === 'away' || tool === 'goalie' || tool === 'puck' || tool === 'cone') {
      const grabPuck = firstRound ? scenario.pucks.find((k) => dist(k.pos, p) < 0.5) : undefined
      const hp = grabPuck ? undefined : hitPlayer(c, p)
      const hk = grabPuck ?? (hp || !firstRound ? undefined : (hitPuck(p) ?? hitCone(p) ?? hitDivider(p)))
      if (hp || hk) {
        const id = (hp ?? hk)!.id
        st.select(hp ? id : null)
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
      if (tool === 'goalie') {
        const rightIsAway = scenario.settings.homeAttacks === 'right'
        const team = p.x > 0 === rightIsAway ? 'away' : 'home'
        const gx = Math.sign(p.x || 1) * (field.goalLineX - 1)
        return st.addPlayer(team, 'G', { x: gx, y: 0 })
      }
      return st.addPlayer(tool, 'F', inside)
    }

    if (tool === 'skate') {
      const hp = hitPlayer(c, p, true) ?? scenario.players.find((x) => x.id === selectedId)
      if (!hp) return st.setMessage('Börja dra från en spelare')
      st.select(hp.id)
      st.setMessage(null)
      setDrag({ kind: 'draw', playerId: hp.id, pts: [c.plan.endPos[hp.id]] })
      capture()
      return
    }

    if (tool === 'pass' || tool === 'shoot') {
      if (!pending) {
        const hp = hitPlayer(c, p, true)
        if (!hp) return
        if (!c.plan.carriers.has(hp.id)) return st.setMessage(`${hp.label} har inte pucken. Lägg pucken intill en spelare eller passa först.`)
        st.setPending({ kind: tool, fromId: hp.id })
        st.select(hp.id)
        st.setMessage(null)
        return
      }
      if (pending.kind === 'pass') {
        const hp = hitPlayer(c, p, true)
        if (!hp || hp.id === pending.fromId) return
        st.addAction({ kind: 'pass', playerId: pending.fromId, toPlayerId: hp.id })
      } else {
        st.addAction({ kind: 'shoot', playerId: pending.fromId, goal: p.x < 0 ? 'left' : 'right' })
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
      const hit = hitPlayer(c, p) ?? hitPuck(p) ?? hitCone(p) ?? hitDivider(p)
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
    } else {
      const last = drag.pts[drag.pts.length - 1]
      if (dist(last, p) > 0.3) setDrag({ ...drag, pts: [...drag.pts, clampToField(field, p, 0.6).pos] })
    }
  }

  const onUp = () => {
    if (drag?.kind === 'move' && scenario.pucks.some((k) => k.id === drag.id)) st.snapPuck(drag.id)
    if (drag?.kind === 'divider') st.addDividers(drag.from, drag.to)
    if (drag?.kind === 'draw') {
      const raw = drag.pts
      const length = raw.reduce((acc, q, i) => (i ? acc + dist(raw[i - 1], q) : 0), 0)
      if (length > 1) {
        const path = chaikin(simplify(raw, 0.15), 2).slice(1)
        st.addAction({ kind: 'skate', playerId: drag.playerId, path, speed: st.drawSpeed })
      }
    }
    setDrag(null)
  }

  const teamOf = (id: string) => scenario.players.find((p) => p.id === id)?.team ?? 'home'

  const trails = useMemo(() => {
    if (editing || !showTrails) return []
    const end = Math.floor(time / sim.dt)
    const start = Math.max(0, end - Math.round(CONFIG.trailSeconds / sim.dt))
    return scenario.players.map((p) => {
      const pts: Vec[] = []
      for (let i = start; i <= end; i += 2) {
        const f = sim.frames[i]?.players[p.id]
        if (f) pts.push(f)
      }
      return { id: p.id, team: p.team, pts }
    })
  }, [editing, showTrails, time, sim, scenario.players])

  const focus = scenario.players.find((p) => p.id === scenario.focusId)
  const posOf = (p: Player) => {
    const f = frame?.players[p.id]
    if (f) return f
    const q = ctx.pos[p.id] ?? p.pos
    return { x: q.x, y: q.y, h: ctx.heading[p.id] ?? p.heading }
  }

  const pendingFrom = scenario.players.find((p) => p.id === pending?.fromId)
  const step = stepText(tool, pending?.kind === tool ? pendingFrom?.label : undefined)

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

        {showPaths && (
          <g opacity={editing ? 0.9 : 0.25} style={{ pointerEvents: 'none' }}>
            {ctx.actions.map((a) => {
              const g = ctx.plan.geom[a.id]
              if (!g) return null
              return <ActionShape key={a.id} a={a} from={g.from} to={g.to} withPuck={g.withPuck} color={TEAM_COLOR[teamOf(a.playerId)]} />
            })}
          </g>
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

        {scenario.players.map((p) => {
          const q = posOf(p)
          return <PlayerGlyph key={p.id} p={p} x={q.x} y={q.y} h={q.h} selected={p.id === selectedId} pending={pending?.fromId === p.id} />
        })}

        {scenario.pucks.map((k) => {
          const q = frame?.pucks[k.id] ?? ctx.pucks[k.id] ?? k.pos
          return <circle key={k.id} cx={q.x} cy={q.y} r={0.32} fill="#0a0a0a" stroke="#fff" strokeWidth={0.06} />
        })}

        {focus && <FocusRing {...posOf(focus)} />}
      </svg>
    </div>
  )
}
