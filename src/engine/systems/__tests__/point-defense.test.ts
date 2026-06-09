import { describe, it, expect } from 'vitest'
import { processPointDefense } from '../point-defense'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'destroyer',
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
    pointDefense: [{ specId: 'phalanx_ciws', active: true, ammo: 1000, maxAmmo: 1000 }],
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
    weaponId: 'tomahawk',
    launcherId: 'launcher_1',
    targetId: 'ddg',
    // ~1km north of the unit
    path: [[51, 25.1], [51, 25.009]],
    timestamps: [0, 1000],
    status: 'inflight',
    launchTime: 0,
    eta: 60000,
    altitude_m: 30,
    phase: 'cruise',
    speed_current_mach: 0.75,
    fuel_remaining_sec: 300,
    is_interceptor: false,
    ...overrides,
  } as Missile
}

function makeState(units: Unit[], missiles: Missile[] = [], timestamp = 1500): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  const missileMap = new Map(missiles.map(m => [m.id, m]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 1, timestamp, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: unitMap,
    missiles: missileMap,
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('processPointDefense', () => {
  it('engages an inbound cruise missile in range (consumes ammo)', () => {
    const ddg = makeUnit({ id: 'ddg', nation: 'usa' })
    const threat = makeMissile({ id: 'vampire', nation: 'iran' })
    const state = makeState([ddg], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(ddg.pointDefense[0].ammo).toBe(900)
    expect(ddg.pointDefense[0].cooldownUntil).toBeDefined()
  })

  it('does not fire under hold_fire ROE (regression: PD ignored ROE)', () => {
    const ddg = makeUnit({ id: 'ddg', nation: 'usa', roe: 'hold_fire' })
    const threat = makeMissile({ id: 'vampire', nation: 'iran' })
    const state = makeState([ddg], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(ddg.pointDefense[0].ammo).toBe(1000)
    expect(ddg.pointDefense[0].cooldownUntil).toBeUndefined()
    expect(state.missiles.get('vampire')?.status).toBe('inflight')
  })

  it('does not fire while not deployed (regression: PD ignored readiness)', () => {
    const cram = makeUnit({
      id: 'cram_battery',
      nation: 'usa',
      readiness: 'moving',
      pointDefense: [{ specId: 'cram_centurion', active: true, ammo: 1000, maxAmmo: 1000 }],
    })
    const threat = makeMissile({ id: 'vampire', nation: 'iran', targetId: 'cram_battery' })
    const state = makeState([cram], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(cram.pointDefense[0].ammo).toBe(1000)
  })

  it('fires when deployed', () => {
    const cram = makeUnit({
      id: 'cram_battery',
      nation: 'usa',
      readiness: 'deployed',
      pointDefense: [{ specId: 'cram_centurion', active: true, ammo: 1000, maxAmmo: 1000 }],
    })
    const threat = makeMissile({ id: 'vampire', nation: 'iran', targetId: 'cram_battery' })
    const state = makeState([cram], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(cram.pointDefense[0].ammo).toBe(900)
  })

  it('ignores missiles far above the engagement ceiling (regression: CIWS vs exoatmospheric BM)', () => {
    const ddg = makeUnit({ id: 'ddg', nation: 'usa' })
    // Ballistic missile in midcourse: ground track overhead but 300km up
    const threat = makeMissile({
      id: 'bm_overhead',
      nation: 'iran',
      weaponId: 'shahab3',
      altitude_m: 300000,
      phase: 'midcourse',
      speed_current_mach: 7.0,
    })
    const state = makeState([ddg], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(ddg.pointDefense[0].ammo).toBe(1000)
    expect(state.missiles.get('bm_overhead')?.status).toBe('inflight')
  })

  it('still engages a ballistic missile that has descended into reach', () => {
    const ddg = makeUnit({ id: 'ddg', nation: 'usa' })
    const threat = makeMissile({
      id: 'bm_terminal',
      nation: 'iran',
      weaponId: 'shahab3',
      altitude_m: 800,
      phase: 'terminal',
      speed_current_mach: 9.0,
    })
    const state = makeState([ddg], [threat])

    processPointDefense(state, new SeededRNG(42))

    expect(ddg.pointDefense[0].ammo).toBe(900)
  })
})
