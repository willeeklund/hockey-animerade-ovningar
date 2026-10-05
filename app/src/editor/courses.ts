import type { TrainingPass } from '../model/types'

export interface BuiltinPass {
  id: string
  course: string
  pass: TrainingPass
}

const bu2 = import.meta.glob<TrainingPass>('../../../hockey-BU2-ovningar/*/traningspass.json', { eager: true, import: 'default' })

function passesOf(course: string, files: Record<string, TrainingPass>): BuiltinPass[] {
  return Object.entries(files)
    .map(([path, pass]) => ({ id: `${course}/${path.split('/').at(-2)}`, course, pass }))
    .sort((a, b) => a.id.localeCompare(b.id, 'sv', { numeric: true }))
}

export const BUILTIN_PASSES: BuiltinPass[] = passesOf('BU2-kursen', bu2)

export const builtinPass = (id: string) => BUILTIN_PASSES.find((p) => p.id === id)
