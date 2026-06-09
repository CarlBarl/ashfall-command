import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/store/game-store'
import type { GameViewState } from '@/types/view'
import type { GameEvent } from '@/types/game'

function makeViewState(
  time: Partial<GameViewState['time']> = {},
  overrides: Partial<GameViewState> = {},
): GameViewState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100, ...time },
    nations: [],
    units: [],
    missiles: [],
    supplyLines: [],
    shippingLanes: [],
    events: [],
    pendingEventCount: 0,
    satelliteDetectedUnitIds: [],
    ...overrides,
  }
}

const destroyedEvent: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'u1', tick: 1 }

beforeEach(() => {
  useGameStore.setState({
    viewState: makeViewState({}, { initialized: false }),
    visualTimestamp: 1_000_000,
    lastUpdateRealMs: 0,
    visualRate: 0,
    eventLog: [],
  })
})

describe('setViewState change detection', () => {
  it('installs a snapshot when the tick advances', () => {
    const vs = makeViewState({ tick: 5 })
    useGameStore.getState().setViewState(vs)
    expect(useGameStore.getState().viewState).toBe(vs)
  })

  it('skips an identical snapshot (same tick, no events)', () => {
    const first = makeViewState({ tick: 5 })
    useGameStore.getState().setViewState(first)

    const identical = makeViewState({ tick: 5 })
    useGameStore.getState().setViewState(identical)
    expect(useGameStore.getState().viewState).toBe(first)
  })

  it('installs an identical snapshot when forced (post-command poll)', () => {
    const first = makeViewState({ tick: 5 })
    useGameStore.getState().setViewState(first)

    const forced = makeViewState({ tick: 5 })
    useGameStore.getState().setViewState(forced, true)
    expect(useGameStore.getState().viewState).toBe(forced)
  })

  it('installs when speed changes even at the same tick', () => {
    useGameStore.getState().setViewState(makeViewState({ tick: 5, speed: 1 }))

    const paused = makeViewState({ tick: 5, speed: 0 })
    useGameStore.getState().setViewState(paused)
    expect(useGameStore.getState().viewState).toBe(paused)
  })

  it('never drops events: a same-tick snapshot with events installs and accumulates', () => {
    useGameStore.getState().setViewState(makeViewState({ tick: 5 }))

    const withEvents = makeViewState({ tick: 5 }, { events: [destroyedEvent] })
    useGameStore.getState().setViewState(withEvents)
    expect(useGameStore.getState().viewState).toBe(withEvents)
    expect(useGameStore.getState().eventLog).toEqual([destroyedEvent])
  })
})

describe('eventLog accumulation', () => {
  it('accumulates across snapshots and caps at 500', () => {
    for (let i = 0; i < 60; i++) {
      const events: GameEvent[] = Array.from({ length: 10 }, (_, j) => ({
        type: 'UNIT_DESTROYED', unitId: `u${i}_${j}`, tick: i,
      }))
      useGameStore.getState().setViewState(makeViewState({ tick: i + 1, timestamp: 1_000_000 + i }, { events }))
    }
    const log = useGameStore.getState().eventLog
    expect(log).toHaveLength(500)
    expect((log[499] as Extract<GameEvent, { type: 'UNIT_DESTROYED' }>).unitId).toBe('u59_9')
  })

  it('is cleared by a store reset (load/new game path)', () => {
    useGameStore.getState().setViewState(makeViewState({ tick: 1 }, { events: [destroyedEvent] }))
    useGameStore.setState({ eventLog: [] })
    expect(useGameStore.getState().eventLog).toEqual([])
  })
})

describe('visual time interpolation', () => {
  it('derives visualRate from observed snapshot deltas, capped at nominal speed', () => {
    // First accepted snapshot establishes the baseline
    useGameStore.getState().setViewState(makeViewState({ tick: 1, timestamp: 1_000_000, speed: 600 }))

    // Worker advanced 60_000 game-ms; pretend 100 real-ms passed
    useGameStore.setState({ lastUpdateRealMs: performance.now() - 100 })
    useGameStore.getState().setViewState(makeViewState({ tick: 2, timestamp: 1_060_000, speed: 600 }))

    const { visualRate } = useGameStore.getState()
    const nominal = (600 * 1_000) / 100
    expect(visualRate).toBeGreaterThan(0)
    expect(visualRate).toBeLessThanOrEqual(nominal)
  })

  it('never moves the visual clock backwards while running', () => {
    useGameStore.getState().setViewState(makeViewState({ tick: 1, timestamp: 2_000_000 }))
    useGameStore.setState({ visualTimestamp: 2_500_000 })

    useGameStore.getState().setViewState(makeViewState({ tick: 2, timestamp: 2_100_000 }))
    expect(useGameStore.getState().visualTimestamp).toBe(2_500_000)
  })

  it('snaps the visual clock on a forced install (loading a save)', () => {
    useGameStore.getState().setViewState(makeViewState({ tick: 100, timestamp: 9_000_000 }))

    useGameStore.getState().setViewState(makeViewState({ tick: 2, timestamp: 1_500_000 }), true)
    expect(useGameStore.getState().visualTimestamp).toBe(1_500_000)
  })
})
