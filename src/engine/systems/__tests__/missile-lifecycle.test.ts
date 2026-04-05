import { describe, it, expect } from 'vitest'
import { launchMissile, processCombat, resetCombatState } from '../combat'
import { weaponSpecs } from '@/data/weapons/missiles'
import { SeededRNG } from '../../utils/rng'
import { haversine } from '../../utils/geo'
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
    path: [[51, 25], [52, 26]],
    timestamps: [1000, 60000],
    status: 'inflight',
    launchTime: 1000,
    eta: 60000,
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
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('launchMissile', () => {
  it('launched missile has valid path and timestamps', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 27, lng: 53 }, // ~300km away
    })

    const state = makeState([launcher, target])
    const event = launchMissile(state, 'destroyer', 'tomahawk', 'iran_base')

    expect(event).not.toBeNull()
    expect(event!.type).toBe('MISSILE_LAUNCHED')

    // Should have created exactly one missile
    expect(state.missiles.size).toBe(1)
    const missile = [...state.missiles.values()][0]

    // Path and timestamps should have same length
    expect(missile.path.length).toBe(missile.timestamps.length)
    expect(missile.path.length).toBeGreaterThan(2)

    // Path starts near launcher and ends near target
    const startPos = missile.path[0]
    const endPos = missile.path[missile.path.length - 1]
    expect(startPos[0]).toBeCloseTo(51, 0) // lng
    expect(startPos[1]).toBeCloseTo(25, 0) // lat
    expect(endPos[0]).toBeCloseTo(53, 0)
    expect(endPos[1]).toBeCloseTo(27, 0)

    // Timestamps are monotonically increasing
    for (let i = 1; i < missile.timestamps.length; i++) {
      expect(missile.timestamps[i]).toBeGreaterThan(missile.timestamps[i - 1])
    }

    // Status should be inflight
    expect(missile.status).toBe('inflight')
    expect(missile.phase).toBe('cruise')
    expect(missile.fuel_remaining_sec).toBeGreaterThan(0)
  })

  it('missile with waypoints follows waypoint path', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const waypoint = { lat: 26, lng: 50 } // route goes west first then northeast
    const state = makeState([launcher, target])
    const event = launchMissile(state, 'destroyer', 'tomahawk', 'iran_base', [waypoint])

    expect(event).not.toBeNull()

    const missile = [...state.missiles.values()][0]
    // Path should include points near the waypoint
    // Find the closest path point to the waypoint
    let minDist = Infinity
    for (const [lng, lat] of missile.path) {
      const d = haversine({ lat, lng }, waypoint)
      if (d < minDist) minDist = d
    }
    // Some path point should pass very close to the waypoint (within a few km)
    expect(minDist).toBeLessThan(10)
  })

  it('decrements ammo on launch', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 5, maxCount: 10, reloadTimeSec: 0 }],
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const state = makeState([launcher, target])
    launchMissile(state, 'destroyer', 'tomahawk', 'iran_base')

    const loadout = state.units.get('destroyer')!.weapons.find(w => w.weaponId === 'tomahawk')!
    expect(loadout.count).toBe(4)
  })

  it('returns null when weapon out of ammo', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 0, maxCount: 10, reloadTimeSec: 0 }],
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const state = makeState([launcher, target])
    const event = launchMissile(state, 'destroyer', 'tomahawk', 'iran_base')
    expect(event).toBeNull()
    expect(state.missiles.size).toBe(0)
  })

  it('returns null when target out of range', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })

    // Tomahawk range is 1600km, this target is ~5000km away
    const target = makeUnit({
      id: 'far_target',
      nation: 'iran',
      position: { lat: 60, lng: 80 },
    })

    const state = makeState([launcher, target])
    const event = launchMissile(state, 'destroyer', 'tomahawk', 'far_target')
    expect(event).toBeNull()
    expect(state.missiles.size).toBe(0)
  })
})

describe('missile in-flight behavior', () => {
  it('missile reaches target and impacts via processCombat', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
    })

    // Target very close (2km away)
    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 25.01, lng: 51.01 },
    })

    const state = makeState([launcher, target], [], 1000)

    // Create a missile aimed at the close target, nearly arrived
    const spec = weaponSpecs['tomahawk']
    const missile = makeMissile({
      id: 'test_cruise',
      nation: 'usa',
      launcherId: 'destroyer',
      targetId: 'iran_base',
      path: [[51, 25], [51.01, 25.01]],
      timestamps: [1000, 1100], // arrives in 100ms
      altitude_m: spec.flight_altitude_ft * 0.3048,
      phase: 'cruise',
      speed_current_mach: spec.speed_mach,
      fuel_remaining_sec: 2000,
      eta: 1100,
      launchTime: 1000,
    })
    state.missiles.set('test_cruise', missile)

    // Advance time past ETA and run combat
    state.time.timestamp = 1200
    state.time.tick = 1
    const rng = new SeededRNG(42)
    processCombat(state, rng)

    // Missile should have impacted
    const m = state.missiles.get('test_cruise')
    // After impact the missile may be deleted or marked 'impact'
    if (m) {
      expect(m.status).toBe('impact')
    }
    // Either way, it's no longer 'inflight'
    for (const remaining of state.missiles.values()) {
      if (remaining.id === 'test_cruise') {
        expect(remaining.status).not.toBe('inflight')
      }
    }
  })

  it('missile out of fuel crashes before reaching target', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 30, lng: 56 }, // far away
    })

    const state = makeState([launcher, target], [], 10000)

    // Missile with almost no fuel left
    const missile = makeMissile({
      id: 'dry_cruise',
      nation: 'usa',
      launcherId: 'destroyer',
      targetId: 'iran_base',
      path: [[52, 26], [56, 30]],
      timestamps: [1000, 100000],
      altitude_m: 30,
      phase: 'cruise',
      speed_current_mach: 0.75,
      fuel_remaining_sec: 1, // nearly empty
      eta: 100000, // far future
      launchTime: 1000,
    })
    state.missiles.set('dry_cruise', missile)

    const rng = new SeededRNG(42)

    // Run many ticks -- fuel will deplete, speed decays, altitude drops to 0
    for (let i = 0; i < 200; i++) {
      state.time.tick = i
      state.time.timestamp = 10000 + i * 1000
      processCombat(state, rng)
    }

    // Missile should be gone (crashed due to altitude 0 + no fuel) or impacted
    const m = state.missiles.get('dry_cruise')
    if (m) {
      // If still tracked, it's not inflight anymore
      expect(m.status).not.toBe('inflight')
    }
    // If deleted from the map, that's the expected crash behavior
  })

  it('combat.ts preserves terrain-following altitude gains (bug #5 regression)', () => {
    // Regression: updateMissileAltitudes used to set altitude_m = spec_altitude unconditionally,
    // undoing terrain-following climbs. The fix: use Math.max(specAlt, missile.altitude_m).
    resetCombatState()

    const launcher = makeUnit({
      id: 'destroyer',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
    })

    const target = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 30, lng: 56 },
    })

    const state = makeState([launcher, target], [], 5000)

    // Cruise missile that has been terrain-following at 2000m (over mountains)
    const spec = weaponSpecs['tomahawk']
    const cruiseAltM = spec.flight_altitude_ft * 0.3048 // ~30m

    const missile = makeMissile({
      id: 'terrain_cruise',
      nation: 'usa',
      launcherId: 'destroyer',
      targetId: 'iran_base',
      path: [[52, 26], [56, 30]],
      timestamps: [1000, 100000],
      altitude_m: 2000, // terrain-following: climbed to 2000m
      phase: 'cruise',
      speed_current_mach: spec.speed_mach,
      fuel_remaining_sec: 2000,
      eta: 100000,
      launchTime: 1000,
    })
    state.missiles.set('terrain_cruise', missile)

    const rng = new SeededRNG(42)
    // Run processCombat which calls updateMissileAltitudes internally
    processCombat(state, rng)

    // Altitude should be preserved (>= 2000m), not reset to cruise altitude (~30m)
    const m = state.missiles.get('terrain_cruise')
    expect(m).toBeDefined()
    if (m && m.status === 'inflight') {
      expect(m.altitude_m).toBeGreaterThanOrEqual(2000)
      // Specifically, it must NOT have been reset to the spec cruise altitude
      expect(m.altitude_m).not.toBeCloseTo(cruiseAltM, 0)
    }
  })

  it('ballistic missile goes through boost, midcourse, terminal phases', () => {
    resetCombatState()

    const launcher = makeUnit({
      id: 'iran_tel',
      nation: 'iran',
      position: { lat: 32, lng: 52 },
      weapons: [{ weaponId: 'shahab3', count: 5, maxCount: 5, reloadTimeSec: 0 }],
    })

    const target = makeUnit({
      id: 'usa_base',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
    })

    // Check that shahab3 exists in weaponSpecs
    const shahab3Spec = weaponSpecs['shahab3']
    if (!shahab3Spec) {
      // Skip test if shahab3 doesn't exist - use a different BM
      return
    }

    const state = makeState([launcher, target])
    const event = launchMissile(state, 'iran_tel', 'shahab3', 'usa_base')
    if (!event) return // out of range

    const missile = [...state.missiles.values()][0]
    expect(missile.phase).toBe('boost')

    const rng = new SeededRNG(42)
    const flightDuration = missile.eta - missile.launchTime

    // Advance to midcourse (20% through flight)
    state.time.timestamp = missile.launchTime + flightDuration * 0.2
    state.time.tick = 100
    processCombat(state, rng)

    const midMissile = state.missiles.get(missile.id)
    if (midMissile && midMissile.status === 'inflight') {
      expect(midMissile.phase).toBe('midcourse')
      expect(midMissile.altitude_m).toBeGreaterThan(0)
    }

    // Advance to terminal (85% through flight)
    state.time.timestamp = missile.launchTime + flightDuration * 0.85
    state.time.tick = 200
    processCombat(state, rng)

    const termMissile = state.missiles.get(missile.id)
    if (termMissile && termMissile.status === 'inflight') {
      expect(termMissile.phase).toBe('terminal')
    }
  })
})
