import { useEffect, useRef, useState } from 'react'
import type { SimResult } from '../engine/simulate'
import { roundAt, roundsOf } from '../editor/staticPlan'
import { useEditor } from '../editor/store'
import type { Scenario, Side } from '../model/types'

const EXTEND_PX_PER_SEC = 20
const MAX_EXTEND_SEC = 30

const flipped = (s: Side): Side => (s === 'left' ? 'right' : 'left')

function directionBefore(s: Scenario, round: number): Side {
  let side = s.settings.homeAttacks
  for (const r of (s.rounds ?? []).slice(0, round - 1)) side = r.homeAttacks ?? side
  return side
}

const EVENT_LABEL: Record<string, string> = {
  pass: 'Pass',
  shot: 'Skott',
  goal: 'MÅL',
  save: 'Räddning',
  rebound: 'Retur',
  steal: 'Bryt',
  offside: 'Offside',
}

export function Timeline({ sim, compact = false }: { sim: SimResult; compact?: boolean }) {
  const st = useEditor()
  const { scenario, time, playing, rate, showPaths, showTrails, editing, activeRound } = st
  const last = useRef<number | null>(null)
  const scrubRef = useRef<HTMLDivElement>(null)
  const [trim, setTrim] = useState<number | null>(null)

  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    let raf = 0
    const tick = (now: number) => {
      const prev = last.current ?? now
      last.current = now
      const s = useEditor.getState()
      const next = s.time + Math.min(0.1, (now - prev) / 1000) * s.rate
      if (next >= sim.duration) {
        s.setTime(sim.duration)
        s.setPlaying(false)
        return
      }
      s.setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sim.duration])

  const events = sim.events.filter((e) => EVENT_LABEL[e.kind])
  const rounds = roundsOf(scenario)
  const current = editing ? activeRound : roundAt(scenario, time)
  const paused = !playing && !editing && time > 0 && time < sim.duration - sim.dt / 2
  const minEnd = (scenario.rounds?.at(-1)?.startT ?? 0) + 0.5
  const trimAt = (clientX: number) => {
    const r = scrubRef.current!.getBoundingClientRect()
    const beyond = clientX - r.right
    const t = beyond > 0 ? sim.duration + beyond / EXTEND_PX_PER_SEC : ((clientX - r.left) / r.width) * sim.duration
    return Math.round(Math.min(sim.duration + MAX_EXTEND_SEC, Math.max(minEnd, t)) * 10) / 10
  }
  const pct = (t: number) => `${Math.min(1, t / sim.duration) * 100}%`
  const end = trim ?? sim.duration
  const trimming = trim !== null

  useEffect(() => {
    if (!trimming) return
    const move = (e: globalThis.PointerEvent) => setTrim(trimAt(e.clientX))
    const up = () => {
      if (trim !== null && Math.abs(trim - sim.duration) > sim.dt) useEditor.getState().setEnd(trim)
      setTrim(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })

  if (compact) {
    return (
      <div className="timeline compact">
        <div className="controls">
          <button className="play" onClick={() => st.togglePlay(sim.duration)} title="Spela / pausa (mellanslag)">
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => st.selectRound(0)} title="Börja om (R)">
            ⏮
          </button>
          <div className="scrub">
            <input type="range" min={0} max={sim.duration} step={0.01} value={time} onChange={(e) => st.scrub(Number(e.target.value))} />
          </div>
          <span className="clock">
            {time.toFixed(1)} / {sim.duration.toFixed(1)} s
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="timeline">
      <div className="rounds">
        {rounds.map((r) => (
          <span key={r.index} className={`round ${r.index === current ? 'on' : ''} ${editing && r.index === activeRound ? 'editing' : ''}`}>
            <button onClick={() => st.selectRound(r.index)} title="Redigera instruktionerna för den här rundan">
              {editing && r.index === activeRound ? '✎ ' : ''}Runda {r.index + 1} · {r.startT.toFixed(1)} s
            </button>
            {r.index > 0 && (
              <button className="x" onClick={() => st.deleteRound(r.index)} title="Ta bort rundan">
                ✕
              </button>
            )}
          </span>
        ))}
        {paused && (
          <button className="next-round" onClick={st.beginEditHere}>
            ✎ Nästa runda härifrån ({time.toFixed(1)} s)
          </button>
        )}
        {paused && time >= minEnd && (
          <button onClick={() => st.setEnd(time)} title="Scenen tar slut här. Dra i ⟧ på tidslinjen för att justera.">
            ✂ Sluta här ({time.toFixed(1)} s)
          </button>
        )}
        {editing && activeRound > 0 && (
          <button
            className={scenario.rounds?.[activeRound - 1]?.homeAttacks ? 'on' : ''}
            onClick={() => st.setRoundDirection(activeRound, scenario.rounds?.[activeRound - 1]?.homeAttacks ? undefined : flipped(directionBefore(scenario, activeRound)))}
            title="Lagen byter anfallsriktning från den här rundan, till exempel när försvararna vinner pucken och blir anfallare"
          >
            ⇄ Byt anfallsriktning
          </button>
        )}
        {editing && activeRound > 0 && <span className="round-hint">Spelarna står där de var vid {rounds[activeRound].startT.toFixed(1)} s. Rita nya instruktioner.</span>}
      </div>
      <div className="controls">
        <button className="play" onClick={() => st.togglePlay(sim.duration)} title="Mellanslag">
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => st.selectRound(current)} title="Tillbaka till rundans start (redigera). R börjar om från början.">
          ⏮
        </button>
        <div className="scrub" ref={scrubRef}>
          <input type="range" min={0} max={sim.duration} step={0.01} value={time} onChange={(e) => st.scrub(Number(e.target.value))} />
          {trim !== null && trim < sim.duration && <div className="trim-cut" style={{ left: pct(trim) }} />}
          <span
            className="trim-handle"
            style={{ left: pct(end) }}
            title="Dra åt vänster för att korta scenens slut, eller åt höger förbi slutet för att förlänga den"
            onPointerDown={(e) => {
              e.preventDefault()
              setTrim(trimAt(e.clientX))
            }}
          >
            ⟧
          </span>
          {trim !== null && (
            <span className="trim-label" style={{ left: pct(trim) }}>
              {trim > sim.duration + sim.dt ? `+${(trim - sim.duration).toFixed(1)} s → ` : ''}
              {trim.toFixed(1)} s
            </span>
          )}
          <div className="marks">
            {rounds.slice(1).map((r) => (
              <span key={r.index} className="mark m-round" style={{ left: `${(r.startT / sim.duration) * 100}%` }} title={`Runda ${r.index + 1}`} />
            ))}
            {events.map((e, i) => (
              <span key={i} className={`mark m-${e.kind}`} style={{ left: `${(e.t / sim.duration) * 100}%` }} title={`${EVENT_LABEL[e.kind]} ${e.t.toFixed(1)} s`} />
            ))}
          </div>
        </div>
        <span className="clock">
          {time.toFixed(1)} / {sim.duration.toFixed(1)} s
        </span>
        <div className="seg">
          {[0.25, 0.5, 1, 2].map((r) => (
            <button key={r} className={rate === r ? 'on' : ''} onClick={() => st.setRate(r)}>
              {r}×
            </button>
          ))}
        </div>
      </div>
      <div className="controls secondary">
        <label className="check">
          <input type="checkbox" checked={showPaths} onChange={() => st.toggle('showPaths')} /> Visa linjer
        </label>
        <label className="check">
          <input type="checkbox" checked={showTrails} onChange={() => st.toggle('showTrails')} /> Visa spår
        </label>
        <span className="events">
          {events.length === 0
            ? 'Inga händelser'
            : events.map((e, i) => (
                <span key={i} className={`ev ev-${e.kind}`} onClick={() => st.scrub(Math.max(sim.dt, e.t - 0.5))}>
                  {EVENT_LABEL[e.kind]} {e.t.toFixed(1)}s
                </span>
              ))}
        </span>
      </div>
    </div>
  )
}
