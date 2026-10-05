import { PLACE_TOOLS, placementAllowed, useEditor, type Tool } from '../editor/store'
import { PlaylistPanel } from './PlaylistPanel'
import { TEMPLATE_GROUPS, TEMPLATE_NAMES } from '../editor/templates'
import type { Role, SpeedKey } from '../model/types'

interface ToolDef {
  id: Tool
  label: string
  icon: string
  hint: string
  key?: string
}

const PLAYER_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Välj / flytta', icon: '↖', hint: 'Klicka för att välja, dra för att flytta', key: 'V' },
  { id: 'skate', label: 'Åk', icon: '〰', hint: 'Dra från en spelare för att rita åkväg', key: 'A' },
  { id: 'pass', label: 'Passa', icon: '⇢', hint: 'Klicka puckföraren, sedan mottagaren', key: 'P' },
  { id: 'shoot', label: 'Skjut', icon: '⇒', hint: 'Klicka puckföraren, sedan målet', key: 'S' },
  { id: 'mark', label: 'Markera', icon: '⇄', hint: 'Klicka på försvararen, sedan på motståndaren', key: 'M' },
]

const OBJECT_TOOLS: ToolDef[] = [
  { id: 'puck', label: 'Puck', icon: '•', hint: 'Lägg pucken intill en spelare så har han den' },
  { id: 'cone', label: 'Kon', icon: '▲', hint: 'Klicka för att placera en kon. Spelarna åker runt den.', key: 'K' },
  { id: 'divider', label: 'Sarg', icon: '▬', hint: 'Dra en linje för att lägga ut skumsarg, 2 m per bit. Ett klick lägger en bit.' },
]

const ADD_PLAYER_TOOLS: ToolDef[] = [
  { id: 'home', label: 'Lag A (röd)', icon: '●', hint: 'Klicka på isen för att lägga ut en spelare' },
  { id: 'away', label: 'Lag B (blå)', icon: '●', hint: 'Klicka på isen för att lägga ut en spelare' },
  { id: 'goalie', label: 'Målvakt', icon: 'G', hint: 'Klicka på den halva där målvakten ska stå' },
]

const ERASE_TOOL: ToolDef = { id: 'erase', label: 'Ta bort', icon: '✕', hint: 'Klicka på spelare, puck eller kon' }

const ALL_TOOLS = [...PLAYER_TOOLS, ...OBJECT_TOOLS, ...ADD_PLAYER_TOOLS, ERASE_TOOL]

const ONLY_AT_START = 'Går bara att använda i runda 1 innan övningen startats (R för att börja om)'

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
  const st = useEditor()
  const { scenario, selectedId, activeRound, editing, updatePlayer, addAction, clearActions, removeObject, beginEditHere, setFocus } = st
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
      <h3>Vald spelare</h3>
      <button
        className={`focus ${scenario.focusId === p.id ? 'on' : ''}`}
        onClick={() => setFocus(scenario.focusId === p.id ? null : p.id)}
        title="Guldring och guldfärgad svans på spelaren"
      >
        ★ {scenario.focusId === p.id ? 'Huvudperson (vald)' : 'Gör till huvudperson'}
      </button>
      <label className="row">
        Nummer/etikett
        <input value={p.label} maxLength={3} onChange={(e) => updatePlayer(p.id, { label: e.target.value })} />
      </label>
      <button onClick={inRound(() => addAction({ kind: 'wait', playerId: p.id, seconds: 1 }))}>+ Vänta 1 s</button>
      <details className="subgroup">
        <summary>Fler val</summary>
        <div className="subgroup-body">
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
          <button disabled={!count} onClick={inRound(() => clearActions(p.id))}>
            Rensa rörelser ({count})
          </button>
          <button className="danger" disabled={!placementAllowed(st)} title={placementAllowed(st) ? undefined : ONLY_AT_START} onClick={() => removeObject(p.id)}>
            Ta bort spelare
          </button>
        </div>
      </details>
    </section>
  )
}

export function Sidebar() {
  const st = useEditor()
  const { tool, drawSpeed, scenario, message } = st
  const active = ALL_TOOLS.find((t) => t.id === tool)
  const canPlace = placementAllowed(st)
  const toolButton = (t: ToolDef) => {
    const blocked = PLACE_TOOLS.has(t.id) && !canPlace
    return (
      <button
        key={t.id}
        className={`tool ${tool === t.id ? 'on' : ''} t-${t.id}`}
        disabled={blocked}
        onClick={() => st.setTool(t.id)}
        title={blocked ? ONLY_AT_START : t.key ? `${t.hint} (${t.key})` : t.hint}
      >
        <span className="icon">{t.icon}</span>
        {t.label}
        {t.key && <kbd>{t.key}</kbd>}
      </button>
    )
  }
  const layout = scenario.settings.layout ?? 'full'
  return (
    <aside className="sidebar">
      <section className="panel">
        <h3>Verktyg</h3>
        <p className="tool-group">Spelare</p>
        <div className="tools">{PLAYER_TOOLS.map(toolButton)}</div>
        <p className="tool-group">Föremål</p>
        <div className="tools">{OBJECT_TOOLS.map(toolButton)}</div>
        <details className="subgroup">
          <summary>Lägg till spelare</summary>
          <div className="tools">{ADD_PLAYER_TOOLS.map(toolButton)}</div>
        </details>
        <div className="tools">{toolButton(ERASE_TOOL)}</div>
        {!canPlace && <p className="hint small">Föremål, nya spelare och Ta bort används i runda 1 före start. Tryck R för att börja om.</p>}
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
        <h3>Mallar</h3>
        <div className="seg">
          <button className={layout === 'full' ? 'on' : ''} onClick={() => st.setLayout('full')}>
            Hel rink
          </button>
          <button className={layout === 'zone' ? 'on' : ''} onClick={() => st.setLayout('zone')}>
            Zonspel
          </button>
        </div>
        <p className="hint small">
          {layout === 'zone' ? 'En zon där man spelar på bredden, med målen mot varandra vid sargerna.' : 'Hela rinken i IIHF-mått.'}
        </p>
        <div className="templates">
          {TEMPLATE_GROUPS[layout].map((k) => (
            <button key={k} onClick={() => st.loadTemplate(k)}>
              {TEMPLATE_NAMES[k]}
            </button>
          ))}
        </div>
      </section>

      <PlaylistPanel />

      <details className="panel collapsible">
        <summary>Simulering</summary>
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
      </details>
    </aside>
  )
}
