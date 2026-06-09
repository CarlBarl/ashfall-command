import { describe, it, expect } from 'vitest'
import { processRepair } from '../repair'
import type { GameState, Unit, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 25, lng: 51 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
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

function makeBase(id: string, nation: NationId): Unit {
  return makeUnit({ id, nation, category: 'airbase', logistics: 100 })
}

function makeState(units: Unit[], tick = 60): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: tick * 1000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('repair eligibility', () => {
  it('repairs a stationary unit at 70 HP even when status is ready (50-99 HP gap regression)', () => {
    const unit = makeUnit({ id: 'sam_1', nation: 'usa', health: 70, status: 'ready' })
    const state = makeState([unit, makeBase('base_1', 'usa')])

    processRepair(state)

    expect(unit.health).toBeGreaterThan(70)
    expect(unit.status).toBe('repairing')
    expect(state.events.some(e => e.type === 'UNIT_REPAIRED' && e.unitId === 'sam_1')).toBe(true)
  })

  it('repairs a damaged unit that relocated and arrived as ready (moving-cancels-repair regression)', () => {
    const unit = makeUnit({ id: 'sam_2', nation: 'usa', health: 30, status: 'ready' })
    const state = makeState([unit, makeBase('base_1', 'usa')])

    processRepair(state)

    expect(unit.health).toBeGreaterThan(30)
    expect(unit.status).toBe('repairing')
  })

  it('does not repair while moving', () => {
    const unit = makeUnit({ id: 'sam_3', nation: 'usa', health: 40, status: 'moving', waypoints: [{ lat: 26, lng: 52 }] })
    const state = makeState([unit, makeBase('base_1', 'usa')])

    processRepair(state)

    expect(unit.health).toBe(40)
    expect(unit.status).toBe('moving')
  })

  it('does not repair while packing or deploying', () => {
    const unit = makeUnit({ id: 'sam_4', nation: 'usa', health: 40, status: 'ready', readiness: 'deploying', readinessTimer: 100 })
    const state = makeState([unit, makeBase('base_1', 'usa')])

    processRepair(state)

    expect(unit.health).toBe(40)
    expect(unit.status).toBe('ready')
  })

  it('does not repair without a supply base in range', () => {
    const unit = makeUnit({ id: 'sam_5', nation: 'usa', health: 40, status: 'ready' })
    const farBase = makeUnit({ id: 'base_far', nation: 'usa', category: 'airbase', logistics: 100, position: { lat: 40, lng: 65 } })
    const state = makeState([unit, farBase])

    processRepair(state)

    expect(unit.health).toBe(40)
    expect(unit.status).toBe('ready')
  })

  it('returns to ready once fully repaired', () => {
    const unit = makeUnit({ id: 'sam_6', nation: 'usa', health: 99.5, status: 'damaged' })
    const state = makeState([unit, makeBase('base_1', 'usa')])

    processRepair(state)

    expect(unit.health).toBe(100)
    expect(unit.status).toBe('ready')
  })
})
