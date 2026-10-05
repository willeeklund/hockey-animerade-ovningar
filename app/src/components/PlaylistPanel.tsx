import { useState, type ChangeEvent } from 'react'
import { builtinPass } from '../editor/courses'
import { MY_PASS, SHARED_PASS } from '../editor/storage'
import { useEditor } from '../editor/store'
import type { TrainingPass } from '../model/types'
import { PassSourceSelect } from './PassPicker'
import { ShareButton } from './ShareButton'

function download(pass: TrainingPass) {
  const blob = new Blob([JSON.stringify(pass, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${pass.name.replace(/[^\wåäöÅÄÖ -]/g, '') || 'traningspass'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function PlaylistPanel() {
  const st = useEditor()
  const { scenario, library, playlist, passSource, sharedPass, addToPlaylist, removeFromPlaylist, movePlaylistItem, renamePlaylist, load, enterPresentation, importPass } = st
  const [error, setError] = useState<string | null>(null)
  const builtin =
    passSource === SHARED_PASS && sharedPass ? { id: SHARED_PASS, pass: sharedPass } : passSource === MY_PASS ? undefined : builtinPass(passSource)
  const items = playlist.ids.map((id) => ({ id, s: library[id] }))
  const saved = Object.values(library).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  const inList = playlist.ids.includes(scenario.id)

  const readPass = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const pass = JSON.parse(await file.text()) as TrainingPass
      if (!Array.isArray(pass.scenarios) || pass.scenarios.some((s) => !Array.isArray(s.players))) throw new Error()
      importPass(pass)
      setError(null)
    } catch {
      setError('Kunde inte läsa passet')
    }
  }

  const sourcePicker = <PassSourceSelect />

  if (builtin) {
    const { pass } = builtin
    return (
      <section className="panel">
        <h3>Träningspass</h3>
        {sourcePicker}
        {pass.notes && <p className="hint small">{pass.notes}</p>}
        <ol className="playlist">
          {pass.scenarios.map((s) => (
            <li key={s.id} className={s.id === scenario.id ? 'current' : ''}>
              <button className="pl-name" onClick={() => load(s)} title={s.notes ?? 'Öppna övningen'}>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
        <button className="present-btn" disabled={pass.scenarios.length === 0} onClick={() => enterPresentation(pass.scenarios[0]?.id, pass.scenarios)}>
          ▶ Visa passet i helskärm
        </button>
        <div className="seg">
          <button onClick={() => importPass(pass)} title="Kopierar övningarna till dina sparade scenarion och gör dem till ditt träningspass, så att du kan ändra dem">
            Kopiera till mitt pass
          </button>
          <button onClick={() => download(pass)} title="Sparar passet som en JSON-fil">
            ⤓ Exportera
          </button>
        </div>
        <ShareButton inPanel label="🔗 Dela passet" scope="pass" />
        <p className="hint small">
          {builtin.id === SHARED_PASS ? 'Passet kommer från en delad länk.' : 'Inbyggda pass ändras inte.'} Öppna en övning och spara den för att bygga vidare på en egen kopia.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h3>Träningspass</h3>
      {sourcePicker}
      <input className="playlist-name" value={playlist.name} placeholder="Namn, t.ex. Tisdag U13" onChange={(e) => renamePlaylist(e.target.value)} />
      {items.length === 0 ? (
        <p className="hint small">Lägg till övningarna du vill visa, i den ordning du vill visa dem.</p>
      ) : (
        <ol className="playlist">
          {items.map(({ id, s }, i) => (
            <li key={`${id}-${i}`} className={id === scenario.id ? 'current' : ''}>
              <button className="pl-name" disabled={!s} onClick={() => s && load(s)} title={s ? 'Öppna för redigering' : 'Scenariot är borttaget'}>
                {s?.name ?? '(borttaget)'}
              </button>
              <button className="pl-icon" disabled={i === 0} onClick={() => movePlaylistItem(i, -1)} title="Flytta upp">
                ↑
              </button>
              <button className="pl-icon" disabled={i === items.length - 1} onClick={() => movePlaylistItem(i, 1)} title="Flytta ner">
                ↓
              </button>
              <button className="pl-icon" onClick={() => removeFromPlaylist(i)} title="Ta bort ur passet">
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}
      <button onClick={() => addToPlaylist()} title="Sparar aktuellt scenario och lägger till det sist i passet">
        ＋ Lägg till aktuellt scenario{inList ? ' igen' : ''}
      </button>
      {saved.length > 0 && (
        <select value="" onChange={(e) => e.target.value && addToPlaylist(e.target.value)} aria-label="Lägg till sparat scenario">
          <option value="">＋ Lägg till sparat scenario…</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <button className="present-btn" disabled={items.every((x) => !x.s)} onClick={() => enterPresentation(items.find((x) => x.s)?.id)}>
        ▶ Visa passet i helskärm
      </button>
      <div className="seg">
        <button
          disabled={items.every((x) => !x.s)}
          onClick={() => download({ name: playlist.name || 'Träningspass', scenarios: items.flatMap((x) => (x.s ? [x.s] : [])) })}
          title="Sparar hela passet med alla övningar som en JSON-fil"
        >
          ⤓ Exportera
        </button>
        <label className="file" title="Läser in ett pass från en JSON-fil. Övningarna läggs till bland dina sparade scenarion.">
          ⤒ Importera
          <input type="file" accept="application/json" onChange={readPass} hidden />
        </label>
      </div>
      {items.some((x) => x.s) && <ShareButton inPanel label="🔗 Dela passet" scope="pass" />}
      {error && <p className="hint small msg">{error}</p>}
      <p className="hint small">Passet visar senast sparade versionen av varje scenario. Spara efter ändringar.</p>
    </section>
  )
}
