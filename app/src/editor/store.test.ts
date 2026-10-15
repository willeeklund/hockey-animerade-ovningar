import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PASSES } from './courses'
import { useEditor } from './store'

const notes = () => useEditor.getState().scenario.notes

describe('presentation', () => {
  beforeEach(() => useEditor.getState().exitPresentation())

  it('shows the open scenario with unsaved edits in fullscreen', () => {
    const pass = BUILTIN_PASSES.find((p) => p.pass.scenarios.length > 1)!.pass
    const [first, second] = pass.scenarios
    useEditor.getState().load(second)
    useEditor.getState().setNotes('ändrad i pass')

    useEditor.getState().enterPresentation(first.id, pass.scenarios)
    useEditor.getState().present(second.id)
    expect(notes()).toBe('ändrad i pass')

    useEditor.getState().exitPresentation()
    useEditor.getState().enterPresentation(second.id, pass.scenarios)
    expect(notes()).toBe('ändrad i pass')
    useEditor.getState().exitPresentation()
    expect(notes()).toBe('ändrad i pass')
  })

  it('uses unsaved edits of a scenario in my own pass', () => {
    useEditor.getState().addToPlaylist()
    const id = useEditor.getState().scenario.id
    useEditor.getState().setNotes('ändrad i mitt pass')
    useEditor.getState().enterPresentation(id)
    expect(notes()).toBe('ändrad i mitt pass')
    useEditor.getState().exitPresentation()
  })
})

describe('templates', () => {
  it('keep the chosen team colors when switching template', () => {
    useEditor.getState().updateSettings({ colors: { home: 'green', away: 'yellow' } })
    useEditor.getState().loadTemplate('fbDiamond')
    expect(useEditor.getState().scenario.settings.colors).toEqual({ home: 'green', away: 'yellow' })
    useEditor.getState().loadTemplate('empty')
    expect(useEditor.getState().scenario.settings.colors).toEqual({ home: 'green', away: 'yellow' })
  })
})
