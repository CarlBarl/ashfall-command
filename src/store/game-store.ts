import { create } from 'zustand'
import type { GameViewState } from '@/types/view'
import type { GameEvent } from '@/types/game'

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
  visualTimestamp: number
  lastUpdateRealMs: number
  /** Accumulated event log — persists even when panels are closed */
  eventLog: GameEvent[]
  setViewState: (vs: GameViewState) => void
  updateVisualTime: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  viewState: emptyViewState,
  visualTimestamp: emptyViewState.time.timestamp,
  lastUpdateRealMs: 0,
  eventLog: [],

  setViewState: (vs) => set((s) => ({
    viewState: vs,
    visualTimestamp: vs.time.timestamp,
    lastUpdateRealMs: performance.now(),
    // Accumulate events at store level so they persist when panels are closed
    eventLog: vs.events.length > 0
      ? [...s.eventLog, ...vs.events].slice(-500)
      : s.eventLog,
  })),

  updateVisualTime: () => {
    const { viewState, lastUpdateRealMs } = get()
    if (viewState.time.speed === 0 || lastUpdateRealMs === 0) return

    const realElapsed = performance.now() - lastUpdateRealMs
    const gameTimePerRealMs = (viewState.time.speed * 1_000) / 100
    const interpolated = viewState.time.timestamp + realElapsed * gameTimePerRealMs

    set({ visualTimestamp: interpolated })
  },
}))
