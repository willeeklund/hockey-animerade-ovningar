import { useEditor } from '../editor/store'

export function PlaylistPanel() {
  const { scenario, library, playlist, addToPlaylist, removeFromPlaylist, movePlaylistItem, renamePlaylist, load, enterPresentation } = useEditor()
  const items = playlist.ids.map((id) => ({ id, s: library[id] }))
  const saved = Object.values(library).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  const inList = playlist.ids.includes(scenario.id)

  return (
    <section className="panel">
      <h3>Träningspass</h3>
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
      <p className="hint small">Passet visar senast sparade versionen av varje scenario. Spara efter ändringar.</p>
    </section>
  )
}
