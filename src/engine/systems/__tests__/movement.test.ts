import { describe, it, expect } from 'vitest'
import { processMovement } from '../movement'
import { ElevationGrid } from '../elevation'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine, ktsToKmh } from '../../utils/geo'
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

function makeState(units: Unit[], missiles: Missile[] = [], timestamp = 1500): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  const missileMap = new Map(missiles.map(m => [m.id, m]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp, speed: 1, tickIntervalMs: 100 },
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

/**
 * Build a minimal ElevationGrid from known parameters.
 * Binary format: 20-byte header (5 x Float32) + row-major Float32 grid.
 */
function makeGrid(
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number,
  resolution: number,
  elevations: number[][],
): ElevationGrid {
  const rows = elevations.length
  const cols = elevations[0].length

  const buffer = new ArrayBuffer(20 + rows * cols * 4)
  const header = new Float32Array(buffer, 0, 5)
  header[0] = latMin
  header[1] = latMax
  header[2] = lngMin
  header[3] = lngMax
  header[4] = resolution

  const data = new Float32Array(buffer, 20, rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      data[r * cols + c] = elevations[r][c]
    }
  }

  return new ElevationGrid(buffer)
}

/**
 * Theater-sized grid (lat 12-43, lng 32-70, 0.05 deg) matching the route-planner
 * constants. All water (elevation 0) except the given "row,col" land cells.
 */
function makeTheaterGrid(landCells?: Set<string>): ElevationGrid {
  const latMin = 12
  const latMax = 43
  const lngMin = 32
  const lngMax = 70
  const resolution = 0.05
  const rows = Math.round((latMax - latMin) / resolution)
  const cols = Math.round((lngMax - lngMin) / resolution)

  const buffer = new ArrayBuffer(20 + rows * cols * 4)
  const header = new Float32Array(buffer, 0, 5)
  header[0] = latMin
  header[1] = latMax
  header[2] = lngMin
  header[3] = lngMax
  header[4] = resolution

  const data = new Float32Array(buffer, 20, rows * cols)
  if (landCells) {
    for (const key of landCells) {
      const [row, col] = key.split(',').map(Number)
      data[row * cols + col] = 100
    }
  }
  return new ElevationGrid(buffer)
}

// ── Tests ───────────────────────────────────────────────────────

describe('terrain following', () => {
  it('uses current missile position, not target position for terrain check (bug #1 regression)', () => {
    // Regression test: missile at sea level, target on a 1500m mountain.
    // The old code used path[path.length-1] (target position on mountain) for terrain check,
    // which saw 1500m terrain under a 30m-altitude missile and instantly crashed it.
    // The fix: use the current missile position (interpolated from timestamps).

    // Grid: 10x10 degrees, resolution 1.0
    // Missile launches from sea-level area (lat 24, lng 50) toward mountain at (lat 26, lng 52)
    // Sea level at launch row/col (0,0), mountain at row 2, col 2
    const elevations: number[][] = []
    for (let r = 0; r < 10; r++) {
      const row: number[] = []
      for (let c = 0; c < 10; c++) {
        // Mountain only at row 2, col 2 (lat=24+2=26, lng=50+2=52) — far from launch
        if (r === 2 && c === 2) {
          row.push(1500)
        } else {
          row.push(0) // sea level everywhere else
        }
      }
      elevations.push(row)
    }
    const grid = makeGrid(24, 34, 50, 60, 1.0, elevations)

    // Missile at sea level, just launched. Path goes from (50,24) to (52,26).
    // Current time = 1500, timestamps [1000, 60000]. At t=1500, missile is near the START.
    // Grid row for lat 24 = (24-24)/1 = 0, col for lng 50 = (50-50)/1 = 0 => elevation 0 (sea)
    const missile = makeMissile({
      id: 'cruise_1',
      nation: 'iran',
      path: [[50, 24], [52, 26]], // [lng, lat] launch at sea level, target on mountain
      timestamps: [1000, 60000],
      altitude_m: 30, // cruise altitude (Tomahawk ~30m = 100ft)
      phase: 'cruise',
      fuel_remaining_sec: 2000,
    })

    const state = makeState([], [missile], 1500)

    // Run terrain following. Missile is near launch point (sea level).
    // It should NOT crash -- terrain at current position is 0m, missile is at 30m.
    processMovement(state, grid)

    // Missile should still exist and be inflight
    expect(state.missiles.has('cruise_1')).toBe(true)
    expect(state.missiles.get('cruise_1')!.status).toBe('inflight')
  })

  it('missile climbs over terrain higher than cruise altitude', () => {
    // 5x5 grid, all at 100m elevation. Missile starts at 30m.
    // requiredAlt = max(cruiseAlt ~30m, 100 + 50) = 150m. Climb needed: 150 - 30 = 120m.
    // Max climb per tick is 150m, so 120m climb completes in 1 tick.
    // After climb: altitude_m = 30 + 120 = 150m. Crash check: 150 >= 100 => safe.
    const elevations = Array.from({ length: 5 }, () => Array(5).fill(100))
    const grid = makeGrid(24, 29, 50, 55, 1.0, elevations)

    const missile = makeMissile({
      id: 'climber',
      nation: 'iran',
      path: [[51, 25], [53, 27]],
      timestamps: [1000, 60000],
      altitude_m: 30,
      phase: 'cruise',
      fuel_remaining_sec: 2000,
    })

    const state = makeState([], [missile], 1500)
    processMovement(state, grid)

    // Missile should have climbed from 30m to ~150m (terrain 100 + clearance 50)
    const m = state.missiles.get('climber')!
    expect(m.altitude_m).toBeGreaterThan(30)
    // Should still be inflight, not crashed
    expect(m.status).toBe('inflight')
  })

  it('missile descends back to cruise altitude after passing high terrain', () => {
    // Grid where missile's current position is over sea level
    const elevations = Array.from({ length: 5 }, () => Array(5).fill(0))
    const grid = makeGrid(24, 29, 50, 55, 1.0, elevations)

    // Missile was terrain-following at 2000m but now over sea-level terrain
    const spec = weaponSpecs['tomahawk']
    const cruiseAltM = spec.flight_altitude_ft * 0.3048 // ~30m

    const missile = makeMissile({
      id: 'descender',
      nation: 'iran',
      path: [[51, 25], [53, 27]],
      timestamps: [1000, 60000],
      altitude_m: 2000, // elevated from previous terrain following
      phase: 'cruise',
      fuel_remaining_sec: 2000,
    })

    const state = makeState([], [missile], 1500)
    processMovement(state, grid)

    // Missile should descend toward cruise altitude
    // requiredAlt = max(cruiseAltM, 0 + 50) = 50m
    // 2000m > 50 + 100 = 150, so descent triggers: max(50, 2000 - 50) = 1950
    const m = state.missiles.get('descender')!
    expect(m.altitude_m).toBeLessThan(2000)
    expect(m.altitude_m).toBeGreaterThanOrEqual(cruiseAltM)
  })

  it('climbing costs extra fuel', () => {
    // Grid at 100m elevation. Missile at 30m needs to climb to 150m (100 + 50 clearance).
    // Climb = 120m. Fuel penalty = 120 * 0.001 = 0.12 sec deducted.
    const elevations = Array.from({ length: 5 }, () => Array(5).fill(100))
    const grid = makeGrid(24, 29, 50, 55, 1.0, elevations)

    const initialFuel = 2000
    const missile = makeMissile({
      id: 'fuel_test',
      nation: 'iran',
      path: [[51, 25], [53, 27]],
      timestamps: [1000, 60000],
      altitude_m: 30,
      phase: 'cruise',
      fuel_remaining_sec: initialFuel,
    })

    const state = makeState([], [missile], 1500)
    processMovement(state, grid)

    // Should have consumed extra fuel due to climb penalty
    const m = state.missiles.get('fuel_test')!
    expect(m.fuel_remaining_sec).toBeLessThan(initialFuel)
  })
})

describe('unit movement', () => {
  it('moves unit toward waypoint', () => {
    const unit = makeUnit({
      id: 'ship_1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      maxSpeed_kts: 30,
      speed_kts: 30,
      waypoints: [{ lat: 26, lng: 52 }],
      status: 'moving',
    })

    const state = makeState([unit])
    const oldLat = unit.position.lat
    const oldLng = unit.position.lng

    processMovement(state)

    // Unit should have moved
    const u = state.units.get('ship_1')!
    const moved = u.position.lat !== oldLat || u.position.lng !== oldLng
    expect(moved).toBe(true)
  })

  it('stops moving when waypoint reached', () => {
    const unit = makeUnit({
      id: 'ship_1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      maxSpeed_kts: 30,
      speed_kts: 30,
      waypoints: [{ lat: 25.0001, lng: 51.0001 }], // very close waypoint
      status: 'moving',
    })

    const state = makeState([unit])
    processMovement(state)

    const u = state.units.get('ship_1')!
    expect(u.waypoints).toHaveLength(0)
    expect(u.status).toBe('ready')
  })

  it('skips destroyed units', () => {
    const unit = makeUnit({
      id: 'destroyed_ship',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      maxSpeed_kts: 30,
      speed_kts: 30,
      waypoints: [{ lat: 26, lng: 52 }],
      status: 'destroyed',
    })

    const state = makeState([unit])
    processMovement(state)

    // Position should not change
    const u = state.units.get('destroyed_ship')!
    expect(u.position.lat).toBe(25)
    expect(u.position.lng).toBe(51)
  })

  it('skips static installations (maxSpeed_kts = 0)', () => {
    const unit = makeUnit({
      id: 'sam_site',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      maxSpeed_kts: 0,
      waypoints: [{ lat: 26, lng: 52 }],
    })

    const state = makeState([unit])
    processMovement(state)

    const u = state.units.get('sam_site')!
    expect(u.position.lat).toBe(25)
    expect(u.position.lng).toBe(51)
  })

  it('moves at max speed from the first order (stale patrol speed regression)', () => {
    const unit = makeUnit({
      id: 'ship_slow',
      nation: 'usa',
      category: 'ship',
      position: { lat: 25, lng: 51 },
      speed_kts: 3,
      maxSpeed_kts: 30,
      waypoints: [{ lat: 26, lng: 52 }],
      status: 'moving',
    })

    const state = makeState([unit])
    processMovement(state)

    const u = state.units.get('ship_slow')!
    expect(u.speed_kts).toBe(30)
    const moved = haversine({ lat: 25, lng: 51 }, u.position)
    expect(moved).toBeCloseTo(ktsToKmh(30) / 3600, 3)
  })
})

describe('terrain-skip readiness lifecycle', () => {
  it('starts deploying when a terrain skip exhausts the last waypoint (stuck readiness regression)', () => {
    // Unit's next step lands on water — old code left readiness 'moving' forever
    const elevations = Array.from({ length: 10 }, () => Array(10).fill(100))
    elevations[1][1] = 0
    const grid = makeGrid(24, 34, 50, 60, 1.0, elevations)

    const unit = makeUnit({
      id: 'mobile_sam',
      nation: 'usa',
      category: 'sam_site',
      position: { lat: 25, lng: 51 },
      maxSpeed_kts: 30,
      waypoints: [{ lat: 26, lng: 52 }],
      status: 'moving',
      readiness: 'moving',
      deploy_time_sec: 300,
    })

    const state = makeState([unit])
    processMovement(state, grid)

    const u = state.units.get('mobile_sam')!
    expect(u.waypoints).toHaveLength(0)
    expect(u.readiness).toBe('deploying')
    expect(u.readinessTimer).toBe(300)
    expect(u.status).toBe('ready')
    expect(u.speed_kts).toBe(0)
  })
})

describe('naval re-route on land blockage', () => {
  // Land wall at lng 51 (col 380), lat 26-28 (rows 280-320). Ship just west of it,
  // next 1-second step crosses into the wall cell.
  const wall = new Set<string>()
  for (let row = 280; row <= 320; row++) wall.add(`${row},380`)

  it('re-routes around land instead of shedding waypoints (silent strand regression)', () => {
    const grid = makeTheaterGrid(wall)
    const dest = { lat: 27, lng: 51.5 }
    const ship = makeUnit({
      id: 'ddg_1',
      nation: 'usa',
      category: 'ship',
      position: { lat: 27, lng: 50.973 },
      maxSpeed_kts: 1000,
      waypoints: [{ ...dest }],
      status: 'moving',
    })

    const state = makeState([ship])
    processMovement(state, grid)

    const u = state.units.get('ddg_1')!
    // Old behavior: waypoint shifted away -> stranded with no orders
    expect(u.waypoints.length).toBeGreaterThan(1)
    const last = u.waypoints[u.waypoints.length - 1]
    expect(last.lat).toBeCloseTo(dest.lat, 6)
    expect(last.lng).toBeCloseTo(dest.lng, 6)

    // Ship makes progress along the new route and stays on water
    for (let i = 0; i < 20; i++) processMovement(state, grid)
    expect(haversine({ lat: 27, lng: 50.973 }, u.position)).toBeGreaterThan(0)
    expect(grid.isWater(u.position.lat, u.position.lng)).toBe(true)
  })

  it('falls back to skipping the waypoint and completes the lifecycle when no water route exists', () => {
    const enclosure = new Set<string>()
    for (let row = 299; row <= 301; row++) {
      for (let col = 378; col <= 380; col++) {
        if (row === 300 && col === 379) continue
        enclosure.add(`${row},${col}`)
      }
    }
    const grid = makeTheaterGrid(enclosure)
    const ship = makeUnit({
      id: 'ddg_2',
      nation: 'usa',
      category: 'ship',
      position: { lat: 27, lng: 50.973 },
      maxSpeed_kts: 1000,
      waypoints: [{ lat: 27, lng: 51.5 }],
      status: 'moving',
    })

    const state = makeState([ship])
    processMovement(state, grid)

    const u = state.units.get('ddg_2')!
    expect(u.waypoints).toHaveLength(0)
    expect(u.status).toBe('ready')
    expect(u.speed_kts).toBe(0)
  })
})
