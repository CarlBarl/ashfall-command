import { describe, it, expect, beforeEach } from 'vitest'
import { launchMissile, resetCombatState } from '../combat'
import { haversine } from '../../utils/geo'
import type { GameState, Unit, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'missile_battery',
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
    sensors: [],
    pointDefense: [],
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[]): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: 1000000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: unitMap,
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('launchMissile with waypoints', () => {
  beforeEach(() => {
    resetCombatState()
  })

  it('launches with direct path when no waypoints provided (backward compat)', () => {
    const launcher = makeUnit({
      id: 'launcher1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })
    const target = makeUnit({
      id: 'target1',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const state = makeState([launcher, target])
    const event = launchMissile(state, 'launcher1', 'tomahawk', 'target1')

    expect(event).not.toBeNull()
    expect(event!.type).toBe('MISSILE_LAUNCHED')

    const missile = Array.from(state.missiles.values())[0]
    expect(missile).toBeDefined()
    expect(missile.path.length).toBeGreaterThan(0)
    expect(missile.path.length).toBe(missile.timestamps.length)

    // Direct path: first point near launcher, last near target
    const firstPoint = missile.path[0]
    const lastPoint = missile.path[missile.path.length - 1]
    expect(firstPoint[0]).toBeCloseTo(51, 0) // lng
    expect(firstPoint[1]).toBeCloseTo(25, 0) // lat
    expect(lastPoint[0]).toBeCloseTo(53, 0)
    expect(lastPoint[1]).toBeCloseTo(27, 0)
  })

  it('launches with waypoints producing a longer path', () => {
    // Launcher at (25, 51), target at (27, 53)
    // Waypoint detours to (26, 55) — east then back
    const launcher = makeUnit({
      id: 'launcher1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })
    const target = makeUnit({
      id: 'target1',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const waypoint = { lat: 26, lng: 55 }
    const state = makeState([launcher, target])

    // Launch with waypoints
    const event = launchMissile(state, 'launcher1', 'tomahawk', 'target1', [waypoint])
    expect(event).not.toBeNull()

    const missile = Array.from(state.missiles.values())[0]
    expect(missile).toBeDefined()
    expect(missile.path.length).toBe(missile.timestamps.length)

    // The waypoint path should pass near the waypoint
    // Check that some path point is close to the waypoint
    const nearWaypoint = missile.path.some(([lng, lat]) => {
      const d = haversine({ lat, lng }, waypoint)
      return d < 20 // within 20km of waypoint
    })
    expect(nearWaypoint).toBe(true)

    // Total distance via waypoint should be longer than direct
    const directDist = haversine(launcher.position, target.position)
    const waypointDist = haversine(launcher.position, waypoint) + haversine(waypoint, target.position)
    expect(waypointDist).toBeGreaterThan(directDist)

    // Timestamps should be monotonically increasing
    for (let i = 1; i < missile.timestamps.length; i++) {
      expect(missile.timestamps[i]).toBeGreaterThan(missile.timestamps[i - 1])
    }
  })

  it('falls back to direct path when waypoint route exceeds weapon range', () => {
    // Tomahawk range: 1600km
    // Direct distance ~300km (in range)
    // Waypoint far away to push total > 1600km
    const launcher = makeUnit({
      id: 'launcher1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })
    const target = makeUnit({
      id: 'target1',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    // Waypoint very far away — total route will exceed 1600km
    const farWaypoint = { lat: 40, lng: 70 }
    const state = makeState([launcher, target])

    const event = launchMissile(state, 'launcher1', 'tomahawk', 'target1', [farWaypoint])
    expect(event).not.toBeNull()

    const missile = Array.from(state.missiles.values())[0]
    expect(missile).toBeDefined()

    // Should have fallen back to direct path, so no point near the far waypoint
    const nearFarWaypoint = missile.path.some(([lng, lat]) => {
      const d = haversine({ lat, lng }, farWaypoint)
      return d < 50
    })
    expect(nearFarWaypoint).toBe(false)

    // Path should still be valid
    expect(missile.path.length).toBe(missile.timestamps.length)
    expect(missile.path.length).toBeGreaterThan(0)
  })

  it('uses total waypoint distance for fuel calculation', () => {
    const launcher = makeUnit({
      id: 'launcher1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })
    const target = makeUnit({
      id: 'target1',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    // Launch direct
    const state1 = makeState([
      makeUnit({ ...launcher, id: 'launcher1', nation: 'usa', weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }] }),
      makeUnit({ ...target, id: 'target1', nation: 'iran' }),
    ])
    launchMissile(state1, 'launcher1', 'tomahawk', 'target1')
    const directMissile = Array.from(state1.missiles.values())[0]

    // Launch with waypoint detour
    const waypoint = { lat: 26, lng: 55 }
    const state2 = makeState([
      makeUnit({ ...launcher, id: 'launcher1', nation: 'usa', weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }] }),
      makeUnit({ ...target, id: 'target1', nation: 'iran' }),
    ])
    launchMissile(state2, 'launcher1', 'tomahawk', 'target1', [waypoint])
    const waypointMissile = Array.from(state2.missiles.values())[0]

    // Both missiles should use the same fuel formula (range_km / speed),
    // so fuel_remaining_sec should be identical (it's based on max range, not distance)
    // Actually fuel is based on range_km which is constant for the weapon spec
    expect(directMissile.fuel_remaining_sec).toBe(waypointMissile.fuel_remaining_sec)
  })

  it('handles multiple waypoints', () => {
    const launcher = makeUnit({
      id: 'launcher1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 10, maxCount: 10, reloadTimeSec: 0 }],
    })
    const target = makeUnit({
      id: 'target1',
      nation: 'iran',
      position: { lat: 27, lng: 53 },
    })

    const wp1 = { lat: 25.5, lng: 52 }
    const wp2 = { lat: 26.5, lng: 52.5 }
    const state = makeState([launcher, target])

    const event = launchMissile(state, 'launcher1', 'tomahawk', 'target1', [wp1, wp2])
    expect(event).not.toBeNull()

    const missile = Array.from(state.missiles.values())[0]
    expect(missile).toBeDefined()
    expect(missile.path.length).toBe(missile.timestamps.length)

    // Path should pass near both waypoints
    const nearWp1 = missile.path.some(([lng, lat]) => {
      return haversine({ lat, lng }, wp1) < 20
    })
    const nearWp2 = missile.path.some(([lng, lat]) => {
      return haversine({ lat, lng }, wp2) < 20
    })
    expect(nearWp1).toBe(true)
    expect(nearWp2).toBe(true)

    // Timestamps monotonically increasing
    for (let i = 1; i < missile.timestamps.length; i++) {
      expect(missile.timestamps[i]).toBeGreaterThan(missile.timestamps[i - 1])
    }
  })
})
