import { describe, it, expect } from 'vitest'
import { processAirBda, parkedAirframes, SHELTER_FACTOR } from '../air-bda'
import type { GameState, NationId, SquadronState, Unit } from '@/types/game'

function makeSquadron(overrides: Partial<SquadronState> = {}): SquadronState {
  return {
    id: 'vfa14',
    name: 'VFA-14 Tophatters',
    airframe: 'fa18e',
    total: 12,
    available: 6,
    readyAt: [100, 200],
    ...overrides,
  }
}

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'airbase',
    position: { lat: 27, lng: 52 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 200,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_tight' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[], tick = 10): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: 0, speed: 1, tickIntervalMs: 100 },
    nations: {},
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

function impact(state: GameState, targetId: string, damage: number, tick = state.time.tick): void {
  state.events.push({ type: 'MISSILE_IMPACT', missileId: `m${state.events.length}`, targetId, damage, tick })
}

function destroyed(state: GameState, unitId: string, tick = state.time.tick): void {
  state.events.push({ type: 'UNIT_DESTROYED', unitId, tick })
}

describe('processAirBda — ramp damage', () => {
  it('destroys floor(damage/100 × parked × shelter) airframes from total and available', () => {
    const squadron = makeSquadron() // parked = 6 + 2 = 8, airborne = 4
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base])
    impact(state, 'isfahan_ab', 50) // floor(0.5 × 8 × 0.5) = 2

    processAirBda(state)

    expect(squadron.total).toBe(10)
    expect(squadron.available).toBe(4)
    expect(squadron.readyAt).toHaveLength(2)
    // Airborne count untouched: total − parked stays 4
    expect(squadron.total - parkedAirframes(squadron)).toBe(4)
  })

  it('overflows losses from available into the turnaround queue', () => {
    const squadron = makeSquadron({ total: 10, available: 1, readyAt: [10, 20, 30, 40, 50] }) // parked 6
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base])
    impact(state, 'isfahan_ab', 100) // floor(1 × 6 × 0.5) = 3

    processAirBda(state)

    expect(squadron.total).toBe(7)
    expect(squadron.available).toBe(0)
    expect(squadron.readyAt).toEqual([10, 20, 30])
    expect(squadron.total - parkedAirframes(squadron)).toBe(4)
  })

  it('rounds small damage down to zero losses', () => {
    const squadron = makeSquadron()
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base])
    impact(state, 'isfahan_ab', 10) // floor(0.1 × 8 × 0.5) = 0

    processAirBda(state)

    expect(squadron.total).toBe(12)
    expect(squadron.available).toBe(6)
    expect(squadron.readyAt).toHaveLength(2)
  })

  it('never destroys more than the parked count on outsized damage', () => {
    const squadron = makeSquadron() // parked 8, airborne 4
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base])
    impact(state, 'isfahan_ab', 300) // floor(3 × 8 × 0.5) = 12 → clamped to 8

    processAirBda(state)

    expect(squadron.total).toBe(4)
    expect(squadron.available).toBe(0)
    expect(squadron.readyAt).toHaveLength(0)
  })

  it('uses the documented shelter factor', () => {
    expect(SHELTER_FACTOR).toBe(0.5)
  })
})

describe('processAirBda — destroyed host', () => {
  it('wipes all parked airframes across every squadron, keeping only airborne on the books', () => {
    const sqA = makeSquadron({ id: 'tfb1_su35', total: 8, available: 5, readyAt: [400] }) // parked 6, airborne 2
    const sqB = makeSquadron({ id: 'tfb1_mig29', total: 10, available: 10, readyAt: [] }) // parked 10, airborne 0
    const base = makeUnit({ id: 'mehrabad', nation: 'iran', airWing: [sqA, sqB], status: 'destroyed' })
    const state = makeState([base])
    destroyed(state, 'mehrabad')

    processAirBda(state)

    expect(sqA.total).toBe(2)
    expect(sqA.available).toBe(0)
    expect(sqA.readyAt).toEqual([])
    expect(sqB.total).toBe(0)
    expect(sqB.available).toBe(0)
  })

  it('does not double-count when impact and destruction land on the same tick', () => {
    const squadron = makeSquadron() // total 12, parked 8, airborne 4
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base])
    impact(state, 'isfahan_ab', 80)
    destroyed(state, 'isfahan_ab')

    processAirBda(state)

    expect(squadron.total).toBe(4)
    expect(squadron.available).toBe(0)
    expect(squadron.readyAt).toEqual([])
  })
})

describe('processAirBda — event filtering', () => {
  it('ignores events from earlier ticks', () => {
    const squadron = makeSquadron()
    const base = makeUnit({ id: 'isfahan_ab', nation: 'iran', airWing: [squadron] })
    const state = makeState([base], 10)
    impact(state, 'isfahan_ab', 100, 9)
    destroyed(state, 'isfahan_ab', 9)

    processAirBda(state)

    expect(squadron.total).toBe(12)
    expect(squadron.available).toBe(6)
  })

  it('ignores hits on units without an air wing and on unknown unit ids', () => {
    const plain = makeUnit({ id: 'sam_site_1', nation: 'iran', category: 'sam_site' })
    const state = makeState([plain])
    impact(state, 'sam_site_1', 100)
    impact(state, 'ghost', 100)
    destroyed(state, 'ghost')

    expect(() => processAirBda(state)).not.toThrow()
  })
})
