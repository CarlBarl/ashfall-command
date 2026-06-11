import { describe, it, expect, beforeEach } from 'vitest'
import { processMovement } from '../movement'
import { processCombat, launchMissile, resetCombatState } from '../combat'
import { ElevationGrid } from '../elevation'
import { SeededRNG } from '../../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

/**
 * Regression suite for "missiles crash into elevation" (player report 2026-06-11).
 * Three real defects in the class:
 *  1. Ballistic altitude profile dipped to ~0 at the boost/midcourse and
 *     midcourse/terminal seams (parabola didn't match its endpoints) — rendered
 *     as the missile smashing into the ground mid-flight and resurrecting.
 *  2. Terminal dives ended at sea level, putting the last seconds underground
 *     for targets on high plateaus.
 *  3. Cruise terrain-following sampled only the current cell, so steep ridge
 *     faces caused a multi-thousand-meter altitude teleport on arrival; and a
 *     fuel-starved missile vanished with no feed event.
 */

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'airbase',
    position: { lat: 25, lng: 51 },
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
    roe: 'hold_fire',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[], missiles: Missile[] = []): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 1, timestamp: 1000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(missiles.map(m => [m.id, m])),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

function makeGrid(
  latMin: number, latMax: number, lngMin: number, lngMax: number,
  resolution: number, elevations: number[][],
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
    for (let c = 0; c < cols; c++) data[r * cols + c] = elevations[r][c]
  }
  return new ElevationGrid(buffer)
}

function tickWorld(state: GameState, grid: ElevationGrid | null, rng: SeededRNG): void {
  state.time.tick++
  state.time.timestamp += 1000
  processMovement(state, grid)
  processCombat(state, rng, grid, null)
}

beforeEach(() => {
  resetCombatState()
})

describe('ballistic altitude profile', () => {
  it('stays airborne through the whole arc — no ground dips at phase seams', () => {
    const launcher = makeUnit({
      id: 'ir_tel', nation: 'iran', category: 'missile_battery',
      position: { lat: 28, lng: 52 },
      weapons: [{ weaponId: 'fateh110', count: 2, maxCount: 2, reloadTimeSec: 0 }],
    })
    const target = makeUnit({ id: 'us_base', nation: 'usa', position: { lat: 26, lng: 52 } })
    const state = makeState([launcher, target])
    const rng = new SeededRNG(7)

    launchMissile(state, 'ir_tel', 'fateh110', 'us_base')
    const missile = Array.from(state.missiles.values())[0]
    expect(missile).toBeDefined()

    const flightMs = missile.eta - missile.launchTime
    const totalTicks = Math.ceil(flightMs / 1000)
    // Steepest legitimate segment is the boost ramp (0.5×peak over 15% of flight);
    // the seam bug snapped 0.5×peak in a single tick
    const expectedPeak = weaponSpecs['fateh110'].flight_altitude_ft * 0.3048
    const maxTickDelta = (0.5 * expectedPeak) / (0.15 * totalTicks) * 2

    let peakSeen = 0
    let prevAlt = missile.altitude_m

    for (let i = 0; i < totalTicks + 5; i++) {
      tickWorld(state, null, rng)
      const m = state.missiles.get(missile.id)
      if (!m || m.status !== 'inflight') break

      peakSeen = Math.max(peakSeen, m.altitude_m)
      const progress = (state.time.timestamp - m.launchTime) / flightMs

      // Mid-flight the missile must be high, never scraping the ground
      if (progress > 0.2 && progress < 0.85) {
        expect(m.altitude_m).toBeGreaterThan(expectedPeak * 0.2)
      }
      // No teleports: altitude moves smoothly between ticks
      expect(Math.abs(m.altitude_m - prevAlt)).toBeLessThan(maxTickDelta)
      prevAlt = m.altitude_m
    }

    expect(peakSeen).toBeGreaterThan(expectedPeak * 0.9)
  })

  it('terminal dive ends at the target plateau elevation, not sea level', () => {
    // Target sits on an 1800 m plateau
    const elevations = Array.from({ length: 8 }, () => Array(8).fill(1800))
    const grid = makeGrid(22, 30, 48, 56, 1.0, elevations)

    const launcher = makeUnit({
      id: 'ir_tel', nation: 'iran', category: 'missile_battery',
      position: { lat: 28, lng: 52 },
      weapons: [{ weaponId: 'fateh110', count: 2, maxCount: 2, reloadTimeSec: 0 }],
    })
    const target = makeUnit({ id: 'us_base', nation: 'usa', position: { lat: 26, lng: 52 } })
    const state = makeState([launcher, target])
    const rng = new SeededRNG(7)

    launchMissile(state, 'ir_tel', 'fateh110', 'us_base')
    const missile = Array.from(state.missiles.values())[0]
    const flightMs = missile.eta - missile.launchTime

    for (let i = 0; i < Math.ceil(flightMs / 1000) + 5; i++) {
      tickWorld(state, grid, rng)
      const m = state.missiles.get(missile.id)
      if (!m || m.status !== 'inflight') break

      const progress = (state.time.timestamp - m.launchTime) / flightMs
      // Late terminal: must stay at/above the plateau the target sits on
      if (m.phase === 'terminal' && progress > 0.9) {
        expect(m.altitude_m).toBeGreaterThanOrEqual(1700)
      }
    }
  })
})

describe('cruise terrain following over steep ridges', () => {
  it('climbs ahead of a 2500 m wall — no multi-km altitude teleport', () => {
    // Sea level everywhere except a 2500 m ridge band ~28-50 km east of launch
    const cols = 40
    const elevations = Array.from({ length: 20 }, () =>
      Array.from({ length: cols }, (_, c) => (c >= 14 && c <= 16 ? 2500 : 0)),
    )
    // 0.05° cells ≈ 5 km: ridge at lng 51.4-51.55
    const grid = makeGrid(24, 25, 50.7, 52.7, 0.05, elevations)

    const launcher = makeUnit({
      id: 'us_ship', nation: 'usa', category: 'ship',
      position: { lat: 24.5, lng: 50.75 },
      weapons: [{ weaponId: 'tomahawk', count: 2, maxCount: 2, reloadTimeSec: 0 }],
    })
    const target = makeUnit({ id: 'ir_base', nation: 'iran', position: { lat: 24.5, lng: 52.6 } })
    const state = makeState([launcher, target])
    const rng = new SeededRNG(7)

    launchMissile(state, 'us_ship', 'tomahawk', 'ir_base')
    const missile = Array.from(state.missiles.values())[0]

    let prevAlt = missile.altitude_m
    let crossedRidge = false
    for (let i = 0; i < 1200; i++) {
      tickWorld(state, grid, rng)
      const m = state.missiles.get(missile.id)
      if (!m || m.status !== 'inflight') break

      // Climb rate is capped at 150 m/s — anything bigger is the teleport bug
      expect(m.altitude_m - prevAlt).toBeLessThanOrEqual(160)
      prevAlt = m.altitude_m

      const pos = m.path[m.path.length - 1]
      const terrain = grid.getElevation(pos[1], pos[0])
      if (terrain > 2000) {
        crossedRidge = true
        // Over the ridge the missile must actually clear it
        expect(m.altitude_m).toBeGreaterThanOrEqual(terrain)
      }
    }

    expect(crossedRidge).toBe(true)
  })

  it('a fuel-starved missile crashes loudly, not silently', () => {
    const launcher = makeUnit({
      id: 'us_ship', nation: 'usa', category: 'ship',
      position: { lat: 24.5, lng: 51 },
      weapons: [{ weaponId: 'tomahawk', count: 2, maxCount: 2, reloadTimeSec: 0 }],
    })
    const target = makeUnit({ id: 'ir_base', nation: 'iran', position: { lat: 24.5, lng: 60 } })
    const state = makeState([launcher, target])
    const rng = new SeededRNG(7)

    launchMissile(state, 'us_ship', 'tomahawk', 'ir_base')
    const missile = Array.from(state.missiles.values())[0]
    missile.fuel_remaining_sec = 3 // starve it

    for (let i = 0; i < 60 && state.missiles.has(missile.id); i++) {
      tickWorld(state, null, rng)
    }

    expect(state.missiles.has(missile.id)).toBe(false)
    const crash = state.events.find(e => e.type === 'MISSILE_CRASHED')
    expect(crash).toBeDefined()
  })
})
