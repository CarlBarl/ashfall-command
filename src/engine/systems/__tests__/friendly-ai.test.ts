import { describe, it, expect, beforeEach } from 'vitest'
import { processFriendlyAI, resetFriendlyAIState } from '../friendly-ai'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, NationId, WeaponLoadout } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
    position: { lat: 26, lng: 52 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 150,
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

function loadout(weaponId: string, count: number): WeaponLoadout {
  return { weaponId, count, maxCount: count, reloadTimeSec: 0 }
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

// Iranian ship ~55km away — inside harpoon (130km) and tomahawk (1600km) range
const enemyShip = () => makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 26.5, lng: 52 } })

// ── Tests ───────────────────────────────────────────────────────

describe('processFriendlyAI', () => {
  beforeEach(() => {
    resetFriendlyAIState()
  })

  it('never auto-fires strategic cruise/ballistic weapons; tactical ashm still fires', () => {
    const ship = makeUnit({
      id: 'us_ship',
      nation: 'usa',
      weapons: [loadout('tomahawk', 30), loadout('sm6', 12), loadout('harpoon', 8)],
    })
    const state = makeState([ship, enemyShip()])

    // Several cooldown cycles of war under weapons_free
    const fired: string[] = []
    for (let t = 1000; t <= 2900; t += 100) {
      state.time.tick = t
      for (const cmd of processFriendlyAI(state, new SeededRNG(42))) {
        if (cmd.type === 'LAUNCH_MISSILE') fired.push(cmd.weaponId)
      }
    }

    expect(fired.length).toBeGreaterThanOrEqual(1)
    expect(fired.every(w => w === 'harpoon')).toBe(true)
    expect(fired).not.toContain('tomahawk')
    expect(fired).not.toContain('sm6')
  })

  it('does not auto-fire ballistic missiles or loitering munitions', () => {
    const battery = makeUnit({
      id: 'ir_battery',
      nation: 'iran',
      category: 'missile_battery',
      position: { lat: 26.5, lng: 52 },
      weapons: [loadout('fateh110', 30), loadout('shahed_136', 40)],
    })
    const usTarget = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26, lng: 52 } })
    const state = makeState([battery, usTarget])

    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)
  })

  it('skips non-deployed units without burning their fire cooldown', () => {
    const battery = makeUnit({
      id: 'us_battery',
      nation: 'usa',
      category: 'missile_battery',
      readiness: 'packing',
      readinessTimer: 300,
      deploy_time_sec: 600,
      weapons: [loadout('harpoon', 8)],
    })
    const state = makeState([battery, enemyShip()])

    state.time.tick = 1000
    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)

    // Once deployed it fires immediately — the rejected pass must not have started the cooldown
    battery.readiness = 'deployed'
    state.time.tick = 1001
    const cmds = processFriendlyAI(state, new SeededRNG(42))
    expect(cmds.length).toBeGreaterThanOrEqual(1)
  })
})
