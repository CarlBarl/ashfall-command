import { create } from 'zustand'
import type { GameViewState } from '@/types/view'

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
  /** Smoothly interpolated visual timestamp for animations (between worker polls) */
  visualTimestamp: number
  /** When the last worker update arrived (real time) */
  lastUpdateRealMs: number
  setViewState: (vs: GameViewState) => void
  updateVisualTime: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  viewState: emptyViewState,
  visualTimestamp: emptyViewState.time.timestamp,
  lastUpdateRealMs: 0,

  setViewState: (vs) => set({
    viewState: vs,
    visualTimestamp: vs.time.timestamp,
    lastUpdateRealMs: performance.now(),
  }),

  updateVisualTime: () => {
    const { viewState, lastUpdateRealMs } = get()
    if (viewState.time.speed === 0 || lastUpdateRealMs === 0) return

    // Interpolate: how much real time has passed since last worker update?
    const realElapsed = performance.now() - lastUpdateRealMs
    // Each 100ms real time = speed * 1,000ms game time (1 tick = 1 game second)
    const gameTimePerRealMs = (viewState.time.speed * 1_000) / 100
    const interpolated = viewState.time.timestamp + realElapsed * gameTimePerRealMs

    set({ visualTimestamp: interpolated })
  },
}))
