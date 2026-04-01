import { create } from 'zustand'
import type { GameViewState } from '@/types/view'

/** Empty initial state — bridge populates this from worker at 30fps */
const emptyViewState: GameViewState = {
  time: {
    tick: 0,
    timestamp: new Date('2026-06-15T06:00:00Z').getTime(),
    speed: 0,
    tickIntervalMs: 100,
  },
  nations: [],
  units: [],
  missiles: [],
  events: [],
  pendingEventCount: 0,
}

interface GameStore {
  viewState: GameViewState
  setViewState: (vs: GameViewState) => void
}

export const useGameStore = create<GameStore>((set) => ({
  viewState: emptyViewState,
  setViewState: (vs) => set({ viewState: vs }),
}))
