import { describe, it, expect } from 'vitest'
import { GameEngine } from '../game-engine'
import { ElevationGrid } from '../systems/elevation'
import { SeededRNG } from '../utils/rng'
import { haversine } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { Nation, NationId, Unit, UnitId } from '@/types/game'

// ════════════════════════════════════════════════════════════════
//  Scale stress guard (roadmap v4, Wave A.6)
//
//  Answers "do we need a faster engine" with numbers: ~500 units
//  (realistic loadouts, both nations at war), ~60 missiles launched
//  at t=0, driven twice — without an elevation grid, then with a
//  synthetic flat grid so the LOS sampling cost is visible.
//
//  Measured 2026-06-11 (dev box, vitest/jsdom, 100 ticks per run):
//    no grid    avg 176 ms  p50 176 ms  p95 216 ms  max 244 ms
//    flat grid  avg 193 ms  p50 196 ms  p95 249 ms  max 284 ms
//    (+9% avg with grid: LOS sampling is NOT the hot path)
//  Cost driver: the missile population explodes from 57 seeded
//  launches to ~2100 live missiles (SAM interceptor swarms), and
//  detection/visibility scale with units x missiles. A 600-tick run
//  averaged 81 ms/tick — late ticks get cheap once ammo runs dry —
//  so the short run deliberately measures the saturation phase.
//
//  The roadmap assumed ~12 ms ticks and 600 ticks per run; at the
//  measured ~176 ms/tick two 600-tick runs would take ~3.5 min, so
//  the guard runs 100 ticks per run to stay inside the <60 s suite
//  budget — still deep into the interceptor-swarm phase.
//
//  Budgets are ~3x the dev-box measurement so CI noise never flakes
//  this; they exist to catch order-of-magnitude regressions, not to
//  benchmark.
// ════════════════════════════════════════════════════════════════

const TICKS = 100
const BUDGET_AVG_MS = 500
const BUDGET_P95_MS = 650

// ── Scenario construction ───────────────────────────────────────

function makeNation(id: NationId, name: string, atWarWith: NationId): Nation {
  return {
    id,
    name,
    economy: { gdp_billions: 1000, military_budget_billions: 100, military_budget_pct_gdp: 3, oil_revenue_billions: 50, sanctions_impact: 0, war_cost_per_day_millions: 100, reserves_billions: 100 },
    relations: { usa: 0, iran: 0 },
    atWar: [atWarWith],
  }
}

type UnitSeed = Partial<Unit> & { id: string; nation: NationId; category: Unit['category']; position: Unit['position'] }

function makeUnit(overrides: UnitSeed): Unit {
  return {
    name: overrides.id,
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

interface Box { latMin: number; latMax: number; lngMin: number; lngMax: number }

const US_LAND: Box = { latMin: 23.8, latMax: 26.6, lngMin: 46.8, lngMax: 56.5 } // Arabian peninsula coast
const US_WATER: Box = { latMin: 24.2, latMax: 27.2, lngMin: 50.2, lngMax: 56.8 } // central/southern Gulf
const IRAN_LAND: Box = { latMin: 27.4, latMax: 34.5, lngMin: 47.6, lngMax: 57.5 }
const IRAN_WATER: Box = { latMin: 26.3, latMax: 27.2, lngMin: 51.0, lngMax: 56.8 } // northern Gulf waters

function scatter(rng: SeededRNG, box: Box) {
  return {
    lat: box.latMin + rng.next() * (box.latMax - box.latMin),
    lng: box.lngMin + rng.next() * (box.lngMax - box.lngMin),
  }
}

/**
 * ~500 units split USA/Iran with realistic loadouts mirroring the shipped
 * orbats (real weapon ids, sector-limited SAM radars, datalink hubs),
 * positions spread over the Gulf bbox. Fully deterministic (seeded placement).
 */
function buildStressScenario(): { nations: Record<string, Nation>; units: Unit[] } {
  const rng = new SeededRNG(1234)
  const units: Unit[] = []
  const series = (count: number, build: (i: number) => UnitSeed) => {
    for (let i = 0; i < count; i++) units.push(makeUnit(build(i)))
  }

  // ── USA (250) ──
  series(10, i => ({
    id: `us_ab_${i}`, nation: 'usa', category: 'airbase', position: scatter(rng, US_LAND),
    hardness: 200, logistics: 80,
    weapons: [{ weaponId: 'jassm_er', count: 48, maxCount: 48, reloadTimeSec: 0 }],
    pointDefense: [{ specId: 'cram_centurion', active: true, ammo: 2000, maxAmmo: 2000 }],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
    datalink_range_km: 150,
  }))
  series(2, i => ({
    id: `us_nb_${i}`, nation: 'usa', category: 'naval_base', position: scatter(rng, US_LAND),
    hardness: 200, logistics: 80,
    pointDefense: [{ specId: 'cram_centurion', active: true, ammo: 2000, maxAmmo: 2000 }],
    sensors: [{ type: 'radar', range_km: 250, detection_prob: 0.9, antenna_height_m: 20 }],
    datalink_range_km: 150,
  }))
  series(2, i => ({
    id: `us_cvn_${i}`, nation: 'usa', category: 'carrier_group',
    position: i === 0 ? { lat: 23.8, lng: 58.8 } : { lat: 26.4, lng: 52.6 },
    heading: rng.int(0, 359), speed_kts: 18, maxSpeed_kts: 30, hardness: 250,
    weapons: [
      { weaponId: 'tomahawk', count: 60, maxCount: 60, reloadTimeSec: 0 },
      { weaponId: 'sm6', count: 120, maxCount: 120, reloadTimeSec: 0 },
      { weaponId: 'sm3_iia', count: 24, maxCount: 24, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 16, maxCount: 16, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
      { specId: 'rim116_ram', active: true, ammo: 21, maxAmmo: 21 },
    ],
    sensors: [
      { type: 'radar', range_km: 500, detection_prob: 0.98, antenna_height_m: 50 },
      { type: 'sonar', range_km: 50, detection_prob: 0.7 },
    ],
    datalink_range_km: 300,
  }))
  series(80, i => {
    const pos = scatter(rng, US_WATER)
    const moving = i % 2 === 0
    return {
      id: `us_ddg_${i}`, nation: 'usa', category: 'ship', position: pos,
      heading: rng.int(0, 359), speed_kts: 12, maxSpeed_kts: 30, hardness: 150,
      status: moving ? 'moving' as const : 'ready' as const,
      waypoints: moving ? [scatter(rng, US_WATER), scatter(rng, US_WATER)] : [],
      weapons: [
        { weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 },
        { weaponId: 'sm6', count: 52, maxCount: 52, reloadTimeSec: 0 },
        { weaponId: 'sm2_iiia', count: 24, maxCount: 24, reloadTimeSec: 0 },
        { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
      ],
      pointDefense: [
        { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
        { specId: 'rim116_ram', active: true, ammo: 21, maxAmmo: 21 },
      ],
      sensors: [{ type: 'radar' as const, range_km: 500, detection_prob: 0.96, antenna_height_m: 30 }],
      datalink_range_km: 300,
    }
  })
  series(24, i => ({
    id: `us_ffg_${i}`, nation: 'usa', category: 'ship', position: scatter(rng, US_WATER),
    heading: rng.int(0, 359), speed_kts: 10, maxSpeed_kts: 28, hardness: 130,
    weapons: [
      { weaponId: 'sm2_iiia', count: 24, maxCount: 24, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
    ],
    pointDefense: [{ specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 }],
    sensors: [{ type: 'radar', range_km: 350, detection_prob: 0.92, antenna_height_m: 25 }],
  }))
  series(40, i => ({
    id: `us_pc_${i}`, nation: 'usa', category: 'ship', position: scatter(rng, US_WATER),
    heading: rng.int(0, 359), speed_kts: 14, maxSpeed_kts: 35, hardness: 80,
    weapons: [{ weaponId: 'harpoon', count: 4, maxCount: 4, reloadTimeSec: 0 }],
    sensors: [{ type: 'radar', range_km: 120, detection_prob: 0.85, antenna_height_m: 12 }],
  }))
  series(16, i => ({
    id: `us_ssn_${i}`, nation: 'usa', category: 'submarine', position: scatter(rng, US_WATER),
    heading: rng.int(0, 359), speed_kts: 5, maxSpeed_kts: 25, hardness: 120,
    weapons: [
      { weaponId: 'tomahawk', count: 12, maxCount: 12, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 4, maxCount: 4, reloadTimeSec: 0 },
    ],
    sensors: [{ type: 'sonar', range_km: 80, detection_prob: 0.85 }],
  }))
  series(60, i => ({
    id: `us_pat_${i}`, nation: 'usa', category: 'sam_site', position: scatter(rng, US_LAND),
    heading: rng.int(0, 359), maxSpeed_kts: 25,
    weapons: [{ weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 }],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
    roe: 'weapons_free' as const,
    readiness: 'deployed' as const, deploy_time_sec: 1800, pack_time_sec: 900,
  }))
  series(8, i => ({
    id: `us_thaad_${i}`, nation: 'usa', category: 'sam_site', position: scatter(rng, US_LAND),
    heading: rng.int(0, 359), maxSpeed_kts: 25,
    weapons: [{ weaponId: 'thaad_int', count: 48, maxCount: 48, reloadTimeSec: 900 }],
    sensors: [{ type: 'radar', range_km: 1000, detection_prob: 0.98, antenna_height_m: 10, sector_deg: 120 }],
    roe: 'weapons_free' as const,
    readiness: 'deployed' as const, deploy_time_sec: 1200, pack_time_sec: 600,
  }))
  series(8, i => ({
    id: `us_awacs_${i}`, nation: 'usa', category: 'aircraft', position: scatter(rng, US_WATER),
    heading: rng.int(0, 359), speed_kts: 300, maxSpeed_kts: 350, hardness: 30,
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 10000, sector_deg: 360 }],
    roe: 'weapons_free' as const,
    datalink_range_km: 600,
  }))

  // ── Iran (250) ──
  series(8, i => ({
    id: `ir_ab_${i}`, nation: 'iran', category: 'airbase', position: scatter(rng, IRAN_LAND),
    hardness: 200, logistics: 60,
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85, antenna_height_m: 20 }],
    datalink_range_km: 150,
  }))
  series(2, i => ({
    id: `ir_nb_${i}`, nation: 'iran', category: 'naval_base', position: scatter(rng, IRAN_LAND),
    hardness: 200, logistics: 60,
    sensors: [{ type: 'radar', range_km: 200, detection_prob: 0.8, antenna_height_m: 15 }],
    datalink_range_km: 150,
  }))
  const samSite = (id: string, weaponId: string, count: number, radarKm: number, sector: number | undefined): UnitSeed => ({
    id, nation: 'iran', category: 'sam_site', position: scatter(rng, IRAN_LAND),
    heading: rng.int(0, 359), maxSpeed_kts: 25,
    weapons: [{ weaponId, count, maxCount: count, reloadTimeSec: 600 }],
    sensors: [{ type: 'radar', range_km: radarKm, detection_prob: 0.9, antenna_height_m: 12, ...(sector ? { sector_deg: sector } : {}) }],
    roe: 'weapons_free' as const,
    readiness: 'deployed' as const, deploy_time_sec: 300, pack_time_sec: 300,
  })
  series(16, i => samSite(`ir_s300_${i}`, 's300_48n6e2', 32, 300, 90))
  series(10, i => samSite(`ir_bavar_${i}`, 'bavar373_int', 24, 350, 90))
  series(16, i => samSite(`ir_khordad_${i}`, 'khordad15_int', 12, 150, 90))
  series(20, i => samSite(`ir_tor_${i}`, 'tor_m1_int', 8, 25, undefined))
  const tel = (id: string, weaponId: string, count: number): UnitSeed => ({
    id, nation: 'iran', category: 'missile_battery', position: scatter(rng, IRAN_LAND),
    heading: rng.int(0, 359), maxSpeed_kts: 40, hardness: 80,
    weapons: [{ weaponId, count, maxCount: count, reloadTimeSec: 3600 }],
    readiness: 'deployed' as const, deploy_time_sec: 600, pack_time_sec: 300,
  })
  series(16, i => tel(`ir_shahab_${i}`, 'shahab3', 6))
  series(8, i => tel(`ir_sejjil_${i}`, 'sejjil2', 4))
  series(20, i => tel(`ir_zolf_${i}`, 'zolfaghar', 8))
  series(30, i => tel(`ir_fateh_${i}`, 'fateh110', 12))
  series(20, i => ({
    id: `ir_coastal_${i}`, nation: 'iran', category: 'missile_battery',
    position: { lat: 26.6 + rng.next() * 1.2, lng: 50.8 + rng.next() * 6.0 }, // coastal strip
    heading: 180, hardness: 100,
    weapons: [
      { weaponId: 'noor', count: 12, maxCount: 12, reloadTimeSec: 1200 },
      { weaponId: 'khalij_fars', count: 4, maxCount: 4, reloadTimeSec: 2400 },
    ],
    sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.8, antenna_height_m: 10 }],
  }))
  series(16, i => ({
    id: `ir_shahed_${i}`, nation: 'iran', category: 'missile_battery', position: scatter(rng, IRAN_LAND),
    heading: rng.int(0, 359), maxSpeed_kts: 40, hardness: 60,
    weapons: [{ weaponId: 'shahed_136', count: 50, maxCount: 50, reloadTimeSec: 0 }],
    readiness: 'deployed' as const, deploy_time_sec: 600, pack_time_sec: 300,
  }))
  series(50, i => {
    const moving = i % 2 === 0
    return {
      id: `ir_fac_${i}`, nation: 'iran', category: 'ship', position: scatter(rng, IRAN_WATER),
      heading: rng.int(0, 359), speed_kts: 8, maxSpeed_kts: 45, hardness: 60,
      status: moving ? 'moving' as const : 'ready' as const,
      waypoints: moving ? [scatter(rng, IRAN_WATER)] : [],
      weapons: [{ weaponId: 'noor', count: 4, maxCount: 4, reloadTimeSec: 0 }],
      sensors: [{ type: 'radar' as const, range_km: 40, detection_prob: 0.7, antenna_height_m: 8 }],
    }
  })
  series(14, i => ({
    id: `ir_sub_${i}`, nation: 'iran', category: 'submarine', position: scatter(rng, IRAN_WATER),
    heading: rng.int(0, 359), speed_kts: 3, maxSpeed_kts: 11, hardness: 80,
    sensors: [{ type: 'sonar', range_km: 15, detection_prob: 0.6 }],
  }))
  series(4, i => ({
    id: `ir_ew_${i}`, nation: 'iran', category: 'sam_site', position: scatter(rng, IRAN_LAND),
    heading: rng.int(0, 359), hardness: 80,
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.9, antenna_height_m: 30, sector_deg: 360 }],
    roe: 'weapons_free' as const,
    datalink_range_km: 300,
  }))

  const nations = {
    usa: makeNation('usa', 'USA', 'iran'),
    iran: makeNation('iran', 'Iran', 'usa'),
  }
  return { nations, units }
}

/**
 * Flat sea-level grid over the real theater bbox (lat 12-43, lng 32-70 at
 * 0.05 deg = 620x760 cells). Float32Array zero-fill IS the flat grid — the
 * run measures LOS/terrain sampling cost, not terrain shape. Sea level (not
 * land) so moving ships never trigger per-tick naval re-routing, which would
 * be a pathological cost no real scenario has.
 */
function makeFlatGrid(): ElevationGrid {
  const latMin = 12, latMax = 43, lngMin = 32, lngMax = 70, resolution = 0.05
  const rows = Math.round((latMax - latMin) / resolution)
  const cols = Math.round((lngMax - lngMin) / resolution)
  const buffer = new ArrayBuffer(20 + rows * cols * 4)
  const header = new Float32Array(buffer, 0, 5)
  header[0] = latMin
  header[1] = latMax
  header[2] = lngMin
  header[3] = lngMax
  header[4] = resolution
  return new ElevationGrid(buffer)
}

// ── Driving + measurement ───────────────────────────────────────

function setUpEngine(withGrid: boolean): GameEngine {
  const { nations, units } = buildStressScenario()
  const engine = new GameEngine()
  if (withGrid) engine.setElevationGrid(makeFlatGrid())
  engine.initFromData('usa', nations, units, [], {})
  launchOpeningSalvos(engine)
  return engine
}

/** ~60 missiles in flight at t=0 via the public command path, all range-verified */
function launchOpeningSalvos(engine: GameEngine): void {
  const all = [...engine.state.units.values()]
  const usTargets = all.filter(u => u.nation === 'usa' && (u.category === 'airbase' || u.category === 'sam_site' || u.category === 'naval_base'))
  const iranTargets = all.filter(u => u.nation === 'iran' && (u.category === 'sam_site' || u.category === 'airbase' || u.category === 'missile_battery'))

  const fire = (launcherId: UnitId, weaponId: string, targets: Unit[], cursor: number): boolean => {
    const launcher = engine.state.units.get(launcherId)!
    const range = weaponSpecs[weaponId].range_km
    for (let i = 0; i < targets.length; i++) {
      const target = targets[(cursor + i) % targets.length]
      if (haversine(launcher.position, target.position) <= range) {
        engine.executeCommand({ type: 'LAUNCH_MISSILE', launcherId, weaponId, targetId: target.id })
        return true
      }
    }
    return false
  }

  // 30 Tomahawks from DDGs at Iranian air defense / TELs
  for (let i = 0; i < 30; i++) fire(`us_ddg_${i}`, 'tomahawk', iranTargets, i * 7)
  // 30 Iranian ballistic rounds at US bases and Patriot sites
  for (let i = 0; i < 16; i++) fire(`ir_shahab_${i}`, 'shahab3', usTargets, i * 5)
  for (let i = 0; i < 8; i++) fire(`ir_sejjil_${i}`, 'sejjil2', usTargets, i * 11)
  for (let i = 0; i < 6; i++) fire(`ir_zolf_${i}`, 'zolfaghar', usTargets, i * 3)
}

interface TickStats { avg: number; p50: number; p95: number; max: number; total: number }

function measure(engine: GameEngine, ticks: number): { stats: TickStats; errors: string[] } {
  const samples = new Float64Array(ticks)
  const errors: string[] = []
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now()
    try {
      engine.tick()
    } catch (e) {
      if (errors.length < 5) errors.push(`tick ${i + 1}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
    }
    samples[i] = performance.now() - t0
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const total = sorted.reduce((s, v) => s + v, 0)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    stats: { avg: total / ticks, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1], total },
    errors,
  }
}

function row(label: string, s: TickStats): string {
  const ms = (v: number) => `${v.toFixed(2)} ms`.padStart(12)
  return `  ${label.padEnd(12)}${ms(s.avg)}${ms(s.p50)}${ms(s.p95)}${ms(s.max)}${`${s.total.toFixed(0)} ms`.padStart(12)}`
}

// ── Test ────────────────────────────────────────────────────────

describe('scale stress', () => {
  it(`500 units + 60 missiles stay inside tick budget over ${TICKS} ticks (with and without elevation grid)`, () => {
    // Unmeasured warmup so JIT compilation doesn't bias run 1 vs run 2
    const warmup = setUpEngine(false)
    for (let i = 0; i < 15; i++) warmup.tick()

    const noGrid = setUpEngine(false)
    const unitCount = noGrid.state.units.size
    const missilesInFlight = noGrid.state.missiles.size
    const noGridRun = measure(noGrid, TICKS)

    const withGrid = setUpEngine(true)
    const gridRun = measure(withGrid, TICKS)

    const losOverheadPct = ((gridRun.stats.avg / noGridRun.stats.avg) - 1) * 100
    const inRunEvents = noGrid.state.events.filter(e => e.tick > 0).length
    console.log([
      `SCALE STRESS — ${unitCount} units, ${missilesInFlight} missiles in flight at t=0, ${TICKS} ticks per run`,
      `  ${'run'.padEnd(12)}${'avg'.padStart(12)}${'p50'.padStart(12)}${'p95'.padStart(12)}${'max'.padStart(12)}${'total'.padStart(12)}`,
      row('no grid', noGridRun.stats),
      row('flat grid', gridRun.stats),
      `  LOS overhead (flat grid vs none): ${losOverheadPct >= 0 ? '+' : ''}${losOverheadPct.toFixed(0)}% avg`,
      `  end of no-grid run: ${noGrid.state.missiles.size} missiles live, ${inRunEvents} in-run events`,
      `  budgets: avg < ${BUDGET_AVG_MS} ms, p95 < ${BUDGET_P95_MS} ms (~3x dev-box measurement, see header)`,
    ].join('\n'))

    // Scenario actually has the advertised scale
    expect(unitCount).toBe(500)
    expect(missilesInFlight).toBeGreaterThanOrEqual(55)

    // Zero thrown errors across both runs
    expect(noGridRun.errors).toEqual([])
    expect(gridRun.errors).toEqual([])

    // The sim actually ran: ticks advanced and events kept flowing DURING the run
    expect(noGrid.state.time.tick).toBe(TICKS)
    expect(withGrid.state.time.tick).toBe(TICKS)
    expect(noGrid.state.events.some(e => e.type === 'MISSILE_LAUNCHED')).toBe(true)
    expect(inRunEvents).toBeGreaterThan(0)
    expect(withGrid.state.events.some(e => e.tick > 0)).toBe(true)

    // Perf guard, not a benchmark: generous CI-safe ceilings on BOTH runs
    expect(noGridRun.stats.avg).toBeLessThan(BUDGET_AVG_MS)
    expect(noGridRun.stats.p95).toBeLessThan(BUDGET_P95_MS)
    expect(gridRun.stats.avg).toBeLessThan(BUDGET_AVG_MS)
    expect(gridRun.stats.p95).toBeLessThan(BUDGET_P95_MS)
    // ~30 s on the dev box; 90 s timeout absorbs slower CI runners
  }, 90_000)
})
