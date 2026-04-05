import { describe, it, expect } from 'vitest'
import { detectThreats } from '../detection'
import { orientSAMRadars } from '../ai'
import { buildSensorNetwork, detectThreatsNetworked } from '../sensor-network'
import { ElevationGrid } from '../elevation'
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
    path: [[51, 25], [51.5, 25.5]],
    timestamps: [1000, 2000],
    status: 'inflight',
    launchTime: 1000,
    eta: 2000,
    altitude_m: 10000,
    phase: 'cruise',
    speed_current_mach: 0.8,
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
    time: { tick: 10, timestamp, speed: 1, tickIntervalMs: 100 },
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

// ── Tests ───────────────────────────────────────────────────────

describe('SAM sector detection', () => {
  it('SAMs with sector_deg detect targets within their arc (bug #2 regression)', () => {
    // Regression: SAM heading=180 (south), sector=90. Target approaching from south.
    // Bearing to target ~180 degrees. Half arc = 45. |180-180| = 0 < 45. Should detect.
    const sam = makeUnit({
      id: 'sector_sam',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      heading: 180, // facing south
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.95, sector_deg: 90 }],
    })

    // Missile south of SAM (lat 24 = south of lat 25)
    const missile = makeMissile({
      id: 'south_missile',
      nation: 'iran',
      path: [[51, 24], [51, 24.5]],
      timestamps: [1000, 2000],
    })

    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats.length).toBeGreaterThanOrEqual(1)
    expect(threats[0].missile.id).toBe('south_missile')
  })

  it('SAMs with sector_deg do NOT detect targets outside their arc', () => {
    // SAM heading=180 (south), sector=90. Target at bearing 0 (north).
    // |0 - 180| = 180 > 45 (half arc). Should NOT detect.
    const sam = makeUnit({
      id: 'sector_sam',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      heading: 180, // facing south
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.95, sector_deg: 90 }],
    })

    // Missile north of SAM (bearing ~0 from SAM)
    const missile = makeMissile({
      id: 'north_missile',
      nation: 'iran',
      path: [[51, 26], [51, 25.5]],
      timestamps: [1000, 2000],
    })

    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })
})

describe('orientSAMRadars', () => {
  it('orients sector-limited SAM heading toward enemy centroid (bug #2 regression)', () => {
    // Regression: SAMs started with heading=0 (north) but enemies were to the south/east.
    // orientSAMRadars should point the SAM toward the enemy centroid.
    const sam = makeUnit({
      id: 'iran_sam',
      nation: 'iran',
      position: { lat: 32, lng: 52 }, // inside Iran
      heading: 0, // initially facing north
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92, sector_deg: 120 }],
    })

    // USA carrier group south-west of Iran
    const carrier = makeUnit({
      id: 'usa_cvn',
      nation: 'usa',
      position: { lat: 25, lng: 51 }, // Persian Gulf
    })

    const state = makeState([sam, carrier])

    // Before orientation, heading is 0 (north)
    expect(sam.heading).toBe(0)

    orientSAMRadars(state)

    // After orientation, heading should point roughly south (toward the carrier)
    // Carrier is south-west from SAM. Bearing from (32,52) to (25,51) is roughly 181-190 degrees.
    expect(sam.heading).toBeGreaterThan(150)
    expect(sam.heading).toBeLessThan(220)
  })

  it('does not orient SAMs without sector-limited radar', () => {
    const sam = makeUnit({
      id: 'omni_sam',
      nation: 'iran',
      position: { lat: 32, lng: 52 },
      heading: 0,
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92 }], // no sector_deg => 360
    })

    const carrier = makeUnit({
      id: 'usa_cvn',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
    })

    const state = makeState([sam, carrier])
    orientSAMRadars(state)

    // Omnidirectional radar: heading should stay unchanged
    expect(sam.heading).toBe(0)
  })

  it('respects excludeNation parameter', () => {
    const usaSam = makeUnit({
      id: 'usa_patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      heading: 0,
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, sector_deg: 90 }],
    })

    const iranTarget = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 30, lng: 53 },
    })

    const state = makeState([usaSam, iranTarget])
    // Exclude USA from orientation (player-controlled SAMs keep manual heading)
    orientSAMRadars(state, 'usa')

    // USA SAM should NOT have been re-oriented
    expect(usaSam.heading).toBe(0)
  })
})

describe('radar horizon', () => {
  it('radar horizon caps effectiveRange, does not skip detection (bug #4 regression)', () => {
    // Regression: the old code did `if (horizonKm < dist) continue` which completely
    // skipped detection. The fix: cap effectiveRange to horizonKm, then check dist <= effectiveRange.
    // A low-altitude missile close to the radar should still be detected.

    // Flat grid at sea level
    const elevations = Array.from({ length: 5 }, () => Array(5).fill(0))
    const grid = makeGrid(24, 29, 50, 55, 1.0, elevations)

    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 15 }],
    })

    // Low-altitude missile (30m) very close to the radar (~7km away)
    // Radar horizon at 15m antenna + 30m target = 4.12*(sqrt(15)+sqrt(30)) = 4.12*(3.87+5.48) = ~38.5km
    // Distance ~7km < 38.5km -> should detect
    const missile = makeMissile({
      id: 'low_cruise',
      nation: 'iran',
      altitude_m: 30,
      path: [[51.05, 25.05], [51.1, 25.1]], // ~7km from SAM
      timestamps: [1000, 2000],
    })

    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam, grid)
    expect(threats.length).toBeGreaterThanOrEqual(1)
    expect(threats[0].missile.id).toBe('low_cruise')
  })

  it('radar horizon blocks detection of distant low-altitude targets', () => {
    // Low-altitude missile far away should not be detected due to horizon
    const elevations = Array.from({ length: 10 }, () => Array(10).fill(0))
    const grid = makeGrid(20, 30, 45, 55, 1.0, elevations)

    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 15 }],
    })

    // Low-altitude missile 100km away
    // Radar horizon at 15m + 30m = 4.12*(3.87+5.48) = ~38.5km
    // Distance ~100km > 38.5km -> should NOT detect
    const missile = makeMissile({
      id: 'distant_low',
      nation: 'iran',
      altitude_m: 30,
      path: [[52, 25.9], [52.1, 25.95]], // ~100km+ from SAM
      timestamps: [1000, 2000],
    })

    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam, grid)
    expect(threats).toHaveLength(0)
  })
})

describe('networked detection', () => {
  it('SAM connected to AWACS can see AWACS-detected threats', () => {
    // AWACS detects a missile far away. SAM within datalink range of AWACS
    // should also see the threat via the network.
    // Note: without elevation grid, detectThreats uses the altitude fallback:
    //   flight_altitude_ft < 500 => effectiveRange *= 0.4
    //   flight_altitude_ft < 5000 => effectiveRange *= 0.7
    // Tomahawk has flight_altitude_ft=100, so range drops to 40%.
    // We use a large AWACS range to compensate (1000km * 0.4 = 400km effective).
    const awacs = makeUnit({
      id: 'awacs',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 1000, detection_prob: 0.95 }],
      datalink_range_km: 600,
    })

    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25.5, lng: 51.5 }, // ~70km from AWACS, within datalink
      sensors: [{ type: 'radar', range_km: 50, detection_prob: 0.95 }], // short radar range
    })

    // Missile ~200km from SAM (beyond SAM's 50km * 0.4 = 20km effective range)
    // but within AWACS 1000km * 0.4 = 400km effective range (~185km away from AWACS)
    const missile = makeMissile({
      id: 'far_cruise',
      nation: 'iran',
      altitude_m: 30,
      path: [[53, 25], [52.5, 25.3]],
      timestamps: [1000, 2000],
    })

    const state = makeState([awacs, sam], [missile])
    const network = buildSensorNetwork(state)

    // SAM's own detection: missile is ~200km away, effective range 50*0.4=20km -> can't see it
    const ownThreats = detectThreats(state, sam)
    expect(ownThreats).toHaveLength(0)

    // Networked detection: AWACS sees it and shares with SAM
    const networkThreats = detectThreatsNetworked(state, sam, network)
    expect(networkThreats.length).toBeGreaterThanOrEqual(1)
    expect(networkThreats[0].missile.id).toBe('far_cruise')
    // Network quality should not be 'own' since it came from AWACS
    expect(networkThreats[0].networkQuality).not.toBe('own')
  })
})
