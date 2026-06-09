import { describe, it, expect } from 'vitest'
import { GameEngine } from '../game-engine'
import type { Nation, Unit, NationId } from '@/types/game'

// ── Scenario helpers ────────────────────────────────────────────

function makeNation(id: NationId, name: string): Nation {
  return {
    id,
    name,
    economy: { gdp_billions: 1000, military_budget_billions: 100, military_budget_pct_gdp: 3, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 100 },
    relations: { usa: 0, iran: 0 },
    atWar: [],
  }
}

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId; category: Unit['category'] }): Unit {
  return {
    name: overrides.id,
    position: { lat: 26, lng: 52 },
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

function buildScenario(): { nations: Record<string, Nation>; units: Unit[] } {
  const nations = { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }
  const units: Unit[] = [
    makeUnit({
      id: 'us_tlam', nation: 'usa', category: 'missile_battery',
      position: { lat: 26, lng: 52 },
      roe: 'weapons_free',
      weapons: [{ weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 }],
    }),
    makeUnit({
      id: 'us_base', nation: 'usa', category: 'airbase',
      position: { lat: 26, lng: 52.2 },
    }),
    makeUnit({
      id: 'us_sam', nation: 'usa', category: 'sam_site',
      position: { lat: 26.05, lng: 52.2 },
      roe: 'weapons_free',
      weapons: [{ weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 0 }],
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    }),
    makeUnit({
      id: 'ir_bm', nation: 'iran', category: 'missile_battery',
      position: { lat: 27.5, lng: 52.2 },
      weapons: [{ weaponId: 'fateh110', count: 30, maxCount: 30, reloadTimeSec: 0 }],
    }),
    makeUnit({
      id: 'ir_base', nation: 'iran', category: 'airbase',
      position: { lat: 27.6, lng: 52.3 },
    }),
  ]
  return { nations, units }
}

// ── Tests ───────────────────────────────────────────────────────

describe('enemy AI escalation (full engine)', () => {
  it('runs the escalation ladder: weapons_free on war, defensive retaliation, then offensive initiative — without draining the fleet', () => {
    const { nations, units } = buildScenario()
    const engine = new GameEngine()
    engine.initFromData('usa', nations, units, [], {})

    // Player strikes Iran → war
    engine.executeCommand({ type: 'LAUNCH_MISSILE', launcherId: 'us_tlam', weaponId: 'tomahawk', targetId: 'ir_base' })
    expect(engine.state.nations.usa.atWar).toContain('iran')
    expect(engine.state.nations.iran.atWar).toContain('usa')

    // ALERT: enemy force goes weapons_free within the first minute of war
    for (let i = 0; i < 5; i++) engine.tick()
    expect(engine.state.units.get('ir_bm')!.roe).toBe('weapons_free')

    // Run the war WITHOUT ever draining pendingEvents (worst case: hidden tab) —
    // AI behavior must not depend on UI polling
    let sawInterceptor = false
    while (engine.state.time.tick < 2000) {
      engine.tick()
      if (!sawInterceptor) {
        for (const m of engine.state.missiles.values()) {
          if (m.is_interceptor) { sawInterceptor = true; break }
        }
      }
    }

    const iranLaunchTicks = engine.state.events
      .filter(e => e.type === 'MISSILE_LAUNCHED' && e.launcherId === 'ir_bm')
      .map(e => e.tick)

    // DEFENSIVE: retaliation shortly after the tomahawk lands (~tick 700)
    expect(iranLaunchTicks.some(t => t < 800)).toBe(true)

    // One impact = one retaliation: no runaway re-triggering off stale events
    expect(iranLaunchTicks.filter(t => t > 800 && t <= 1800)).toHaveLength(0)

    // OFFENSIVE: after sustained war the enemy initiates salvos unprovoked
    expect(iranLaunchTicks.some(t => t > 1800)).toBe(true)

    // Strategic drain regression: weapons_free + at war for hours must NOT
    // auto-fire the player's Tomahawks — only the one player launch is gone
    expect(engine.state.units.get('us_tlam')!.weapons[0].count).toBe(19)

    // Defensive auto-fire is still alive: SAMs intercepted the retaliation salvo
    expect(sawInterceptor).toBe(true)
  })
})
