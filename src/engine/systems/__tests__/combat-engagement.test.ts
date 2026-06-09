import { describe, it, expect, beforeEach } from 'vitest'
import { processCombat, launchSAM, resetCombatState } from '../combat'
import { SeededRNG } from '../../utils/rng'
import { destination } from '../../utils/geo'
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
    weaponId: 'tomahawk',
    launcherId: 'launcher_1',
    targetId: 'target_1',
    path: [[51, 25.5], [51, 25.36]],
    timestamps: [0, 1000],
    status: 'inflight',
    launchTime: 0,
    eta: 200000,
    altitude_m: 30,
    phase: 'cruise',
    speed_current_mach: 0.75,
    fuel_remaining_sec: 2000,
    is_interceptor: false,
    ...overrides,
  } as Missile
}

function makeState(units: Unit[], missiles: Missile[] = [], timestamp = 1000): GameState {
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
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

function interceptors(state: GameState): Missile[] {
  return [...state.missiles.values()].filter(m => m.is_interceptor)
}

// ── Tests ───────────────────────────────────────────────────────

describe('engagement release on interceptor loss', () => {
  beforeEach(() => {
    resetCombatState()
  })

  it('re-engages a threat after its interceptor dies of fuel exhaustion (regression: channel leak)', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 200, detection_prob: 0.9 }],
      weapons: [{ weaponId: 'pac3_mse', count: 5, maxCount: 5, reloadTimeSec: 0 }],
    })
    // Cruise missile ~40km north, inbound
    const threat = makeMissile({
      id: 'threat_1',
      nation: 'iran',
      targetId: 'patriot',
      path: [[51, 25.5], [51, 25.36]],
      timestamps: [0, 1000],
    })

    const state = makeState([sam], [threat], 1000)
    const rng = new SeededRNG(42)

    state.time.tick = 1
    processCombat(state, rng)

    const loadout = sam.weapons[0]
    expect(loadout.count).toBe(4)
    expect(interceptors(state)).toHaveLength(1)

    // Interceptor runs out of fuel without reaching the threat
    interceptors(state)[0].fuel_remaining_sec = 0

    state.time.timestamp = 2000
    state.time.tick = 2
    processCombat(state, rng)

    // Channel and engagement must be released: a fresh interceptor is fired
    expect(loadout.count).toBe(3)
    expect(interceptors(state)).toHaveLength(1)
    expect(state.missiles.get('threat_1')?.status).toBe('inflight')
  })
})

describe('reload behavior', () => {
  beforeEach(() => {
    resetCombatState()
  })

  it('reload_time_sec 0 means no reload — magazine stays empty (regression: instant 25% refill)', () => {
    const aegis = makeUnit({
      id: 'aegis',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 370, detection_prob: 0.9 }],
      weapons: [{ weaponId: 'sm2_iiia', count: 1, maxCount: 8, reloadTimeSec: 0 }],
    })
    const threat = makeMissile({
      id: 'threat_1',
      nation: 'iran',
      targetId: 'aegis',
      path: [[51, 25.6], [51, 25.45]],
      timestamps: [0, 1000],
    })

    const state = makeState([aegis], [threat], 1000)
    const rng = new SeededRNG(42)

    state.time.tick = 1
    processCombat(state, rng)

    const loadout = aegis.weapons[0]
    expect(loadout.count).toBe(0)
    expect(loadout.reloadingUntil).toBeUndefined()

    state.time.timestamp = 2000
    state.time.tick = 2
    processCombat(state, rng)

    expect(loadout.count).toBe(0)
    expect(loadout.reloadingUntil).toBeUndefined()
  })

  it('reload_time_sec > 0 still schedules a reload on depletion', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 200, detection_prob: 0.9 }],
      weapons: [{ weaponId: 'pac3_mse', count: 1, maxCount: 4, reloadTimeSec: 0 }],
    })
    const threat = makeMissile({
      id: 'threat_1',
      nation: 'iran',
      targetId: 'patriot',
      path: [[51, 25.5], [51, 25.36]],
      timestamps: [0, 1000],
    })

    const state = makeState([sam], [threat], 1000)
    const rng = new SeededRNG(42)

    state.time.tick = 1
    processCombat(state, rng)

    const loadout = sam.weapons[0]
    expect(loadout.count).toBe(0)
    // patriot_pac3 reload_time_sec is 600
    expect(loadout.reloadingUntil).toBe(1000 + 600 * 1000)
  })
})

describe('intercept resolution kill window', () => {
  beforeEach(() => {
    resetCombatState()
  })

  it('resolves a high-closure intercept instead of tunneling past the 2km radius', () => {
    const ship = makeUnit({ id: 'aegis_ship', nation: 'usa', position: { lat: 25, lng: 51 } })

    // Shahab-3 in midcourse, 3km north of the interceptor, head-on.
    // Closure is Mach 13.2 + 7.0 (~6.9 km/s): consecutive 1s samples straddle a 2km window.
    const threatPos = destination({ lat: 25, lng: 51 }, 0, 3)
    const threat = makeMissile({
      id: 'bm_1',
      nation: 'iran',
      weaponId: 'shahab3',
      targetId: 'aegis_ship',
      path: [[threatPos.lng, threatPos.lat + 0.05], [threatPos.lng, threatPos.lat]],
      timestamps: [39000, 40000],
      altitude_m: 100000,
      phase: 'midcourse',
      speed_current_mach: 7.0,
      fuel_remaining_sec: 0,
      launchTime: 0,
      eta: 100000,
    })
    const interceptor = makeMissile({
      id: 'int_test',
      nation: 'usa',
      weaponId: 'sm3_iia',
      launcherId: 'aegis_ship',
      targetId: '',
      is_interceptor: true,
      interceptTargetMissileId: 'bm_1',
      path: [[51, 25]],
      timestamps: [40000],
      altitude_m: 100000,
      phase: 'cruise',
      speed_current_mach: 13.2,
      fuel_remaining_sec: 100,
      launchTime: 39000,
      eta: 45000,
    })

    const state = makeState([ship], [threat, interceptor], 40000)
    const rng = new SeededRNG(42)

    state.time.tick = 1
    processCombat(state, rng)

    // At 3km with ~6.9 km/s closure the engagement must resolve this tick (hit or miss),
    // not overshoot into an unwinnable stern chase
    expect(state.missiles.has('int_test')).toBe(false)
  })
})

describe('launchSAM engagement tracking', () => {
  beforeEach(() => {
    resetCombatState()
  })

  it('manual SAM shot registers the threat so auto-AD does not double-fire', () => {
    const ship = makeUnit({
      id: 'ddg',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 370, detection_prob: 0.9 }],
      weapons: [{ weaponId: 'sm2_iiia', count: 8, maxCount: 8, reloadTimeSec: 0 }],
    })
    const threat = makeMissile({
      id: 'threat_1',
      nation: 'iran',
      targetId: 'ddg',
      path: [[51, 25.6], [51, 25.45]],
      timestamps: [0, 1000],
    })

    const state = makeState([ship], [threat], 1000)
    const rng = new SeededRNG(42)

    launchSAM(state, 'ddg', 'sm2_iiia', 'threat_1', rng)

    const loadout = ship.weapons[0]
    expect(loadout.count).toBe(7)
    expect(interceptors(state)).toHaveLength(1)

    state.time.timestamp = 2000
    state.time.tick = 1
    processCombat(state, rng)

    // Auto-AD must respect the manual engagement instead of firing a second interceptor
    expect(loadout.count).toBe(7)
    expect(interceptors(state)).toHaveLength(1)
  })
})
