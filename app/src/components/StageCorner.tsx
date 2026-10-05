import { useState } from 'react'
import { useEditor } from '../editor/store'

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {exit ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /> : <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />}
    </svg>
  )
}

export function StageCorner() {
  const { presenting, deck, scenario, enterPresentation, exitPresentation, present } = useEditor()
  const [showNotes, setShowNotes] = useState(false)

  if (!presenting) {
    return (
      <div className="stage-corner">
        <button className="corner-btn" onClick={() => enterPresentation()} title="Helskärm: visa bara planen">
          <FullscreenIcon exit={false} />
        </button>
      </div>
    )
  }

  const index = deck.findIndex((s) => s.id === scenario.id)
  return (
    <>
      {scenario.notes && (
        <div className={`stage-notes ${showNotes ? 'open' : ''}`}>
          <button className="notes-toggle" onClick={() => setShowNotes(!showNotes)} title="Visa eller dölj beskrivningen">
            <strong>{scenario.name}</strong> <span className="notes-chevron">{showNotes ? '▴' : 'ⓘ'}</span>
          </button>
          {showNotes && <p>{scenario.notes}</p>}
        </div>
      )}
      <div className="stage-corner presenting">
        {deck.length > 0 && (
          <div className="pl-picker">
            <button className="corner-btn small" disabled={index <= 0} onClick={() => present(deck[index - 1].id)} title="Föregående övning (←)">
              ‹
            </button>
            <select value={index >= 0 ? scenario.id : ''} onChange={(e) => e.target.value && present(e.target.value)} aria-label="Välj övning i passet">
              {index < 0 && <option value="">{scenario.name}</option>}
              {deck.map((s, i) => (
                <option key={`${s.id}-${i}`} value={s.id}>
                  {i + 1}. {s.name}
                </option>
              ))}
            </select>
            <button className="corner-btn small" disabled={index < 0 || index >= deck.length - 1} onClick={() => present(deck[index + 1].id)} title="Nästa övning (→)">
              ›
            </button>
          </div>
        )}
        <button className="corner-btn" onClick={exitPresentation} title="Lämna helskärm (Esc)">
          <FullscreenIcon exit />
        </button>
      </div>
    </>
  )
}
