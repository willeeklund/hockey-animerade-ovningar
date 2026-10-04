import { useEditor, type Tool } from '../editor/store'
import { TEMPLATE_NAMES, type TemplateKey } from '../editor/templates'
import type { Role, SpeedKey } from '../model/types'

const TOOLS: { id: Tool; label: string; icon: string; hint: string; key?: string }[] = [
  { id: 'select', label: 'Välj / flytta', icon: '↖', hint: 'Klicka för att markera, dra för att flytta', key: 'V' },
  { id: 'home', label: 'Lag A (röd)', icon: '●', hint: 'Klicka på isen för att lägga ut en spelare' },
  { id: 'away', label: 'Lag B (blå)', icon: '●', hint: 'Klicka på isen för att lägga ut en spelare' },
  { id: 'goalie', label: 'Målvakt', icon: 'G', hint: 'Klicka på den halva där målvakten ska stå' },
  { id: 'puck', label: 'Puck', icon: '•', hint: 'Lägg pucken intill en spelare så har han den' },
  { id: 'cone', label: 'Kon', icon: '▲', hint: 'Klicka för att placera en kon. Spelarna åker runt den.', key: 'K' },
  { id: 'skate', label: 'Åk', icon: '〰', hint: 'Dra från en spelare för att rita åkväg', key: 'A' },
  { id: 'pass', label: 'Passa', icon: '⇢', hint: 'Klicka puckföraren, sedan mottagaren', key: 'P' },
  { id: 'shoot', label: 'Skjut', icon: '⇒', hint: 'Klicka puckföraren, sedan målet', key: 'S' },
  { id: 'mark', label: 'Markera', icon: '⇄', hint: 'Klicka på den som ska markera, sedan på motståndaren', key: 'M' },
  { id: 'erase', label: 'Ta bort', icon: '✕', hint: 'Klicka på spelare eller puck' },
]

const SPEEDS: { id: SpeedKey; label: string }[] = [
  { id: 'slow', label: 'Lugnt' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fullt' },
]

const ROLES: { id: Role; label: string }[] = [
  { id: 'F', label: 'Forward' },
  { id: 'D', label: 'Back' },
  { id: 'G', label: 'Målvakt' },
]

function SelectedPanel() {
  const { scenario, selectedId, activeRound, editing, updatePlayer, addAction, clearActions, removeObject, beginEditHere, setFocus } = useEditor()
  const p = scenario.players.find((x) => x.id === selectedId)
  if (!p) return null
  const roundActions = editing ? (activeRound === 0 ? scenario.actions : (scenario.rounds?.[activeRound - 1]?.actions ?? [])) : []
  const count = roundActions.filter((a) => a.playerId === p.id).length
  const inRound = (fn: () => void) => () => {
    beginEditHere()
    fn()
  }
  return (
    <section className="panel">
      <h3>Markerad spelare</h3>
      <label className="row">
        Nummer/etikett
        <input value={p.label} maxLength={3} onChange={(e) => updatePlayer(p.id, { label: e.target.value })} />
      </label>
      <div className="seg">
        {ROLES.map((r) => (
          <button key={r.id} className={p.role === r.id ? 'on' : ''} onClick={() => updatePlayer(p.id, { role: r.id })}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="seg">
        <button className={p.team === 'home' ? 'on' : ''} onClick={() => updatePlayer(p.id, { team: 'home' })}>
          Lag A
        </button>
        <button className={p.team === 'away' ? 'on' : ''} onClick={() => updatePlayer(p.id, { team: 'away' })}>
          Lag B
        </button>
      </div>
      <div className="seg">
        <button onClick={() => updatePlayer(p.id, { heading: p.heading - Math.PI / 4 })}>⟲ Vrid</button>
        <button onClick={() => updatePlayer(p.id, { heading: p.heading + Math.PI / 4 })}>Vrid ⟳</button>
      </div>
      <div className="seg">
        <button onClick={inRound(() => addAction({ kind: 'wait', playerId: p.id, seconds: 1 }))}>+ Vänta 1 s</button>
        <button disabled={!count} onClick={inRound(() => clearActions(p.id))}>
          Rensa rörelser ({count})
        </button>
      </div>
      <button
        className={`focus ${scenario.focusId === p.id ? 'on' : ''}`}
        onClick={() => setFocus(scenario.focusId === p.id ? null : p.id)}
        title="Spotlight på spelaren när övningen spelas upp"
      >
        ★ {scenario.focusId === p.id ? 'Huvudperson (vald)' : 'Gör till huvudperson'}
      </button>
      <button className="danger" onClick={() => removeObject(p.id)}>
        Ta bort spelare
      </button>
    </section>
  )
}

export function Sidebar() {
  const st = useEditor()
  const { tool, drawSpeed, scenario, message } = st
  const active = TOOLS.find((t) => t.id === tool)
  return (
    <aside className="sidebar">
      <section className="panel">
        <h3>Verktyg</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''} t-${t.id}`} onClick={() => st.setTool(t.id)} title={t.key ? `${t.hint} (${t.key})` : t.hint}>
              <span className="icon">{t.icon}</span>
              {t.label}
              {t.key && <kbd>{t.key}</kbd>}
            </button>
          ))}
        </div>
        {tool === 'skate' && (
          <div className="seg">
            {SPEEDS.map((s) => (
              <button key={s.id} className={drawSpeed === s.id ? 'on' : ''} onClick={() => st.setDrawSpeed(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <p className={`hint ${message ? 'msg' : ''}`}>{message ?? active?.hint}</p>
        <div className="seg">
          <button onClick={st.undo} disabled={!st.past.length}>
            ↶ Ångra
          </button>
          <button onClick={st.redo} disabled={!st.future.length}>
            Gör om ↷
          </button>
        </div>
      </section>

      <SelectedPanel />

      <section className="panel">
        <h3>Spelyta</h3>
        <div className="seg">
          <button className={(scenario.settings.layout ?? 'full') === 'full' ? 'on' : ''} onClick={() => st.setLayout('full')}>
            Hel rink
          </button>
          <button className={scenario.settings.layout === 'zone' ? 'on' : ''} onClick={() => st.setLayout('zone')}>
            Zonspel
          </button>
        </div>
        {scenario.settings.layout === 'zone' && <p className="hint small">En zon, spel på bredden. Målen står mot varandra vid sargerna.</p>}
      </section>

      <section className="panel">
        <h3>Simulering</h3>
        <label className="check">
          <input type="checkbox" checked={scenario.settings.autonomous} onChange={(e) => st.updateSettings({ autonomous: e.target.checked })} />
          Autonoma botar
        </label>
        <p className="hint small">
          {scenario.settings.autonomous
            ? 'Spelare utan ritade rörelser agerar själva. Skriptade spelare tar över som botar när deras rörelser är slut.'
            : 'Bara ritade rörelser spelas upp. Målvakter följer pucken.'}
        </p>
        <label className="row">
          {scenario.rounds?.length ? 'Längd efter sista rundan' : 'Längd'}
          <select value={scenario.settings.durationSec} onChange={(e) => st.updateSettings({ durationSec: Number(e.target.value) })}>
            {[5, 8, 10, 15, 20, 30].map((d) => (
              <option key={d} value={d}>
                {d} s
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Lag A anfaller
          <select value={scenario.settings.homeAttacks} onChange={(e) => st.updateSettings({ homeAttacks: e.target.value as 'left' | 'right' })}>
            <option value="right">åt höger →</option>
            <option value="left">← åt vänster</option>
          </select>
        </label>
        <button onClick={() => st.updateSettings({ seed: scenario.settings.seed + 1 })}>🎲 Ny variation (#{scenario.settings.seed})</button>
      </section>

      <section className="panel">
        <h3>Mallar</h3>
        <div className="seg wrap">
          {(Object.keys(TEMPLATE_NAMES) as TemplateKey[]).map((k) => (
            <button key={k} onClick={() => st.loadTemplate(k)}>
              {TEMPLATE_NAMES[k]}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
