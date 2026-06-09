import { describe, it, expect } from 'vitest'
import { processEconomy } from '../economy'
import type { GameState, ShippingLane } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeLane(currentThroughput_mbd: number): ShippingLane {
  return {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    path: [[54.0, 26.8], [60.0, 23.0]],
    baseThroughput_mbd: 17.0,
    currentThroughput_mbd,
    suppressionFactor: 1 - currentThroughput_mbd / 17.0,
    status: 'open',
  }
}

function makeState(opts: { throughput?: number; storedOilPrice?: number; tick?: number } = {}): GameState {
  const { throughput = 17.0, storedOilPrice, tick = 3600 } = opts
  const economy = () => ({
    gdp_billions: 1000, military_budget_billions: 50, military_budget_pct_gdp: 5,
    oil_revenue_billions: 50, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 100,
    ...(storedOilPrice !== undefined ? { oilPrice_per_barrel: storedOilPrice } : {}),
  })
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: tick * 1000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: economy(), relations: { usa: 100, iran: -60 }, atWar: [] },
      iran: { id: 'iran', name: 'Iran', economy: economy(), relations: { usa: -60, iran: 100 }, atWar: [] },
    },
    units: new Map(),
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map([['hormuz', makeLane(throughput)]]),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('oil price events', () => {
  it('emits OIL_PRICE_CHANGE when the price moves past the threshold', () => {
    const state = makeState({ throughput: 8.5, storedOilPrice: 80 })

    processEconomy(state)

    const events = state.events.filter(e => e.type === 'OIL_PRICE_CHANGE')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ oldPrice: 80, tick: 3600 })
    if (events[0].type === 'OIL_PRICE_CHANGE') {
      expect(events[0].newPrice).toBeGreaterThan(100)
    }
    expect(state.pendingEvents.filter(e => e.type === 'OIL_PRICE_CHANGE')).toHaveLength(1)
  })

  it('does not emit for moves below the threshold', () => {
    const state = makeState({ throughput: 16.85, storedOilPrice: 80 })

    processEconomy(state)

    expect(state.events.filter(e => e.type === 'OIL_PRICE_CHANGE')).toHaveLength(0)
  })

  it('does not emit when the price is unchanged', () => {
    const state = makeState({ throughput: 17.0, storedOilPrice: 80 })

    processEconomy(state)

    expect(state.events).toHaveLength(0)
  })

  it('still stores the oil price on every nation', () => {
    const state = makeState({ throughput: 8.5 })

    processEconomy(state)

    expect(state.nations.usa.economy.oilPrice_per_barrel).toBeGreaterThan(100)
    expect(state.nations.iran.economy.oilPrice_per_barrel).toBe(state.nations.usa.economy.oilPrice_per_barrel)
  })
})
