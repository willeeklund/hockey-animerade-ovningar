import { useState, type ChangeEvent } from 'react'
import { useEditor } from '../editor/store'
import { uid } from '../editor/templates'
import type { Scenario } from '../model/types'

export function Library() {
  const { scenario, rename, load, loadTemplate, library: saved, saveCurrent, deleteSaved } = useEditor()
  const [flash, setFlash] = useState<string | null>(null)

  const save = () => {
    saveCurrent()
    setFlash('Sparat ✓')
    setTimeout(() => setFlash(null), 1500)
  }

  const open = (id: string) => {
    const s = saved[id]
    if (s) load(s)
  }

  const remove = () => deleteSaved(scenario.id)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${scenario.name.replace(/[^\wåäöÅÄÖ -]/g, '') || 'scenario'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const s = JSON.parse(await file.text()) as Scenario
      if (!Array.isArray(s.players) || !Array.isArray(s.actions)) throw new Error()
      load({ ...s, id: uid() })
    } catch {
      setFlash('Kunde inte läsa filen')
    }
    e.target.value = ''
  }

  const list = Object.values(saved).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="library">
      <input className="name" value={scenario.name} onChange={(e) => rename(e.target.value)} aria-label="Scenarionamn" />
      <button onClick={save}>💾 Spara</button>
      <select value="" onChange={(e) => open(e.target.value)} aria-label="Öppna sparat">
        <option value="">📂 Öppna… ({list.length})</option>
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button onClick={() => loadTemplate('empty')}>＋ Nytt</button>
      {saved[scenario.id] && (
        <button className="ghost" onClick={remove} title="Ta bort sparat scenario">
          🗑
        </button>
      )}
      <button className="ghost" onClick={exportJson} title="Exportera JSON">
        ⤓
      </button>
      <label className="ghost file" title="Importera JSON">
        ⤒
        <input type="file" accept="application/json" onChange={importJson} hidden />
      </label>
      {flash && <span className="flash">{flash}</span>}
    </div>
  )
}
