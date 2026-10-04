import { useEffect, useRef } from 'react'
import type { SimResult } from '../engine/simulate'
import { useEditor } from '../editor/store'

const EVENT_LABEL: Record<string, string> = {
  pass: 'Pass',
  shot: 'Skott',
  goal: 'MÅL',
  save: 'Räddning',
  rebound: 'Retur',
  steal: 'Bryt',
}

export function Timeline({ sim }: { sim: SimResult }) {
  const { time, playing, rate, showPaths, showTrails, setTime, setPlaying, setRate, toggle } = useEditor()
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
      const st = useEditor.getState()
      const next = st.time + Math.min(0.1, (now - prev) / 1000) * st.rate
      if (next >= sim.duration) {
        st.setTime(sim.duration)
        st.setPlaying(false)
        return
      }
      st.setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, sim.duration])

  const play = () => {
    if (playing) return setPlaying(false)
    if (time >= sim.duration - 0.01) setTime(0.0001)
    else if (time === 0) setTime(0.0001)
    setPlaying(true)
  }

  const events = sim.events.filter((e) => EVENT_LABEL[e.kind])

  return (
    <div className="timeline">
      <div className="controls">
        <button className="play" onClick={play} title="Mellanslag">
          {playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={() => {
            setPlaying(false)
            setTime(0)
          }}
          title="Tillbaka till redigering"
        >
          ⏮
        </button>
        <div className="scrub">
          <input
            type="range"
            min={0}
            max={sim.duration}
            step={0.01}
            value={time}
            onChange={(e) => {
              setPlaying(false)
              setTime(Number(e.target.value))
            }}
          />
          <div className="marks">
            {events.map((e, i) => (
              <span key={i} className={`mark m-${e.kind}`} style={{ left: `${(e.t / sim.duration) * 100}%` }} title={`${EVENT_LABEL[e.kind]} ${e.t.toFixed(1)} s`} />
            ))}
          </div>
        </div>
        <span className="clock">
          {time.toFixed(1)} / {sim.duration.toFixed(0)} s
        </span>
        <div className="seg">
          {[0.25, 0.5, 1, 2].map((r) => (
            <button key={r} className={rate === r ? 'on' : ''} onClick={() => setRate(r)}>
              {r}×
            </button>
          ))}
        </div>
      </div>
      <div className="controls secondary">
        <label className="check">
          <input type="checkbox" checked={showPaths} onChange={() => toggle('showPaths')} /> Visa linjer
        </label>
        <label className="check">
          <input type="checkbox" checked={showTrails} onChange={() => toggle('showTrails')} /> Visa spår
        </label>
        <span className="events">
          {events.length === 0
            ? 'Inga händelser'
            : events.map((e, i) => (
                <span key={i} className={`ev ev-${e.kind}`} onClick={() => setTime(Math.max(0.0001, e.t - 0.5))}>
                  {EVENT_LABEL[e.kind]} {e.t.toFixed(1)}s
                </span>
              ))}
        </span>
      </div>
    </div>
  )
}
