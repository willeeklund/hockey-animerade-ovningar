import type { Scenario } from '../model/types'

const LIBRARY_KEY = 'hockey-vision.scenarios'
const PLAYLIST_KEY = 'hockey-vision.playlist'
const PASS_SOURCE_KEY = 'hockey-vision.pass-source'

export interface Playlist {
  name: string
  ids: string[]
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export function playlistItems(playlist: Playlist, library: Record<string, Scenario>) {
  return playlist.ids.filter((id) => library[id])
}

export const readLibrary = () => read<Record<string, Scenario>>(LIBRARY_KEY, {})
export const writeLibrary = (all: Record<string, Scenario>) => write(LIBRARY_KEY, all)
export const readPlaylist = () => read<Playlist>(PLAYLIST_KEY, { name: '', ids: [] })
export const writePlaylist = (p: Playlist) => write(PLAYLIST_KEY, p)
export const readPassSource = () => read<string>(PASS_SOURCE_KEY, MY_PASS)
export const writePassSource = (id: string) => write(PASS_SOURCE_KEY, id)

export const MY_PASS = 'mine'
export const SHARED_PASS = 'shared'
