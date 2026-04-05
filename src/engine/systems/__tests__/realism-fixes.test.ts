import { describe, it, expect } from 'vitest'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { processReadiness } from '../readiness'
import { processCombat, resetCombatState } from '../combat'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

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

function makeMissile(overrides: Partial<Missile> & { id: string; nation: NationId }): Missile {
  return {
    weaponId: 'shahab3',
    launcherId: 'launcher_1',
    targetId: 'target_1',
    path: [[52, 32], [51, 25]],
    timestamps: [0, 60000],
    status: 'inflight',
    launchTime: 0,
    eta: 60000,
    altitude_m: 100000,
    phase: 'terminal',
    speed_current_mach: 7.0,
    fuel_remaining_sec: 0,
    is_interceptor: false,
    ...overrides,
  } as Missile
}

function makeState(units: Unit[], missiles: Missile[] = [], timestamp = 0): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  const missileMap = new Map(missiles.map(m => [m.id, m]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: unitMap,
    missiles: missileMap,
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Weapon Spec Corrections ────────────────────────────────────

describe('weapon spec corrections', () => {
  it('SM-6 range is 370km per CSIS', () => {
    expect(weaponSpecs['sm6'].range_km).toBe(370)
  })

  it('Aegis AAW engagement range matches SM-6 range (370km)', () => {
    expect(adSystems['aegis_aaw'].engagement_range_km).toBe(370)
  })

  it('Fateh-110 CEP is 250m per CSIS baseline', () => {
    expect(weaponSpecs['fateh110'].cep_m).toBe(250)
  })
})

// ── Terminal Reentry Acceleration ──────────────────────────────

describe('ballistic missile terminal reentry acceleration', () => {
  it('speed increases significantly (>20%) during terminal phase', () => {
    resetCombatState()

    const launcher = makeUnit({ id: 'iran_tel', nation: 'iran' })
    const target = makeUnit({ id: 'usa_base', nation: 'usa', position: { lat: 25, lng: 51 } })

    const spec = weaponSpecs['shahab3']
    const flightDuration = 60000 // 60000 ticks

    // Create a BM at 70% flight progress (start of terminal phase)
    // Set speed to spec speed (midcourse burnout speed)
    const missile = makeMissile({
      id: 'bm_terminal',
      nation: 'iran',
      weaponId: 'shahab3',
      launcherId: 'iran_tel',
      targetId: 'usa_base',
      launchTime: 0,
      eta: flightDuration,
      speed_current_mach: spec.speed_mach,
      phase: 'terminal',
      altitude_m: 50000,
      fuel_remaining_sec: 0,
    })

    const state = makeState([launcher, target], [missile])
    const rng = new SeededRNG(42)

    // Advance to 90% of flight (well into terminal phase)
    state.time.timestamp = flightDuration * 0.9
    state.time.tick = 1

    processCombat(state, rng)

    const m = state.missiles.get('bm_terminal')
    expect(m).toBeDefined()
    if (m && m.status === 'inflight') {
      // Speed should have increased by at least 20% from spec
      // Real BMs gain 50-70% during reentry
      expect(m.speed_current_mach).toBeGreaterThan(spec.speed_mach * 1.2)
    }
  })
})

// ── Readiness Skips Destroyed Units ────────────────────────────

describe('readiness system skips destroyed units', () => {
  it('does not modify destroyed units with active timers', () => {
    const destroyed = makeUnit({
      id: 'destroyed_sam',
      nation: 'iran',
      status: 'destroyed',
      readiness: 'deploying',
      readinessTimer: 10,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const state = makeState([destroyed])

    processReadiness(state)

    const u = state.units.get('destroyed_sam')!
    // Timer should NOT have changed — destroyed units are skipped
    expect(u.readinessTimer).toBe(10)
    expect(u.readiness).toBe('deploying')
  })

  it('still processes non-destroyed units normally', () => {
    const destroyed = makeUnit({
      id: 'destroyed_sam',
      nation: 'iran',
      status: 'destroyed',
      readiness: 'deploying',
      readinessTimer: 5,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const alive = makeUnit({
      id: 'alive_sam',
      nation: 'iran',
      status: 'ready',
      readiness: 'packing',
      readinessTimer: 3,
      deploy_time_sec: 300,
      pack_time_sec: 300,
    })
    const state = makeState([destroyed, alive])

    processReadiness(state)

    // Destroyed unit unchanged
    expect(state.units.get('destroyed_sam')!.readinessTimer).toBe(5)
    // Alive unit processes normally
    expect(state.units.get('alive_sam')!.readinessTimer).toBe(2)
  })
})
