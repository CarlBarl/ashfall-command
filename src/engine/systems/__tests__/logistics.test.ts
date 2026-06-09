import { describe, it, expect, beforeEach } from 'vitest'
import type { Unit, NationId, GameState } from '@/types/game'
import { processLogistics, resetLogisticsState } from '../logistics'

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

function makeState(units: Unit[]): GameState {
  const map = new Map<string, Unit>()
  for (const u of units) map.set(u.id, u)
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 60, timestamp: 0, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: 100, iran: -60 }, atWar: [] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: -60, iran: 100 }, atWar: [] },
    },
    units: map,
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

beforeEach(() => {
  resetLogisticsState()
})

describe('processResupply with stocked depots', () => {
  it('lets a SAM site draw from its own depot stocks', () => {
    const sam = makeUnit({
      id: 's300_isfahan',
      nation: 'iran',
      logistics: 100,
      supplyStocks: [{ weaponId: 's300_48n6e2', count: 16, maxCount: 32, productionRate: 0 }],
      weapons: [{ weaponId: 's300_48n6e2', count: 30, maxCount: 32, reloadTimeSec: 720 }],
    })
    const state = makeState([sam])

    processLogistics(state)

    expect(sam.weapons[0].count).toBe(31)
    expect(sam.supplyStocks[0].count).toBe(15)
    expect(state.events.some(e => e.type === 'RESUPPLIED' && e.unitId === 's300_isfahan')).toBe(true)
  })

  it('lets a nearby field unit draw from a SAM-site depot', () => {
    const depot = makeUnit({
      id: 'bavar_tehran',
      nation: 'iran',
      position: { lat: 35.69, lng: 51.39 },
      logistics: 100,
      supplyStocks: [{ weaponId: 'bavar373_int', count: 12, maxCount: 24, productionRate: 0 }],
      weapons: [],
    })
    const battery = makeUnit({
      id: 'bavar_field',
      nation: 'iran',
      position: { lat: 35.75, lng: 51.25 },
      weapons: [{ weaponId: 'bavar373_int', count: 20, maxCount: 24, reloadTimeSec: 600 }],
    })
    const state = makeState([depot, battery])

    processLogistics(state)

    expect(battery.weapons[0].count).toBe(21)
    expect(depot.supplyStocks[0].count).toBe(11)
  })

  it('still ignores units without stocks or logistics as supply sources', () => {
    const bystander = makeUnit({
      id: 'plain_sam',
      nation: 'iran',
      position: { lat: 35.69, lng: 51.39 },
      weapons: [],
    })
    const battery = makeUnit({
      id: 'needy',
      nation: 'iran',
      position: { lat: 35.75, lng: 51.25 },
      weapons: [{ weaponId: 'bavar373_int', count: 20, maxCount: 24, reloadTimeSec: 600 }],
    })
    const state = makeState([bystander, battery])

    processLogistics(state)

    expect(battery.weapons[0].count).toBe(20)
  })
})
