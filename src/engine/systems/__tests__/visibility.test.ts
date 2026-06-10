import { describe, it, expect, beforeEach } from 'vitest'
import { processVisibility, resetVisibilityState, getViewVisibility } from '../visibility'
import { processSatellites, resetSatelliteState } from '../satellites'
import { ElevationGrid } from '../elevation'
import type { EspionageResult } from '../espionage'
import type { GameState, NationId, SatellitePass, Sensor, Unit, UnitId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
    position: { lat: 27, lng: 52 },
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
    roe: 'weapons_tight' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function radar(range_km: number, antenna_height_m = 15): Sensor {
  return { type: 'radar', range_km, detection_prob: 0.9, antenna_height_m }
}

function makeState(units: Unit[], tick = 60): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

function runEval(state: GameState, tick: number, espionage: EspionageResult | null = null, grid: ElevationGrid | null = null): void {
  state.time.tick = tick
  processVisibility(state, null, espionage, grid)
}

function contact(state: GameState, observer: string, unitId: UnitId) {
  return state.visibility?.[observer]?.[unitId]
}

function espionageWith(opts: { humint?: Record<string, UnitId[]>; sigint?: Record<string, number> }): EspionageResult {
  return {
    humintRevealed: new Map(Object.entries(opts.humint ?? {})),
    sigintMultiplier: new Map(Object.entries(opts.sigint ?? {})),
  }
}

/** Build a minimal ElevationGrid (same binary format as elevation.test.ts) */
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
    for (let c = 0; c < cols; c++) {
      data[r * cols + c] = elevations[r][c]
    }
  }
  return new ElevationGrid(buffer)
}

beforeEach(() => {
  resetVisibilityState()
  resetSatelliteState()
})

// At lat 27, 1 degree of longitude ≈ 99 km

// ── Tests ───────────────────────────────────────────────────────

describe('radar acquisition', () => {
  it('tracks enemy units in radar range, identifies within 60% of range', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irFar = makeUnit({ id: 'ir_far', nation: 'iran', position: { lat: 27, lng: 52.7 } })   // ~69 km
    const irNear = makeUnit({ id: 'ir_near', nation: 'iran', position: { lat: 27, lng: 52.2 } }) // ~20 km
    const irOut = makeUnit({ id: 'ir_out', nation: 'iran', position: { lat: 27, lng: 54 } })     // ~198 km
    const state = makeState([usRadar, irFar, irNear, irOut])

    runEval(state, 60)

    expect(contact(state, 'usa', 'ir_far')?.level).toBe('tracked')
    expect(contact(state, 'usa', 'ir_near')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_out')).toBeUndefined()
    expect(getViewVisibility(state, 'usa', irOut)).toBeNull()
  })

  it('only evaluates sources on game-minute ticks', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.5 } })
    const state = makeState([usRadar, irShip])

    runEval(state, 61)
    expect(contact(state, 'usa', 'ir_ship')).toBeUndefined()

    runEval(state, 120)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('identified')
  })

  it('builds pictures for both nations', () => {
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa', sensors: [radar(100)] })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.7 }, sensors: [radar(100)] })
    const state = makeState([usShip, irShip])

    runEval(state, 60)

    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('tracked')
    expect(contact(state, 'iran', 'us_ship')?.level).toBe('tracked')
    expect(contact(state, 'usa', 'us_ship')).toBeUndefined()
    expect(contact(state, 'iran', 'ir_ship')).toBeUndefined()
  })

  it('terrain blocks line of sight', () => {
    // 3000 m ridge at lng 52.4-52.6, flat elsewhere
    const elevations = Array.from({ length: 20 }, () =>
      Array.from({ length: 30 }, (_, c) => (c >= 14 && c <= 16 ? 3000 : 0)),
    )
    const grid = makeGrid(26, 28, 51, 54, 0.1, elevations)

    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irBlocked = makeUnit({ id: 'ir_blocked', nation: 'iran', position: { lat: 27, lng: 53 } })
    const irControl = makeUnit({ id: 'ir_control', nation: 'iran', position: { lat: 27, lng: 52.3 } })
    const state = makeState([usRadar, irBlocked, irControl])

    runEval(state, 60, null, grid)

    expect(contact(state, 'usa', 'ir_blocked')).toBeUndefined()
    expect(contact(state, 'usa', 'ir_control')?.level).toBe('identified')
  })
})

describe('decay', () => {
  it('decays tracked → detected → unseen with frozen last-known position', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.7 } })
    const state = makeState([usRadar, irShip])

    runEval(state, 60)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('tracked')
    expect(getViewVisibility(state, 'usa', irShip)?.stale).toBe(false)

    // Track lost: ship sails out of radar range
    irShip.position = { lat: 27, lng: 60 }

    runEval(state, 660) // 10 game-min after last seen
    const c = contact(state, 'usa', 'ir_ship')
    expect(c?.level).toBe('detected')
    expect(c?.lastKnownPosition.lng).toBe(52.7)
    const view = getViewVisibility(state, 'usa', irShip)
    expect(view?.stale).toBe(true)
    expect(view?.position.lng).toBe(52.7)

    runEval(state, 2400) // still inside the 30-min detected window
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('detected')

    runEval(state, 2460) // 40 game-min after last seen
    expect(contact(state, 'usa', 'ir_ship')).toBeUndefined()
    expect(getViewVisibility(state, 'usa', irShip)).toBeNull()
  })

  it('keeps a refreshed track alive without decay', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.7 } })
    const state = makeState([usRadar, irShip])

    runEval(state, 60)
    runEval(state, 1200)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('tracked')
    expect(contact(state, 'usa', 'ir_ship')?.lastSeenTick).toBe(1200)
  })

  it('airbase stays identified forever once identified', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irBase = makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27, lng: 52.2 } })
    const state = makeState([usRadar, irBase])

    runEval(state, 60)
    expect(contact(state, 'usa', 'ir_base')?.level).toBe('identified')

    usRadar.position = { lat: 10, lng: 40 }
    runEval(state, 60_000)
    const c = contact(state, 'usa', 'ir_base')
    expect(c?.level).toBe('identified')
    expect(c?.pinned).toBe(true)
  })

  it('stationary sam_site pins at detected, moved sam_site decays to unseen', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irSam = makeUnit({ id: 'ir_sam', nation: 'iran', category: 'sam_site', position: { lat: 27, lng: 52.7 } })
    const state = makeState([usRadar, irSam])

    runEval(state, 60)
    expect(contact(state, 'usa', 'ir_sam')?.level).toBe('tracked')

    usRadar.position = { lat: 10, lng: 40 }
    runEval(state, 3060) // long past the mobile unseen threshold
    const c = contact(state, 'usa', 'ir_sam')
    expect(c?.level).toBe('detected')
    expect(c?.pinned).toBe(true)

    irSam.position = { lat: 27, lng: 53.5 }
    runEval(state, 3120)
    expect(contact(state, 'usa', 'ir_sam')).toBeUndefined()
  })
})

describe('satellites', () => {
  function makeSatellite(overrides: Partial<SatellitePass> & { id: string; nation: NationId }): SatellitePass {
    return {
      type: 'optical',
      swathWidth_km: 50,
      revisitInterval_sec: 3600,
      lastPassTick: 0,
      groundTrack: { startLat: 30, startLng: 50, endLat: 36, endLng: 56 },
      ...overrides,
    }
  }

  it('radar satellite pass produces a detected contact with stale position', () => {
    const irUnit = makeUnit({ id: 'ir_unit', nation: 'iran', position: { lat: 33, lng: 53 } })
    const state = makeState([irUnit], 3600)
    state.nations.usa.satellites = [makeSatellite({ id: 'usa_radar_sat', nation: 'usa', type: 'radar_sat', swathWidth_km: 200 })]

    processSatellites(state)
    processVisibility(state, null, null, null)

    expect(contact(state, 'usa', 'ir_unit')?.level).toBe('detected')
    const view = getViewVisibility(state, 'usa', irUnit)
    expect(view?.stale).toBe(true)
    expect(view?.position.lat).toBe(33)
  })

  it('optical satellite pass produces a tracked contact', () => {
    const irUnit = makeUnit({ id: 'ir_unit', nation: 'iran', position: { lat: 33, lng: 53 } })
    const state = makeState([irUnit], 3600)
    state.nations.usa.satellites = [makeSatellite({ id: 'usa_optical', nation: 'usa', type: 'optical' })]

    processSatellites(state)
    processVisibility(state, null, null, null)

    expect(contact(state, 'usa', 'ir_unit')?.level).toBe('tracked')
  })
})

describe('espionage sources', () => {
  it('HUMINT identifies a unit and stays sticky for 30 game-min before decaying', () => {
    const irHq = makeUnit({ id: 'ir_hq', nation: 'iran', category: 'missile_battery', position: { lat: 30, lng: 55 } })
    const state = makeState([irHq])

    runEval(state, 3600, espionageWith({ humint: { usa: ['ir_hq'] } }))
    expect(contact(state, 'usa', 'ir_hq')?.level).toBe('identified')

    runEval(state, 5340) // 29 min later, no new espionage — still sticky
    expect(contact(state, 'usa', 'ir_hq')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_hq')?.lastSeenTick).toBe(5340)

    runEval(state, 6000) // sticky expired at 5400, identified hold expired at 5940
    expect(contact(state, 'usa', 'ir_hq')?.level).toBe('tracked')
  })

  it('ELINT detects enemy radar emitters at range scaled by the SIGINT multiplier', () => {
    const usEw = makeUnit({ id: 'us_ew', nation: 'usa', sensors: [radar(50)] })
    const irSam = makeUnit({ id: 'ir_sam', nation: 'iran', category: 'sam_site', position: { lat: 27, lng: 53.75 }, sensors: [radar(100)] }) // ~173 km
    const state = makeState([usEw, irSam])

    runEval(state, 60, espionageWith({ sigint: { usa: 1.5, iran: 1.5 } }))
    expect(contact(state, 'usa', 'ir_sam')).toBeUndefined() // 100 × 1.5 = 150 km < 173

    runEval(state, 120, espionageWith({ sigint: { usa: 2.0, iran: 1.5 } }))
    const c = contact(state, 'usa', 'ir_sam')
    expect(c?.level).toBe('detected') // 100 × 2.0 = 200 km ≥ 173
    expect(getViewVisibility(state, 'usa', irSam)?.stale).toBe(true)
    expect(contact(state, 'iran', 'us_ew')).toBeUndefined() // 50 × 1.5 = 75 km < 173
  })

  it('non-emitting units are not ELINT-detectable', () => {
    const usEw = makeUnit({ id: 'us_ew', nation: 'usa', sensors: [radar(50)] })
    const irSilent = makeUnit({ id: 'ir_silent', nation: 'iran', position: { lat: 27, lng: 53 } })
    const state = makeState([usEw, irSilent])

    runEval(state, 60, espionageWith({ sigint: { usa: 2.0 } }))
    expect(contact(state, 'usa', 'ir_silent')).toBeUndefined()
  })
})

describe('event-driven reveals', () => {
  it('missile launch reveals the launcher at tracked on the launch tick', () => {
    const irTel = makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53 } })
    const usBase = makeUnit({ id: 'us_base', nation: 'usa', category: 'airbase' })
    const state = makeState([irTel, usBase], 61)
    state.events.push({ type: 'MISSILE_LAUNCHED', missileId: 'm_1', launcherId: 'ir_tel', targetId: 'us_base', weaponName: 'Zolfaghar', tick: 61 })

    processVisibility(state, null, null, null)

    const c = contact(state, 'usa', 'ir_tel')
    expect(c?.level).toBe('tracked')
    expect(c?.lastSeenTick).toBe(61)
    expect(contact(state, 'iran', 'ir_tel')).toBeUndefined()
  })

  it('launch plume does not downgrade a fresh identified contact', () => {
    const usRadar = makeUnit({ id: 'us_radar', nation: 'usa', sensors: [radar(100)] })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.2 } })
    const state = makeState([usRadar, irShip])

    runEval(state, 60)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('identified')

    state.time.tick = 61
    state.events.push({ type: 'MISSILE_LAUNCHED', missileId: 'm_1', launcherId: 'ir_ship', targetId: 'us_radar', weaponName: 'Noor', tick: 61 })
    processVisibility(state, null, null, null)

    const c = contact(state, 'usa', 'ir_ship')
    expect(c?.level).toBe('identified')
    expect(c?.lastSeenTick).toBe(60)
  })

  it('mine contact identifies the minefield permanently', () => {
    const irMines = makeUnit({ id: 'ir_mines', nation: 'iran', category: 'minefield', position: { lat: 26.5, lng: 56 } })
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26.5, lng: 56 } })
    const state = makeState([irMines, usShip], 61)
    state.events.push({ type: 'MINE_CONTACT', minefieldId: 'ir_mines', targetId: 'us_ship', damage: 35, tick: 61 })

    processVisibility(state, null, null, null)
    const c = contact(state, 'usa', 'ir_mines')
    expect(c?.level).toBe('identified')
    expect(c?.pinned).toBe(true)

    runEval(state, 60_000)
    expect(contact(state, 'usa', 'ir_mines')?.level).toBe('identified')
  })
})

describe('getViewVisibility', () => {
  it('excludes enemy units with no contact entry (fog-on)', () => {
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa' })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 28, lng: 55 } })
    const state = makeState([usShip, irShip])

    expect(getViewVisibility(state, 'usa', irShip)).toBeNull()
  })

  it('always reports own units identified with live position', () => {
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa' })
    const state = makeState([usShip])

    const view = getViewVisibility(state, 'usa', usShip)
    expect(view).toEqual({ level: 'identified', stale: false, position: usShip.position })
  })
})
