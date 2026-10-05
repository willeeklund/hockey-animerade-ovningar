import { playlistItems } from '../editor/storage'
import { useEditor } from '../editor/store'

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {exit ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /> : <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />}
    </svg>
  )
}

export function StageCorner() {
  const { presenting, playlist, library, scenario, enterPresentation, exitPresentation, present } = useEditor()

  if (!presenting) {
    return (
      <div className="stage-corner">
        <button className="corner-btn" onClick={() => enterPresentation()} title="Helskärm: visa bara planen">
          <FullscreenIcon exit={false} />
        </button>
      </div>
    )
  }

  const ids = playlistItems(playlist, library)
  const index = ids.indexOf(scenario.id)
  return (
    <div className="stage-corner presenting">
      {ids.length > 0 && (
        <div className="pl-picker">
          <button className="corner-btn small" disabled={index <= 0} onClick={() => present(ids[index - 1])} title="Föregående övning (←)">
            ‹
          </button>
          <select value={index >= 0 ? scenario.id : ''} onChange={(e) => e.target.value && present(e.target.value)} aria-label="Välj övning i passet">
            {index < 0 && <option value="">{scenario.name}</option>}
            {ids.map((id, i) => (
              <option key={`${id}-${i}`} value={id}>
                {i + 1}. {library[id].name}
              </option>
            ))}
          </select>
          <button className="corner-btn small" disabled={index >= ids.length - 1} onClick={() => present(ids[index + 1])} title="Nästa övning (→)">
            ›
          </button>
        </div>
      )}
      <button className="corner-btn" onClick={exitPresentation} title="Lämna helskärm (Esc)">
        <FullscreenIcon exit />
      </button>
    </div>
  )
}
