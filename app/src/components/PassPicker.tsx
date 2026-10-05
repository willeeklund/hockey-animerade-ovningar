import { BUILTIN_PASSES } from '../editor/courses'
import { MY_PASS, SHARED_PASS } from '../editor/storage'
import { useEditor } from '../editor/store'

const courses = [...new Set(BUILTIN_PASSES.map((p) => p.course))]

export function PassSourceSelect({ className = 'pass-source' }: { className?: string }) {
  const { passSource, sharedPass, playlist, setPassSource } = useEditor()
  const known = passSource === MY_PASS || (passSource === SHARED_PASS && sharedPass) || BUILTIN_PASSES.some((p) => p.id === passSource)
  return (
    <select className={className} value={known ? passSource : MY_PASS} onChange={(e) => setPassSource(e.target.value)} aria-label="Välj träningspass">
      <option value={MY_PASS}>Mitt träningspass{playlist.name ? `: ${playlist.name}` : ''}</option>
      {sharedPass && <option value={SHARED_PASS}>Delat pass: {sharedPass.name}</option>}
      {courses.map((course) => (
        <optgroup key={course} label={`Inbyggda pass – ${course}`}>
          {BUILTIN_PASSES.filter((p) => p.course === course).map((p) => (
            <option key={p.id} value={p.id}>
              {p.pass.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
