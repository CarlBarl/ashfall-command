import { describe, it, expect } from 'vitest'
import type { Unit, NationId, GameState } from '@/types/game'
import { processReadiness } from '../readiness'

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 25, lng: 51 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 25,
    health: 100,
    maxHealth: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [{ weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 }],
    pointDefense: [],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[]): GameState {
  const map = new Map<string, Unit>()
  for (const u of units) map.set(u.id, u)
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp: 0, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: 100, iran: -60 }, atWar: [] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: -60, iran: 100 }, atWar: [] },
    },
    units: map,
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
  }
}

describe('processReadiness', () => {
  it('counts down packing timer each tick', () => {
    const unit = makeUnit({
      id: 'patriot_1',
      nation: 'usa',
      readiness: 'packing',
      readinessTimer: 5,
      deploy_time_sec: 1800,
      pack_time_sec: 900,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('patriot_1')!
    expect(u.readiness).toBe('packing')
    expect(u.readinessTimer).toBe(4)
  })

  it('transitions packing -> moving when timer reaches 0', () => {
    const unit = makeUnit({
      id: 'patriot_1',
      nation: 'usa',
      readiness: 'packing',
      readinessTimer: 1,
      deploy_time_sec: 1800,
      pack_time_sec: 900,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('patriot_1')!
    expect(u.readiness).toBe('moving')
    expect(u.readinessTimer).toBe(0)
  })

  it('counts down deploying timer each tick', () => {
    const unit = makeUnit({
      id: 's300_1',
      nation: 'iran',
      readiness: 'deploying',
      readinessTimer: 10,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('s300_1')!
    expect(u.readiness).toBe('deploying')
    expect(u.readinessTimer).toBe(9)
  })

  it('transitions deploying -> deployed when timer reaches 0', () => {
    const unit = makeUnit({
      id: 's300_1',
      nation: 'iran',
      readiness: 'deploying',
      readinessTimer: 1,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('s300_1')!
    expect(u.readiness).toBe('deployed')
    expect(u.readinessTimer).toBe(0)
  })

  it('does not modify units without readiness (always operational)', () => {
    const ship = makeUnit({
      id: 'ddg_1',
      nation: 'usa',
      category: 'ship',
      // No readiness, deploy_time_sec, or pack_time_sec — always operational
    })
    const state = makeState([ship])

    processReadiness(state)

    const u = state.units.get('ddg_1')!
    expect(u.readiness).toBeUndefined()
    expect(u.readinessTimer).toBeUndefined()
  })

  it('does not modify deployed units (no timer to count down)', () => {
    const unit = makeUnit({
      id: 'patriot_1',
      nation: 'usa',
      readiness: 'deployed',
      readinessTimer: 0,
      deploy_time_sec: 1800,
      pack_time_sec: 900,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('patriot_1')!
    expect(u.readiness).toBe('deployed')
    expect(u.readinessTimer).toBe(0)
  })

  it('does not modify moving units (no timer to count down)', () => {
    const unit = makeUnit({
      id: 'tor_1',
      nation: 'iran',
      readiness: 'moving',
      readinessTimer: 0,
      deploy_time_sec: 180,
      pack_time_sec: 120,
    })
    const state = makeState([unit])

    processReadiness(state)

    const u = state.units.get('tor_1')!
    expect(u.readiness).toBe('moving')
    expect(u.readinessTimer).toBe(0)
  })

  it('processes multiple units in a single tick', () => {
    const packing = makeUnit({
      id: 'patriot_1',
      nation: 'usa',
      readiness: 'packing',
      readinessTimer: 3,
      deploy_time_sec: 1800,
      pack_time_sec: 900,
    })
    const deploying = makeUnit({
      id: 's300_1',
      nation: 'iran',
      readiness: 'deploying',
      readinessTimer: 1,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const deployed = makeUnit({
      id: 'thaad_1',
      nation: 'usa',
      readiness: 'deployed',
      readinessTimer: 0,
      deploy_time_sec: 1200,
      pack_time_sec: 600,
    })
    const state = makeState([packing, deploying, deployed])

    processReadiness(state)

    expect(state.units.get('patriot_1')!.readinessTimer).toBe(2)
    expect(state.units.get('patriot_1')!.readiness).toBe('packing')
    expect(state.units.get('s300_1')!.readiness).toBe('deployed')
    expect(state.units.get('s300_1')!.readinessTimer).toBe(0)
    expect(state.units.get('thaad_1')!.readiness).toBe('deployed')
  })
})
