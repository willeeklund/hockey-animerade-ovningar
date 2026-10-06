import { passScenarios } from '../editor/router'
import { useEditor } from '../editor/store'
import { PassSourceSelect } from './PassPicker'

export function MobileBar() {
  const st = useEditor()
  const deck = passScenarios()
  const current = deck.some((s) => s.id === st.scenario.id) ? st.scenario.id : ''
  return (
    <div className="mobile-bar">
      <PassSourceSelect className="mobile-pass" />
      <select
        className="mobile-exercise"
        value={current}
        onChange={(e) => {
          const s = deck.find((x) => x.id === e.target.value)
          if (s) st.load(s)
        }}
        aria-label="Välj övning"
      >
        {!current && <option value="">{deck.length ? 'Välj övning…' : st.scenario.name}</option>}
        {deck.map((s, i) => (
          <option key={`${s.id}-${i}`} value={s.id}>
            {i + 1}. {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
