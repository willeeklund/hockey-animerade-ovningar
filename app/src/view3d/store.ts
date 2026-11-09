import { create } from 'zustand'
import type { GoalieAdjust } from '../engine/netView'
import { setMuted } from './sound'

export type Cam = 'overview' | 'shooter' | 'goalie'

const MUTE_KEY = 'hockey-vision.3d-muted'

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

interface View3dState {
  on: boolean
  cam: Cam
  adjust: GoalieAdjust | null
  freeze: boolean
  muted: boolean
  score: { saves: number; goals: number }
  setOn: (on: boolean) => void
  setCam: (cam: Cam) => void
  setAdjust: (a: GoalieAdjust | null) => void
  setFreeze: (on: boolean) => void
  setMuted: (on: boolean) => void
  addScore: (kind: 'saves' | 'goals') => void
  resetScore: () => void
}

const initialMuted = readMuted()
setMuted(initialMuted)

export const useView3d = create<View3dState>((set) => ({
  on: false,
  cam: 'overview',
  adjust: null,
  freeze: true,
  muted: initialMuted,
  score: { saves: 0, goals: 0 },
  setOn: (on) => set({ on }),
  setCam: (cam) => set({ cam }),
  setAdjust: (adjust) => set({ adjust }),
  setFreeze: (freeze) => set({ freeze }),
  setMuted: (muted) => {
    setMuted(muted)
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
    set({ muted })
  },
  addScore: (kind) => set((s) => ({ score: { ...s.score, [kind]: s.score[kind] + 1 } })),
  resetScore: () => set({ score: { saves: 0, goals: 0 } }),
}))
