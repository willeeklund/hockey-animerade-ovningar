import type { TrainingPass } from '../model/types'

export interface BuiltinPass {
  id: string
  course: string
  pass: TrainingPass
}

const own = import.meta.glob<TrainingPass>('../../../traningspass/*.json', { eager: true, import: 'default' })
const bu2 = import.meta.glob<TrainingPass>('../../../hockey-BU2-ovningar/*/traningspass.json', { eager: true, import: 'default' })

function slugOf(path: string) {
  const parts = path.split('/')
  const file = parts.at(-1)!.replace(/\.json$/, '')
  return (file === 'traningspass' ? parts.at(-2)! : file).toLowerCase()
}

function passesOf(slug: string, course: string, files: Record<string, TrainingPass>): BuiltinPass[] {
  return Object.entries(files)
    .map(([path, pass]) => ({ id: `${slug}/${slugOf(path)}`, course, pass }))
    .sort((a, b) => a.id.localeCompare(b.id, 'sv', { numeric: true }))
}

export const BUILTIN_PASSES: BuiltinPass[] = [...passesOf('egna', 'Egna pass', own), ...passesOf('bu2', 'BU2-kursen', bu2)]

export const builtinPass = (id: string) => BUILTIN_PASSES.find((p) => p.id === id)
