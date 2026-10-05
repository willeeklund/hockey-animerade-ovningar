import { useEffect, useMemo } from 'react'
import { CONFIG } from './config'
import { Board } from './components/Board'
import { Library } from './components/Library'
import { Sidebar } from './components/Sidebar'
import { StageCorner } from './components/StageCorner'
import { playlistItems } from './editor/storage'
import { Timeline } from './components/Timeline'
import { simulate } from './engine/simulate'
import { placementAllowed, useEditor, type Tool } from './editor/store'

const TOOL_KEYS: Record<string, Tool> = { v: 'select', a: 'skate', p: 'pass', s: 'shoot', k: 'cone', m: 'mark' }

export default function App() {
  const scenario = useEditor((s) => s.scenario)
  const presenting = useEditor((s) => s.presenting)
  const sim = useMemo(() => simulate(scenario), [scenario])

  useEffect(() => {
    if (presenting && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    if (!presenting && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [presenting])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && useEditor.getState().presenting) useEditor.getState().exitPresentation()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const st = useEditor.getState()
      if (st.presenting) {
        const ids = playlistItems(st.playlist, st.library)
        const i = ids.indexOf(st.scenario.id)
        if (e.key === ' ') {
          e.preventDefault()
          st.togglePlay(sim.duration)
        } else if (e.key.toLowerCase() === 'r') st.selectRound(0)
        else if (e.key === 'Escape') st.exitPresentation()
        else if ((e.key === 'ArrowRight' || e.key === 'PageDown') && i < ids.length - 1) st.present(ids[i + 1])
        else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && i > 0) st.present(ids[i - 1])
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId && placementAllowed(st)) {
        st.removeObject(st.selectedId)
      } else if (e.key === ' ') {
        e.preventDefault()
        st.togglePlay(sim.duration)
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'r') {
        st.selectRound(0)
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) {
        st.setTool(TOOL_KEYS[e.key.toLowerCase()])
      } else if (e.key === 'Escape') {
        st.setPending(null)
        st.setMessage(null)
        st.setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim.duration])

  if (presenting) {
    return (
      <div className="app presenting">
        <main className="stage">
          <Board sim={sim} corner={<StageCorner />} />
          <Timeline sim={sim} compact />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="logo">🏒</span> Hockey Vision
        </h1>
        <Library />
        <a className="source-link" href={CONFIG.sourceUrl} target="_blank" rel="noopener noreferrer" title="Källkoden på GitHub">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Källkod
        </a>
      </header>
      <Sidebar />
      <main className="stage">
        <Board sim={sim} corner={<StageCorner />} />
        <Timeline sim={sim} />
      </main>
    </div>
  )
}
