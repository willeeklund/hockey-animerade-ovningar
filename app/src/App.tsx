import { useEffect, useMemo } from 'react'
import { Board } from './components/Board'
import { Library } from './components/Library'
import { Sidebar } from './components/Sidebar'
import { Timeline } from './components/Timeline'
import { simulate } from './engine/simulate'
import { useEditor } from './editor/store'

export default function App() {
  const scenario = useEditor((s) => s.scenario)
  const sim = useMemo(() => simulate(scenario), [scenario])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const st = useEditor.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        st.removeObject(st.selectedId)
      } else if (e.key === ' ') {
        e.preventDefault()
        if (!st.playing && (st.time === 0 || st.time >= sim.duration - 0.01)) st.setTime(0.0001)
        st.setPlaying(!st.playing)
      } else if (e.key === 'Escape') {
        st.setPending(null)
        st.setMessage(null)
        st.setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim.duration])

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="logo">🏒</span> Hockey Vision
        </h1>
        <Library />
      </header>
      <Sidebar />
      <main className="stage">
        <Board sim={sim} />
        <Timeline sim={sim} />
      </main>
    </div>
  )
}
