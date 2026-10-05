import { useEffect, useRef } from 'react'
import type { SimResult } from '../engine/simulate'
import { roundAt, roundsOf } from '../editor/staticPlan'
import { useEditor } from '../editor/store'

const EVENT_LABEL: Record<string, string> = {
  pass: 'Pass',
  shot: 'Skott',
  goal: 'MÅL',
  save: 'Räddning',
  rebound: 'Retur',
  steal: 'Bryt',
  offside: 'Offside',
}

export function Timeline({ sim }: { sim: SimResult }) {
  const st = useEditor()
  const { scenario, time, playing, rate, showPaths, showTrails, editing, activeRound } = st
  const last = useRef<number | null>(null)

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
        {editing && activeRound > 0 && <span className="round-hint">Spelarna står där de var vid {rounds[activeRound].startT.toFixed(1)} s. Rita nya instruktioner.</span>}
      </div>
      <div className="controls">
        <button className="play" onClick={() => st.togglePlay(sim.duration)} title="Mellanslag">
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => st.selectRound(current)} title="Tillbaka till rundans start (redigera). R börjar om från början.">
          ⏮
        </button>
        <div className="scrub">
          <input type="range" min={0} max={sim.duration} step={0.01} value={time} onChange={(e) => st.scrub(Number(e.target.value))} />
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
