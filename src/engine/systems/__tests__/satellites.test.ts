import { describe, it, expect } from 'vitest'
import { processSatellites, resetSatelliteState } from '../satellites'
import type { GameState, Unit, NationId, SatellitePass } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 32, lng: 53 },
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
    roe: 'weapons_free' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeSatellite(overrides: Partial<SatellitePass> & { id: string; nation: NationId }): SatellitePass {
  return {
    type: 'optical',
    swathWidth_km: 50,
    revisitInterval_sec: 3600,
    lastPassTick: 0,
    groundTrack: {
      startLat: 30, startLng: 50,
      endLat: 36, endLng: 56,
    },
    ...overrides,
  }
}

function makeState(units: Unit[], satellites: { usa?: SatellitePass[]; iran?: SatellitePass[] } = {}): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 3600, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
        satellites: satellites.usa ?? [],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
        satellites: satellites.iran ?? [],
      },
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

describe('processSatellites', () => {
  it('reveals enemy unit within swath', () => {
    resetSatelliteState()
    // Iranian unit sitting on the ground track line (roughly mid-point)
    const iranUnit = makeUnit({
      id: 'iran_sam',
      nation: 'iran',
      position: { lat: 33, lng: 53 }, // close to the line from (30,50)→(36,56)
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0, // pass is due at tick 3600
    })

    const state = makeState([iranUnit], { usa: [usaSat] })
    const revealed = processSatellites(state)

    expect(revealed).toContain('iran_sam')
  })

  it('does NOT reveal enemy unit outside swath', () => {
    resetSatelliteState()
    // Unit far from the ground track
    const iranUnit = makeUnit({
      id: 'iran_far',
      nation: 'iran',
      position: { lat: 25, lng: 45 }, // hundreds of km from the track
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
    })

    const state = makeState([iranUnit], { usa: [usaSat] })
    const revealed = processSatellites(state)

    expect(revealed).not.toContain('iran_far')
  })

  it('respects revisit interval (no pass if too soon)', () => {
    resetSatelliteState()
    const iranUnit = makeUnit({
      id: 'iran_sam',
      nation: 'iran',
      position: { lat: 33, lng: 53 },
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 3500, // only 100 seconds ago — too soon for 3600s interval
    })

    const state = makeState([iranUnit], { usa: [usaSat] })
    state.time.tick = 3600

    const revealed = processSatellites(state)
    expect(revealed).not.toContain('iran_sam')
  })

  it('does not reveal own-nation units', () => {
    resetSatelliteState()
    const usaUnit = makeUnit({
      id: 'usa_base',
      nation: 'usa',
      position: { lat: 33, lng: 53 }, // right on the ground track
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
    })

    const state = makeState([usaUnit], { usa: [usaSat] })
    const revealed = processSatellites(state)

    expect(revealed).not.toContain('usa_base')
  })

  it('does not reveal destroyed units', () => {
    resetSatelliteState()
    const iranUnit = makeUnit({
      id: 'iran_destroyed',
      nation: 'iran',
      position: { lat: 33, lng: 53 },
      status: 'destroyed',
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
    })

    const state = makeState([iranUnit], { usa: [usaSat] })
    const revealed = processSatellites(state)

    expect(revealed).not.toContain('iran_destroyed')
  })

  it('updates lastPassTick after a successful pass', () => {
    resetSatelliteState()
    const iranUnit = makeUnit({
      id: 'iran_sam',
      nation: 'iran',
      position: { lat: 33, lng: 53 },
    })

    const usaSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
    })

    const state = makeState([iranUnit], { usa: [usaSat] })
    processSatellites(state)

    expect(usaSat.lastPassTick).toBe(3600)
  })

  it('radar_sat with wider swath reveals distant units', () => {
    resetSatelliteState()
    // Unit that's ~50km perpendicular from the ground track — outside 50km optical swath
    // (half-swath = 25km) but inside 200km radar swath (half-swath = 100km)
    const iranUnit = makeUnit({
      id: 'iran_base',
      nation: 'iran',
      position: { lat: 33.7, lng: 53 }, // ~50km from the line
    })

    const usaRadarSat = makeSatellite({
      id: 'usa_radar_sat_1',
      nation: 'usa',
      type: 'radar_sat',
      swathWidth_km: 200,
      revisitInterval_sec: 7200,
      lastPassTick: 0,
      groundTrack: {
        startLat: 30, startLng: 50,
        endLat: 36, endLng: 56,
      },
    })

    // Optical with narrow swath — should NOT detect (25km half-swath < 50km distance)
    const usaOpticalSat = makeSatellite({
      id: 'usa_optical_1',
      nation: 'usa',
      type: 'optical',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
      groundTrack: {
        startLat: 30, startLng: 50,
        endLat: 36, endLng: 56,
      },
    })

    // tick=7200 so both sats' revisit intervals are satisfied
    const state = makeState([iranUnit], { usa: [usaRadarSat, usaOpticalSat] })
    state.time.tick = 7200

    const revealed = processSatellites(state)

    // Radar sat (200km swath = 100km half) should detect at ~50km distance
    expect(revealed).toContain('iran_base')
    // Optical (50km swath = 25km half) should NOT detect at ~50km distance
    // (iran_base would appear twice if optical also detected it)
    const count = revealed.filter(id => id === 'iran_base').length
    expect(count).toBe(1)
  })
})
