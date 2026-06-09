import { describe, it, expect, beforeEach } from 'vitest'
import { processDroneSwarm, resetDroneAIState } from '../drone-ai'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'missile_battery',
    position: { lat: 27, lng: 52 },
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
    roe: 'weapons_free' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[]): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 1000, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
    attackCounters: {},
  }
}

// shahed_131 range is 900km
const droneLauncher = () => makeUnit({
  id: 'ir_drone',
  nation: 'iran',
  weapons: [{ weaponId: 'shahed_131', count: 20, maxCount: 20, reloadTimeSec: 0 }],
})

// ── Tests ───────────────────────────────────────────────────────

describe('processDroneSwarm', () => {
  beforeEach(() => {
    resetDroneAIState()
  })

  it('launches at reachable targets even when the highest-priority target is out of range', () => {
    // Airbase (priority 10) ~1190km away — beyond shahed_131 range
    const farAirbase = makeUnit({ id: 'us_far', nation: 'usa', category: 'airbase', position: { lat: 27, lng: 64 } })
    // Ship (priority 6) ~99km away — well in range
    const nearShip = makeUnit({ id: 'us_near', nation: 'usa', category: 'ship', position: { lat: 27, lng: 53 } })
    const state = makeState([droneLauncher(), farAirbase, nearShip])

    const cmds = processDroneSwarm(state, 'iran', 'usa', new SeededRNG(42), 'defensive')
    expect(cmds.length).toBeGreaterThanOrEqual(1)
    expect(cmds.every(c => c.type === 'LAUNCH_MISSILE' && c.targetId === 'us_near')).toBe(true)
  })

  it('returns no commands when no target is reachable', () => {
    const farAirbase = makeUnit({ id: 'us_far', nation: 'usa', category: 'airbase', position: { lat: 27, lng: 64 } })
    const state = makeState([droneLauncher(), farAirbase])

    expect(processDroneSwarm(state, 'iran', 'usa', new SeededRNG(42), 'defensive')).toHaveLength(0)
  })
})
