import type { Scenario } from '../model/types'
import { BUILTIN_PASSES, builtinPass } from './courses'
import { decodePass, encodePass } from './share'
import { MY_PASS, playlistItems, SHARED_PASS } from './storage'
import { useEditor } from './store'
import { TEMPLATE_NAMES, type TemplateKey } from './templates'

export interface Route {
  passId?: string
  template?: TemplateKey
  data?: string
  exercise?: number
  present: boolean
}

const PREFIX = '#!/'
const NONE: Route = { present: false }

let shared: { data: string; ids: string[]; scenarios: Scenario[] } | null = null
let decoding = false

export function parseHash(hash: string): Route {
  const parts = hash.startsWith(PREFIX) ? hash.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent) : []
  const route: Route = { present: parts.includes('helskarm') }
  if (parts[0] === 'pass' && parts.length >= 3) route.passId = `${parts[1]}/${parts[2]}`.toLowerCase()
  if (parts[0] === 'mall' && parts[1] && parts[1] in TEMPLATE_NAMES) route.template = parts[1] as TemplateKey
  if (parts[0] === 'data' && parts[1]) route.data = parts[1]
  const i = parts.indexOf('ovning')
  if (i >= 0 && Number(parts[i + 1]) >= 1) route.exercise = Math.floor(Number(parts[i + 1]))
  return route
}

export function formatRoute(r: Route): string {
  const parts = r.passId ? ['pass', ...r.passId.split('/')] : r.template ? ['mall', r.template] : r.data ? ['data', r.data] : []
  if (!parts.length) return ''
  if (r.exercise && !r.template) parts.push('ovning', String(r.exercise))
  if (r.present) parts.push('helskarm')
  return PREFIX + parts.map(encodeURIComponent).join('/')
}

export const urlFor = (r: Route) => `${location.origin}${location.pathname}${location.search}${formatRoute(r)}`

const sameIds = (a: Scenario[], ids: string[]) => a.length === ids.length && a.every((s, i) => s.id === ids[i])

function deckRoute(deck: Scenario[], scenario: Scenario): Route | null {
  const exercise = deck.findIndex((s) => s.id === scenario.id) + 1 || undefined
  const pass = BUILTIN_PASSES.find((p) => sameIds(deck, p.pass.scenarios.map((s) => s.id)))
  if (pass) return { passId: pass.id, exercise, present: true }
  if (shared && sameIds(deck, shared.ids)) return { data: shared.data, exercise, present: true }
  return null
}

function currentRoute(): Route {
  const st = useEditor.getState()
  if (st.presenting) {
    const inDeck = st.deck.some((s) => s.id === st.scenario.id)
    if (inDeck) return deckRoute(st.deck, st.scenario) ?? NONE
    return st.templateKey ? { template: st.templateKey, present: true } : NONE
  }
  if (st.templateKey) return { template: st.templateKey, present: false }
  if (shared && (st.passSource === SHARED_PASS || shared.ids.includes(st.scenario.id))) {
    return { data: shared.data, exercise: shared.ids.indexOf(st.scenario.id) + 1 || undefined, present: false }
  }
  const pass = st.passSource === MY_PASS ? undefined : builtinPass(st.passSource)
  if (!pass) return NONE
  const index = pass.pass.scenarios.findIndex((s) => s.id === st.scenario.id)
  return { passId: pass.id, exercise: index >= 0 ? index + 1 : undefined, present: false }
}

function showDeck(scenarios: Scenario[], r: Route, loadFirst = false) {
  const st = useEditor.getState()
  const target = scenarios[(r.exercise ?? 1) - 1] ?? scenarios[0]
  if (!target) return
  if (r.present) {
    if (st.presenting && sameIds(st.deck, scenarios.map((s) => s.id))) return st.present(target.id)
    if (st.presenting) st.exitPresentation()
    useEditor.getState().enterPresentation(target.id, scenarios)
    return
  }
  if (st.presenting) st.exitPresentation()
  if (r.exercise || loadFirst || scenarios.length === 1) useEditor.getState().load(target)
}

async function applyRoute(r: Route) {
  const st = useEditor.getState()
  if (r.template) {
    if (st.presenting) st.exitPresentation()
    useEditor.getState().loadTemplate(r.template)
    if (r.present) useEditor.getState().enterPresentation(undefined, [])
    return
  }
  if (r.data) {
    if (shared?.data === r.data) return showDeck(shared.scenarios, r)
    decoding = true
    try {
      const pass = await decodePass(r.data)
      shared = { data: r.data, ids: pass.scenarios.map((s) => s.id), scenarios: pass.scenarios }
      if (pass.scenarios.length > 1) useEditor.getState().showSharedPass(pass)
      showDeck(pass.scenarios, r, true)
    } catch {
      useEditor.getState().setMessage('Länken gick inte att läsa.')
    } finally {
      decoding = false
    }
    return
  }
  const pass = r.passId ? builtinPass(r.passId) : undefined
  if (!pass) return
  st.setPassSource(pass.id)
  showDeck(pass.pass.scenarios, r)
}

function writeHash() {
  if (decoding) return
  const hash = formatRoute(currentRoute())
  if (hash === location.hash || (!hash && !location.hash)) return
  history.replaceState(null, '', hash || `${location.pathname}${location.search}`)
}

export type ShareScope = 'exercise' | 'pass'

export function passScenarios(): Scenario[] {
  const st = useEditor.getState()
  if (st.presenting) return st.deck.some((s) => s.id === st.scenario.id) ? st.deck : []
  if (st.passSource === SHARED_PASS) return st.sharedPass?.scenarios ?? []
  if (st.passSource !== MY_PASS) return builtinPass(st.passSource)?.pass.scenarios ?? []
  return playlistItems(st.playlist, st.library).map((id) => st.library[id])
}

export async function shareLink(present: boolean, scope: ShareScope): Promise<string> {
  const st = useEditor.getState()
  const scenarios = scope === 'pass' ? passScenarios() : [st.scenario]
  const index = scenarios.findIndex((s) => s.id === st.scenario.id)
  const exercise = index >= 0 ? index + 1 : undefined
  if (scope === 'exercise' && st.templateKey) return urlFor({ template: st.templateKey, present })
  for (const p of BUILTIN_PASSES) {
    const originals = p.pass.scenarios
    const unchanged = scenarios.every((s) => originals.some((o) => o.id === s.id && o.updatedAt === s.updatedAt))
    if (unchanged && (scenarios.length === 1 || sameIds(scenarios, originals.map((o) => o.id)))) {
      const at = originals.findIndex((o) => o.id === st.scenario.id) + 1
      return urlFor({ passId: p.id, exercise: at || undefined, present })
    }
  }
  if (shared && sameIds(scenarios, shared.ids)) return urlFor({ data: shared.data, exercise, present })
  const name = scope === 'pass' ? (st.passSource === SHARED_PASS ? st.sharedPass?.name : st.playlist.name) || 'Delat pass' : st.scenario.name
  const data = await encodePass({ name, scenarios })
  return urlFor({ data, exercise: exercise ?? 1, present })
}

export function startRouter() {
  void applyRoute(parseHash(location.hash)).then(writeHash)
  useEditor.subscribe(writeHash)
  window.addEventListener('hashchange', () => {
    void applyRoute(parseHash(location.hash)).then(writeHash)
  })
}
