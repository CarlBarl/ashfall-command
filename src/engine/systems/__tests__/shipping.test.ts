import { describe, it, expect, beforeEach } from 'vitest'
import { processShipping, resetShippingState } from '../shipping'
import type { SeededRNG } from '../../utils/rng'
import type { GameState, NationId, ShippingLane, Unit } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

const alwaysContact = { next: () => 0 } as unknown as SeededRNG
const neverContact = { next: () => 0.99 } as unknown as SeededRNG

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
    position: { lat: 26.5, lng: 56.3 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 30,
    health: 100,
    maxHealth: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeLane(overrides: Partial<ShippingLane> = {}): ShippingLane {
  return {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    path: [
      [54.0, 26.8],
      [54.5, 26.3],
      [55.5, 26.2],
      [56.3, 26.5],
      [56.8, 26.2],
      [58.0, 24.5],
      [60.0, 23.0],
    ],
    baseThroughput_mbd: 17.0,
    currentThroughput_mbd: 17.0,
    suppressionFactor: 0,
    status: 'open',
    ...overrides,
  }
}

function makeState(units: Unit[], opts: { atWar?: boolean; tick?: number; lane?: ShippingLane } = {}): GameState {
  const { atWar = true, tick = 60 } = opts
  const lane = opts.lane ?? makeLane()
  const economy = () => ({
    gdp_billions: 1000, military_budget_billions: 50, military_budget_pct_gdp: 5,
    oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 100,
  })
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: tick * 1000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: economy(), relations: { usa: 100, iran: -60 }, atWar: atWar ? ['iran'] : [] },
      iran: { id: 'iran', name: 'Iran', economy: economy(), relations: { usa: -60, iran: 100 }, atWar: atWar ? ['usa'] : [] },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map([[lane.id, lane]]),
    events: [],
    pendingEvents: [],
  }
}

function makeMinefield(overrides: Partial<Unit> & { id: string }): Unit {
  return makeUnit({
    nation: 'iran',
    category: 'minefield',
    position: { lat: 26.6, lng: 56.0 },
    maxSpeed_kts: 0,
    radius_km: 15,
    mine_count: 500,
    damage_per_contact: 25,
    roe: 'hold_fire',
    ...overrides,
  })
}

beforeEach(() => {
  resetShippingState()
})

// ── Mine contact damage pipeline ────────────────────────────────

describe('mine contact damage pipeline', () => {
  it('destroys a ship at 0 HP and emits UNIT_DESTROYED', () => {
    const minefield = makeMinefield({ id: 'mf1', damage_per_contact: 60 })
    const ship = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26.6, lng: 56.0 }, health: 50 })
    const state = makeState([minefield, ship])

    processShipping(state, alwaysContact)

    expect(ship.health).toBe(0)
    expect(ship.status).toBe('destroyed')
    expect(state.events.some(e => e.type === 'MINE_CONTACT' && e.targetId === 'us_ship')).toBe(true)
    expect(state.events.some(e => e.type === 'UNIT_DESTROYED' && e.unitId === 'us_ship')).toBe(true)
  })

  it('marks a ship damaged below 50 HP', () => {
    const minefield = makeMinefield({ id: 'mf1', damage_per_contact: 60 })
    const ship = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26.6, lng: 56.0 }, health: 100 })
    const state = makeState([minefield, ship])

    processShipping(state, alwaysContact)

    expect(ship.health).toBe(40)
    expect(ship.status).toBe('damaged')
    expect(state.events.some(e => e.type === 'UNIT_DESTROYED')).toBe(false)
  })

  it('leaves status untouched when health stays at 50 or above', () => {
    const minefield = makeMinefield({ id: 'mf1', damage_per_contact: 25 })
    const ship = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26.6, lng: 56.0 }, health: 100 })
    const state = makeState([minefield, ship])

    processShipping(state, alwaysContact)

    expect(ship.health).toBe(75)
    expect(ship.status).toBe('ready')
  })
})

// ── Peacetime gating ────────────────────────────────────────────

describe('peacetime gating', () => {
  it('does not suppress lanes or trigger mine contacts at peace', () => {
    const minefield = makeMinefield({ id: 'mf1' })
    const warship = makeUnit({ id: 'irgc_fac', nation: 'iran', position: { lat: 26.5, lng: 56.3 } })
    const transit = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26.6, lng: 56.0 } })
    const state = makeState([minefield, warship, transit], { atWar: false })
    const lane = state.shippingLanes.get('hormuz')!

    processShipping(state, alwaysContact)

    expect(lane.suppressionFactor).toBe(0)
    expect(lane.status).toBe('open')
    expect(lane.currentThroughput_mbd).toBe(17.0)
    expect(transit.health).toBe(100)
    expect(state.events).toHaveLength(0)
  })

  it('suppresses the lane once at war with the same unit layout', () => {
    const minefield = makeMinefield({ id: 'mf1' })
    const warship = makeUnit({ id: 'irgc_fac', nation: 'iran', position: { lat: 26.5, lng: 56.3 } })
    const state = makeState([minefield, warship], { atWar: true })
    const lane = state.shippingLanes.get('hormuz')!

    processShipping(state, neverContact)

    expect(lane.suppressionFactor).toBeCloseTo(0.25)
    expect(lane.status).toBe('reduced')
    expect(state.events.some(e => e.type === 'SHIPPING_LANE_STATUS_CHANGE' && e.newStatus === 'reduced')).toBe(true)
  })
})

// ── Point-to-segment distance ───────────────────────────────────

describe('lane proximity', () => {
  it('counts threats sitting mid-segment, far from any vertex', () => {
    // Midpoint of the [56.8,26.2]->[58.0,24.5] segment is ~112 km from both
    // vertices but on the lane itself — vertex-only distance missed it
    const sub = makeUnit({ id: 'ghadir', nation: 'iran', category: 'submarine', position: { lat: 25.35, lng: 57.4 } })
    const state = makeState([sub], { atWar: true })
    const lane = state.shippingLanes.get('hormuz')!

    processShipping(state, neverContact)

    expect(lane.suppressionFactor).toBeCloseTo(0.1)
  })
})

// ── Status change events ────────────────────────────────────────

describe('lane status events', () => {
  it('emits nothing on first tick when status did not change', () => {
    const state = makeState([], { atWar: false })

    processShipping(state, neverContact)

    expect(state.events).toHaveLength(0)
    expect(state.pendingEvents).toHaveLength(0)
  })

  it('does not re-emit after a save/load reset when status is unchanged', () => {
    const minefield = makeMinefield({ id: 'mf1' })
    const warship = makeUnit({ id: 'irgc_fac', nation: 'iran', position: { lat: 26.5, lng: 56.3 } })
    const state = makeState([minefield, warship], { atWar: true })

    processShipping(state, neverContact)
    expect(state.events.filter(e => e.type === 'SHIPPING_LANE_STATUS_CHANGE')).toHaveLength(1)

    // Simulate load: module state cleared, lane.status persisted as 'reduced'
    resetShippingState()
    state.events = []
    state.pendingEvents = []
    state.time.tick = 120

    processShipping(state, neverContact)
    expect(state.events.filter(e => e.type === 'SHIPPING_LANE_STATUS_CHANGE')).toHaveLength(0)
  })

  it('emits when the status genuinely changes', () => {
    const state = makeState([], { atWar: true })

    processShipping(state, neverContact)
    expect(state.events).toHaveLength(0)

    const minefield = makeMinefield({ id: 'mf1' })
    const warship = makeUnit({ id: 'irgc_fac', nation: 'iran', position: { lat: 26.5, lng: 56.3 } })
    state.units.set(minefield.id, minefield)
    state.units.set(warship.id, warship)
    state.time.tick = 120

    processShipping(state, neverContact)
    const events = state.events.filter(e => e.type === 'SHIPPING_LANE_STATUS_CHANGE')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ laneId: 'hormuz', newStatus: 'reduced' })
  })
})
