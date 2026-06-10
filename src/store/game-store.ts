import { create } from 'zustand'
import type { GameViewState } from '@/types/view'
import type { GameEvent } from '@/types/game'

const emptyViewState: GameViewState = {
  playerNation: 'usa',
  initialized: false,
  time: {
    tick: 0,
    timestamp: new Date('2026-06-15T06:00:00Z').getTime(),
    speed: 0,
    tickIntervalMs: 100,
  },
  nations: [],
  units: [],
  missiles: [],
  supplyLines: [],
  shippingLanes: [],
  events: [],
  pendingEventCount: 0,
  satelliteDetectedUnitIds: [],
  warSupport: {},
  gameOver: null,
  objectives: [],
}

interface GameStore {
  viewState: GameViewState
  visualTimestamp: number
  lastUpdateRealMs: number
  /** Observed game-ms per real-ms between snapshots — the worker can run slower than nominal speed */
  visualRate: number
  /** Accumulated event log — persists even when panels are closed */
  eventLog: GameEvent[]
  setViewState: (vs: GameViewState, force?: boolean) => void
  updateVisualTime: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  viewState: emptyViewState,
  visualTimestamp: emptyViewState.time.timestamp,
  lastUpdateRealMs: 0,
  visualRate: 0,
  eventLog: [],

  setViewState: (vs, force = false) => {
    const s = get()
    const prev = s.viewState
    // Skip unchanged snapshots so subscribers don't re-render ~10x/sec while
    // paused or on menu screens; the bridge forces installs after commands
    if (!force
      && vs.time.tick === prev.time.tick
      && vs.events.length === 0
      && vs.time.speed === prev.time.speed
      && vs.initialized === prev.initialized
      && vs.pendingEventCount === prev.pendingEventCount) {
      return
    }

    const now = performance.now()
    const gameDelta = vs.time.timestamp - prev.time.timestamp
    const realDelta = now - s.lastUpdateRealMs
    const nominalRate = (vs.time.speed * 1_000) / 100
    let visualRate = s.visualRate
    if (force || gameDelta < 0) {
      visualRate = 0
    } else if (s.lastUpdateRealMs > 0 && realDelta > 0 && gameDelta > 0) {
      visualRate = Math.min(gameDelta / realDelta, nominalRate)
    }

    set({
      viewState: vs,
      // Never snap the visual clock backwards mid-run (worker bursts arrive unevenly)
      visualTimestamp: force ? vs.time.timestamp : Math.max(s.visualTimestamp, vs.time.timestamp),
      lastUpdateRealMs: now,
      visualRate,
      // Accumulate events at store level so they persist when panels are closed
      eventLog: vs.events.length > 0
        ? [...s.eventLog, ...vs.events].slice(-500)
        : s.eventLog,
    })
  },

  updateVisualTime: () => {
    const { viewState, lastUpdateRealMs, visualRate, visualTimestamp } = get()
    if (viewState.time.speed === 0 || lastUpdateRealMs === 0) return

    const realElapsed = performance.now() - lastUpdateRealMs
    const rate = visualRate > 0 ? visualRate : (viewState.time.speed * 1_000) / 100
    const interpolated = viewState.time.timestamp + realElapsed * rate

    if (interpolated > visualTimestamp) {
      set({ visualTimestamp: interpolated })
    }
  },
}))
