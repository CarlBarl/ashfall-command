import { describe, it, expect, beforeEach } from 'vitest'
import {
  processIntel,
  initIntelState,
  resetIntelState,
  taskSatellitePass,
  taskAgent,
  restAgent,
  exfiltrateAgent,
  opsecSweep,
  maybeLeakStrike,
  paranoiaBand,
} from '../intel'
import { processVisibility, resetVisibilityState, revealContact, radarSeesUnit } from '../visibility'
import { detectThreats } from '../detection'
import { processWarSupport, resetWarSupportState, getWarSupport } from '../war-support'
import { resetAIState } from '../ai'
import { resetSatelliteState } from '../satellites'
import { GameEngine } from '../../game-engine'
import { SeededRNG } from '../../utils/rng'
import { haversine } from '../../utils/geo'
import type { EspionageResult } from '../espionage'
import type { GameEvent, GameState, Missile, Nation, NationId, Position, Sensor, Unit, UnitId } from '@/types/game'

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

function radar(range_km: number, antenna_height_m = 2000): Sensor {
  return { type: 'radar', range_km, detection_prob: 0.9, antenna_height_m }
}

function makeState(units: Unit[], opts: { atWar?: boolean; tick?: number } = {}): GameState {
  const atWar = opts.atWar ?? true
  const state: GameState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: opts.tick ?? 0, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 300, reserves_billions: 800, oilPrice_per_barrel: 80 },
        relations: { usa: 100, iran: -60 }, atWar: atWar ? ['iran'] : [],
        // sigint_pct 50 → intercept interval exactly 20 game-min (1200 ticks)
        intelBudget: { total_pct: 10, humint_pct: 25, sigint_pct: 50, satellite_pct: 25 },
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 50, reserves_billions: 120, oilPrice_per_barrel: 80 },
        relations: { usa: -60, iran: 100 }, atWar: atWar ? ['usa'] : [],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
  initIntelState(state)
  return state
}

/** Silence the always-on collectors so a test only exercises the system under test */
function isolateIntel(state: GameState, opts: { sigint?: boolean; triton?: boolean; decoys?: boolean } = {}): void {
  const intel = state.intel!
  if (!opts.sigint) intel.assets.rc135.status = 'lost'
  if (!opts.triton) intel.assets.mq4c.status = 'lost'
  if (!opts.decoys) intel.decoysSpawned = true
}

function runIntel(state: GameState, rng: SeededRNG, tick: number): void {
  state.time.tick = tick
  processIntel(state, rng, null)
}

function eventsOf<T extends GameEvent['type']>(state: GameState, type: T): Extract<GameEvent, { type: T }>[] {
  return state.events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
}

function contact(state: GameState, observer: string, unitId: UnitId) {
  return state.visibility?.[observer]?.[unitId]
}

const TARGET: Position = { lat: 27, lng: 52 }

beforeEach(() => {
  resetIntelState()
  resetVisibilityState()
  resetWarSupportState()
  resetAIState()
  resetSatelliteState()
})

// At lat 27, 1 degree of longitude ≈ 99 km

// ── Satellite tasking (design §1.2) ─────────────────────────────

describe('satellite tasking', () => {
  it('queues one tasking per asset and re-tasking replaces it', () => {
    const state = makeState([])
    taskSatellitePass(state, 'kh11', { lat: 27, lng: 52 })
    taskSatellitePass(state, 'kh11', { lat: 29, lng: 54 })
    taskSatellitePass(state, 'commercial', { lat: 26, lng: 55 })

    const taskings = state.intel!.taskings
    expect(taskings).toHaveLength(2)
    const kh11 = taskings.filter(t => t.assetId === 'kh11')
    expect(kh11).toHaveLength(1)
    expect(kh11[0].target).toEqual({ lat: 29, lng: 54 })
  })

  it('rejects non-imaging and unknown assets', () => {
    const state = makeState([])
    taskSatellitePass(state, 'rc135', TARGET)
    taskSatellitePass(state, 'nope', TARGET)
    expect(state.intel!.taskings).toHaveLength(0)
  })

  it('resolves at the asset pass window, not before', () => {
    const state = makeState([makeUnit({ id: 'ir_ship', nation: 'iran' })])
    isolateIntel(state)
    const rng = new SeededRNG(1)
    taskSatellitePass(state, 'kh11', TARGET, 10) // kh11 revisit 240 min = 14400 ticks

    runIntel(state, rng, 60)
    runIntel(state, rng, 14340)
    expect(eventsOf(state, 'SATELLITE_PASS_COMPLETE')).toHaveLength(0)
    expect(state.intel!.taskings).toHaveLength(1)

    runIntel(state, rng, 14400)
    expect(eventsOf(state, 'SATELLITE_PASS_COMPLETE')).toHaveLength(1)
    expect(state.intel!.taskings).toHaveLength(0)
  })

  it('refreshes the 60 km swath: fixed sites and tracked contacts → identified, new → tracked', () => {
    const airbase = makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27, lng: 52.3 } })   // ~30 km
    const trackedShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.2 } })                     // ~20 km
    const newTel = makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 27, lng: 52.4 } }) // ~40 km
    const farShip = makeUnit({ id: 'ir_far', nation: 'iran', position: { lat: 27, lng: 53 } })                            // ~99 km
    const state = makeState([airbase, trackedShip, newTel, farShip])
    isolateIntel(state)
    revealContact(state, 'usa', trackedShip, 'tracked')

    state.intel!.assets.kh11.lastCollectionTick = -14400
    taskSatellitePass(state, 'kh11', TARGET, 10)
    const rng = new SeededRNG(1)
    runIntel(state, rng, 60)

    expect(contact(state, 'usa', 'ir_base')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_tel')?.level).toBe('tracked')
    expect(contact(state, 'usa', 'ir_far')).toBeUndefined()

    const done = eventsOf(state, 'SATELLITE_PASS_COMPLETE')
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ assetId: 'kh11', found: 3, revealedDecoys: 0 })

    const product = state.intel!.products[0]
    expect(product).toMatchObject({ kind: 'imint', assetId: 'kh11', niirs: 8, classification: 'TOP SECRET//TK//NOFORN' })
    expect(product.target).toEqual(TARGET)
    expect(product.caption).toContain('probable TEL group')

    expect(state.intel!.paranoia).toBe(14) // 10 + 4 for a kh11 pass
  })

  it('cloud >= 70 fails the pass with no product and a half-revisit retry', () => {
    const state = makeState([makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.2 } })])
    isolateIntel(state)
    state.intel!.assets.kh11.lastCollectionTick = -14400
    taskSatellitePass(state, 'kh11', TARGET, 70)
    const rng = new SeededRNG(1)
    runIntel(state, rng, 60)

    const failed = eventsOf(state, 'SATELLITE_PASS_FAILED')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ assetId: 'kh11', cloudPct: 70 })
    expect(eventsOf(state, 'SATELLITE_PASS_COMPLETE')).toHaveLength(0)
    expect(state.intel!.products).toHaveLength(0)
    expect(contact(state, 'usa', 'ir_ship')).toBeUndefined()
    expect(state.intel!.assets.kh11.lastCollectionTick).toBe(60 - 7200) // clock set back by half the revisit
    expect(state.intel!.taskings).toHaveLength(0)

    // Retry resolves a half-revisit later instead of a full one
    taskSatellitePass(state, 'kh11', TARGET, 5)
    runIntel(state, rng, 7200)
    expect(eventsOf(state, 'SATELLITE_PASS_COMPLETE')).toHaveLength(0)
    runIntel(state, rng, 7260)
    expect(eventsOf(state, 'SATELLITE_PASS_COMPLETE')).toHaveLength(1)
  })

  it('kh11 (NIIRS 8) reveals decoys in the swath; commercial (NIIRS 5) does not', () => {
    const build = () => [
      makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 27, lng: 52 } }),
      makeUnit({ id: 'ir_decoy', nation: 'iran', category: 'missile_battery', position: { lat: 27, lng: 52.1 }, isDecoy: true }),
    ]

    const khState = makeState(build())
    isolateIntel(khState)
    khState.intel!.assets.kh11.lastCollectionTick = -14400
    taskSatellitePass(khState, 'kh11', TARGET, 10)
    runIntel(khState, new SeededRNG(1), 60)

    expect(khState.units.get('ir_decoy')!.decoyRevealed).toBe(true)
    expect(eventsOf(khState, 'DECOY_REVEALED')).toHaveLength(1)
    expect(eventsOf(khState, 'SATELLITE_PASS_COMPLETE')[0].revealedDecoys).toBe(1)
    expect(khState.intel!.products[0].caption).toContain('assessed DECOY')

    const comState = makeState(build())
    isolateIntel(comState)
    comState.intel!.assets.commercial.lastCollectionTick = -5400
    taskSatellitePass(comState, 'commercial', TARGET, 10)
    runIntel(comState, new SeededRNG(1), 60)

    expect(comState.units.get('ir_decoy')!.decoyRevealed).toBeFalsy()
    expect(eventsOf(comState, 'DECOY_REVEALED')).toHaveLength(0)
    expect(eventsOf(comState, 'SATELLITE_PASS_COMPLETE')[0].revealedDecoys).toBe(0)
    // The decoy still shows up as a normal contact — indistinguishable at this quality
    expect(contact(comState, 'usa', 'ir_decoy')?.level).toBe('tracked')
    expect(comState.intel!.products[0].classification).toBe('UNCLASSIFIED//COMMERCIAL')
  })
})

// ── SIGINT (design §1.3) ────────────────────────────────────────

describe('SIGINT intercepts', () => {
  it('rc135 produces intercepts on cadence and each raises paranoia by 2', () => {
    const state = makeState([])
    isolateIntel(state, { sigint: true })
    const rng = new SeededRNG(7)

    runIntel(state, rng, 60)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(1)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')[0].precedence).toBe('ROUTINE')
    expect(state.intel!.paranoia).toBe(12)
    expect(state.intel!.products[0]).toMatchObject({ kind: 'sigint', classification: 'TOP SECRET//SI' })

    runIntel(state, rng, 120)
    runIntel(state, rng, 1200) // 1140 ticks since last — interval is 1200 at sigint_pct 50
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(1)

    runIntel(state, rng, 1260)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(2)
    expect(state.intel!.paranoia).toBe(14)
  })

  it('produces no intercepts when rc135 is lost', () => {
    const state = makeState([])
    isolateIntel(state)
    runIntel(state, new SeededRNG(7), 60)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(0)
  })

  it('reveals a hidden emitter at detected with an IMMEDIATE intercept', () => {
    const tel = makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53.2 } })
    const state = makeState([tel])
    isolateIntel(state, { sigint: true })
    runIntel(state, new SeededRNG(7), 60)

    const intercepts = eventsOf(state, 'INTERCEPT_DECRYPTED')
    expect(intercepts).toHaveLength(1)
    expect(intercepts[0].precedence).toBe('IMMEDIATE')
    expect(intercepts[0].aboutUnitId).toBe('ir_tel')
    expect(intercepts[0].text).toContain('missile unit')
    expect(contact(state, 'usa', 'ir_tel')?.level).toBe('detected')
  })

  it('reports failing Iranian war support at PRIORITY when below 45', () => {
    const state = makeState([makeUnit({ id: 'ir_ship', nation: 'iran' })]) // no hidden emitters
    isolateIntel(state, { sigint: true })
    state.warStatus = { usa: { warSupport: 90 }, iran: { warSupport: 40 } }
    runIntel(state, new SeededRNG(7), 60)

    const intercepts = eventsOf(state, 'INTERCEPT_DECRYPTED')
    expect(intercepts[0].precedence).toBe('PRIORITY')
    expect(intercepts[0].text).toContain('cohesion failing')
  })

  it('paranoia >= 70 at war triggers an encryption upgrade that silences intercepts for 6h', () => {
    const state = makeState([])
    isolateIntel(state, { sigint: true })
    state.intel!.paranoia = 70
    for (const a of Object.values(state.intel!.agents)) a.status = 'exfiltrated' // keep sweeps out of this test
    const rng = new SeededRNG(3)

    runIntel(state, rng, 60)
    const upgrades = eventsOf(state, 'ENCRYPTION_UPGRADED')
    expect(upgrades).toHaveLength(1)
    expect(upgrades[0].untilTick).toBe(60 + 6 * 3600)
    expect(state.intel!.paranoia).toBe(40)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(1) // the one that tipped it over

    // Blackout: cadence elapses with nothing heard
    runIntel(state, rng, 1260)
    runIntel(state, rng, 12000)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(1)

    // Window expires → collection resumes
    runIntel(state, rng, 21660)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(2)
    expect(eventsOf(state, 'ENCRYPTION_UPGRADED')).toHaveLength(1) // paranoia reset to 40 — no re-roll
  })

  it('does not upgrade encryption at peace, no matter the paranoia', () => {
    const state = makeState([], { atWar: false })
    isolateIntel(state, { sigint: true })
    state.intel!.paranoia = 90
    for (const a of Object.values(state.intel!.agents)) a.status = 'exfiltrated'
    runIntel(state, new SeededRNG(3), 60)
    expect(eventsOf(state, 'ENCRYPTION_UPGRADED')).toHaveLength(0)
    expect(eventsOf(state, 'INTERCEPT_DECRYPTED')).toHaveLength(1)
  })

  it('SBIRS pushes a FLASH OPIR card for Iranian launches on the launch tick', () => {
    const tel = makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53 } })
    const state = makeState([tel])
    isolateIntel(state)
    state.time.tick = 61
    state.events.push({ type: 'MISSILE_LAUNCHED', missileId: 'm_1', launcherId: 'ir_tel', targetId: 'us_x', weaponName: 'Fateh-110', tick: 61 })
    processIntel(state, new SeededRNG(1), null) // non-minute tick — OPIR rides every tick

    expect(state.intel!.products).toHaveLength(1)
    expect(state.intel!.products[0]).toMatchObject({ kind: 'sigint', precedence: 'FLASH' })
    expect(state.intel!.products[0].caption).toContain('OPIR LAUNCH DETECTION')
    expect(state.intel!.products[0].caption).toContain('Fateh-110')

    state.time.tick = 62 // stale event — no duplicate card
    processIntel(state, new SeededRNG(1), null)
    expect(state.intel!.products).toHaveLength(1)
  })
})

// ── HUMINT (design §1.4) ────────────────────────────────────────

describe('HUMINT', () => {
  it('taskAgent reports, raises exposure, and respects the 1h cooldown', () => {
    const state = makeState([])
    isolateIntel(state)
    const rng = new SeededRNG(1)
    const saffron = state.intel!.agents.saffron

    state.time.tick = 60
    taskAgent(state, rng, 'saffron')
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(1)
    expect(eventsOf(state, 'AGENT_REPORT')[0].codename).toBe('SAFFRON')
    expect(saffron.exposure).toBe(32) // 15 + 15 + paranoia(10)/5
    expect(state.intel!.paranoia).toBe(11)
    expect(state.intel!.products[0]).toMatchObject({ kind: 'humint', agentId: 'saffron', classification: 'SECRET//HCS' })

    state.time.tick = 120
    taskAgent(state, rng, 'saffron') // inside the 1 game-hour cooldown
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(1)
    expect(saffron.exposure).toBe(32)

    state.time.tick = 60 + 3600
    taskAgent(state, rng, 'saffron')
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(2)
  })

  it('opal identifies up to 2 hidden missile batteries and flags decoys', () => {
    const decoy = makeUnit({ id: 'ir_decoy', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53 }, isDecoy: true })
    const tracked = makeUnit({ id: 'ir_known', nation: 'iran', category: 'missile_battery', position: { lat: 29.2, lng: 53 } })
    const hidden1 = makeUnit({ id: 'ir_h1', nation: 'iran', category: 'missile_battery', position: { lat: 29.4, lng: 53 } })
    const hidden2 = makeUnit({ id: 'ir_h2', nation: 'iran', category: 'missile_battery', position: { lat: 29.6, lng: 53 } })
    const hidden3 = makeUnit({ id: 'ir_h3', nation: 'iran', category: 'missile_battery', position: { lat: 29.8, lng: 53 } })
    const state = makeState([decoy, tracked, hidden1, hidden2, hidden3])
    isolateIntel(state)
    revealContact(state, 'usa', tracked, 'tracked')

    taskAgent(state, new SeededRNG(1), 'opal')

    expect(contact(state, 'usa', 'ir_h1')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_h2')?.level).toBe('identified')
    expect(contact(state, 'usa', 'ir_h3')).toBeUndefined() // capped at 2 per tasking
    expect(contact(state, 'usa', 'ir_known')?.level).toBe('tracked') // already held — skipped

    expect(state.units.get('ir_decoy')!.decoyRevealed).toBe(true)
    expect(eventsOf(state, 'DECOY_REVEALED')).toHaveLength(1)
    const report = eventsOf(state, 'AGENT_REPORT')[0]
    expect(report.text).toContain('2 launcher group(s)')
    expect(report.text).toContain('Flags 1 site(s) as inflatable decoys')
  })

  it('saffron reads out the exact Iranian war support', () => {
    const state = makeState([])
    isolateIntel(state)
    state.warStatus = { usa: { warSupport: 90 }, iran: { warSupport: 62 } }
    taskAgent(state, new SeededRNG(1), 'saffron')
    expect(eventsOf(state, 'AGENT_REPORT')[0].text).toContain('war support at 62%')
  })

  it('amber reveals ships in the Bandar Abbas–Jask box at tracked', () => {
    const inBox = makeUnit({ id: 'ir_port', nation: 'iran', position: { lat: 26.5, lng: 56.2 } })
    const outside = makeUnit({ id: 'ir_west', nation: 'iran', position: { lat: 27, lng: 52 } })
    const state = makeState([inBox, outside])
    isolateIntel(state)
    taskAgent(state, new SeededRNG(1), 'amber')

    expect(contact(state, 'usa', 'ir_port')?.level).toBe('tracked')
    expect(contact(state, 'usa', 'ir_west')).toBeUndefined()
    expect(eventsOf(state, 'AGENT_REPORT')[0].text).toContain('hulls active')
  })

  it('active coastal sources passively refresh their box every 30 game-min', () => {
    const transiting = makeUnit({ id: 'ir_dhow', nation: 'iran', position: { lat: 26.5, lng: 56.5 } })
    const state = makeState([transiting])
    isolateIntel(state)
    const rng = new SeededRNG(1)

    runIntel(state, rng, 60)
    expect(contact(state, 'usa', 'ir_dhow')).toBeUndefined()
    runIntel(state, rng, 1800)
    expect(contact(state, 'usa', 'ir_dhow')?.level).toBe('detected')
  })

  it('restAgent decays exposure by 1 per game-hour', () => {
    const state = makeState([])
    isolateIntel(state)
    const rng = new SeededRNG(1)
    const amber = state.intel!.agents.amber
    amber.exposure = 40

    restAgent(state, 'amber')
    expect(amber.status).toBe('resting')

    runIntel(state, rng, 60) // not an hour boundary
    expect(amber.exposure).toBe(40)
    runIntel(state, rng, 3600)
    expect(amber.exposure).toBe(39)
    runIntel(state, rng, 7200)
    expect(amber.exposure).toBe(38)
  })

  it('exfiltrateAgent completes after 6 game-hours and removes the agent from play', () => {
    const state = makeState([])
    isolateIntel(state)
    const rng = new SeededRNG(1)
    const garnet = state.intel!.agents.garnet

    state.time.tick = 60
    exfiltrateAgent(state, 'garnet')
    expect(garnet.status).toBe('exfiltrating')
    expect(garnet.exfilCompleteTick).toBe(60 + 6 * 3600)

    taskAgent(state, rng, 'garnet') // en route — no products
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(0)

    runIntel(state, rng, 21600)
    expect(garnet.status).toBe('exfiltrating')
    runIntel(state, rng, 21660)
    expect(garnet.status).toBe('exfiltrated')
    expect(eventsOf(state, 'AGENT_EXFILTRATED')).toHaveLength(1)
    expect(eventsOf(state, 'AGENT_EXFILTRATED')[0].codename).toBe('GARNET')

    taskAgent(state, rng, 'garnet') // gone for good
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(0)
  })
})

// ── Spy sweeps (design §1.4/§1.5) ───────────────────────────────

describe('spy sweeps', () => {
  function sweepScenario(seed: number) {
    const state = makeState([], { atWar: false })
    isolateIntel(state)
    state.intel!.paranoia = 60
    state.warStatus = { usa: { warSupport: 80 }, iran: { warSupport: 80 } }
    for (const a of Object.values(state.intel!.agents)) a.exposure = 90
    const rng = new SeededRNG(seed)
    runIntel(state, rng, 60)
    return { state, rng }
  }

  it('arrests exposed agents at paranoia >= 50, raising leakLevel and shifting war support', () => {
    let hit: { state: GameState; rng: SeededRNG } | null = null
    for (let seed = 1; seed <= 30 && !hit; seed++) {
      const run = sweepScenario(seed)
      if (run.state.events.some(e => e.type === 'AGENT_ARRESTED')) hit = run
    }
    expect(hit).not.toBeNull()
    const { state } = hit!

    const arrests = eventsOf(state, 'AGENT_ARRESTED')
    expect(eventsOf(state, 'SPY_SWEEP')[0].arrests).toBe(arrests.length)
    for (const e of arrests) {
      expect(state.intel!.agents[e.agentId].status).toBe('arrested')
    }
    expect(state.intel!.leakLevel).toBe(25 + 10 * arrests.length)
    expect(state.warStatus!.usa.warSupport).toBe(80 - 3 * arrests.length)
    expect(state.warStatus!.iran.warSupport).toBe(80 + 2 * arrests.length)
  })

  it('arrested agents never report again and are not swept twice', () => {
    let hit: { state: GameState; rng: SeededRNG } | null = null
    for (let seed = 1; seed <= 30 && !hit; seed++) {
      const run = sweepScenario(seed)
      if (run.state.events.some(e => e.type === 'AGENT_ARRESTED')) hit = run
    }
    const { state, rng } = hit!
    const arrestedId = eventsOf(state, 'AGENT_ARRESTED')[0].agentId

    state.time.tick = 120
    taskAgent(state, rng, arrestedId)
    expect(eventsOf(state, 'AGENT_REPORT')).toHaveLength(0)
    expect(state.intel!.agents[arrestedId].status).toBe('arrested')

    runIntel(state, rng, 60 + 4 * 3600) // next sweep cycle
    expect(eventsOf(state, 'SPY_SWEEP')).toHaveLength(2)
    expect(eventsOf(state, 'AGENT_ARRESTED').filter(e => e.agentId === arrestedId)).toHaveLength(1)
  })

  it('does not sweep below the paranoia threshold', () => {
    const state = makeState([], { atWar: false })
    isolateIntel(state)
    state.intel!.paranoia = 49
    for (const a of Object.values(state.intel!.agents)) a.exposure = 100
    runIntel(state, new SeededRNG(1), 60)
    expect(eventsOf(state, 'SPY_SWEEP')).toHaveLength(0)
    expect(eventsOf(state, 'AGENT_ARRESTED')).toHaveLength(0)
  })
})

// ── Counterespionage (design §1.5) ──────────────────────────────

describe('counterespionage', () => {
  function leakScenario(seed: number, leakLevel: number) {
    const tel = makeUnit({
      id: 'ir_tel', nation: 'iran', category: 'missile_battery',
      position: { lat: 29, lng: 53 }, maxSpeed_kts: 30,
    })
    const state = makeState([tel])
    state.intel!.leakLevel = leakLevel
    revealContact(state, 'usa', tel, 'identified')
    const before = { ...tel.position }
    const leaked = maybeLeakStrike(state, new SeededRNG(seed), 'ir_tel')
    return { state, tel, before, leaked }
  }

  it('never leaks below leakLevel 60', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, leaked, tel, before } = leakScenario(seed, 59)
      expect(leaked).toBe(false)
      expect(eventsOf(state, 'STRIKE_LEAKED')).toHaveLength(0)
      expect(tel.position).toEqual(before)
    }
  })

  it('at high leak a compromised strike scoots the mobile target ~15 km and degrades the contact', () => {
    let hit: ReturnType<typeof leakScenario> | null = null
    for (let seed = 1; seed <= 40 && !hit; seed++) {
      const run = leakScenario(seed, 90)
      if (run.leaked) hit = run
    }
    expect(hit).not.toBeNull()
    const { state, tel, before } = hit!

    expect(eventsOf(state, 'STRIKE_LEAKED')).toHaveLength(1)
    expect(eventsOf(state, 'STRIKE_LEAKED')[0].targetId).toBe('ir_tel')
    expect(haversine(before, tel.position)).toBeGreaterThan(14)
    expect(haversine(before, tel.position)).toBeLessThan(16)
    expect(contact(state, 'usa', 'ir_tel')?.level).toBe('detected')
    expect(state.intel!.paranoia).toBe(12)
  })

  it('leakLevel drifts up while the carrier sits in the Hormuz approaches', () => {
    const carrier = makeUnit({ id: 'cvn', nation: 'usa', category: 'carrier_group', position: { lat: 26, lng: 56 } })
    const state = makeState([carrier])
    isolateIntel(state)
    const rng = new SeededRNG(1)

    runIntel(state, rng, 3600)
    expect(state.intel!.leakLevel).toBe(26)

    carrier.position = { lat: 26, lng: 50 } // out of the box — slow decay every 2h
    runIntel(state, rng, 7200)
    expect(state.intel!.leakLevel).toBe(25)
  })

  it('opsecSweep cuts leakLevel by 25 (floor 10) on a 6h cooldown', () => {
    const state = makeState([])
    state.intel!.leakLevel = 60

    state.time.tick = 60
    opsecSweep(state)
    expect(state.intel!.leakLevel).toBe(35)
    expect(eventsOf(state, 'OPSEC_SWEEP_COMPLETE')[0].newLeakLevel).toBe(35)

    state.time.tick = 120
    opsecSweep(state) // on cooldown
    expect(state.intel!.leakLevel).toBe(35)
    expect(eventsOf(state, 'OPSEC_SWEEP_COMPLETE')).toHaveLength(1)

    state.time.tick = 60 + 6 * 3600
    opsecSweep(state)
    expect(state.intel!.leakLevel).toBe(10) // 35 - 25, clamped at the floor
    expect(eventsOf(state, 'OPSEC_SWEEP_COMPLETE')).toHaveLength(2)
  })

  it("Iran's coarse carrier picture: detected from picket boats, tracked with Mohajer-10, EMCON does not hide it", () => {
    const build = () => makeUnit({ id: 'cvn', nation: 'usa', category: 'carrier_group', position: { lat: 26, lng: 56 }, emcon: true })

    const picketState = makeState([build()])
    isolateIntel(picketState)
    picketState.intel!.assets.mohajer10.status = 'lost'
    runIntel(picketState, new SeededRNG(1), 1800)
    expect(contact(picketState, 'iran', 'cvn')?.level).toBe('detected') // EMCON irrelevant to port spotters

    const droneState = makeState([build()])
    isolateIntel(droneState)
    runIntel(droneState, new SeededRNG(1), 1800)
    expect(contact(droneState, 'iran', 'cvn')?.level).toBe('tracked')
  })
})

// ── Wide-area sensors (design §1.1) ─────────────────────────────

describe('wide-area sensors', () => {
  it('Triton refreshes maritime contacts in the Gulf box at detected, ignoring land units', () => {
    const ship = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52 } })
    const tel = makeUnit({ id: 'ir_tel', nation: 'iran', category: 'missile_battery', position: { lat: 27, lng: 52 } })
    const state = makeState([ship, tel])
    isolateIntel(state, { triton: true })
    const rng = new SeededRNG(1)

    runIntel(state, rng, 60)
    expect(contact(state, 'usa', 'ir_ship')).toBeUndefined() // 30-min revisit not yet elapsed

    runIntel(state, rng, 1800)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('detected')
    expect(contact(state, 'usa', 'ir_tel')).toBeUndefined()
  })
})

// ── Decoys (design §1.7) ────────────────────────────────────────

describe('decoys', () => {
  const decoyUnits = (state: GameState) => Array.from(state.units.values()).filter(u => u.isDecoy)

  it('spawns 4 decoys near real batteries when Iran is at war, exactly once', () => {
    const batteries = [
      makeUnit({ id: 'tel1', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53 } }),
      makeUnit({ id: 'tel2', nation: 'iran', category: 'missile_battery', position: { lat: 30, lng: 54 } }),
      makeUnit({ id: 'tel3', nation: 'iran', category: 'missile_battery', position: { lat: 28.5, lng: 52.5 } }),
    ]
    const state = makeState([...batteries, makeUnit({ id: 'us1', nation: 'usa' })])
    isolateIntel(state, { decoys: true })
    const rng = new SeededRNG(11)

    runIntel(state, rng, 60)
    const decoys = decoyUnits(state)
    expect(decoys).toHaveLength(4)
    expect(state.intel!.decoysSpawned).toBe(true)
    for (const d of decoys) {
      expect(d.category).toBe('missile_battery')
      expect(d.name).toBe('Missile TEL group')
      expect(d.health).toBe(40)
      expect(d.weapons).toHaveLength(0)
      const nearest = Math.min(...batteries.map(b => haversine(b.position, d.position)))
      expect(nearest).toBeLessThanOrEqual(15.1)
    }

    runIntel(state, rng, 120)
    expect(decoyUnits(state)).toHaveLength(4)

    for (const d of decoyUnits(state)) d.status = 'destroyed'
    runIntel(state, rng, 180)
    expect(decoyUnits(state)).toHaveLength(4) // dead inflatables are not replaced
  })

  it('does not spawn at peace, then spawns when the war starts', () => {
    const state = makeState(
      [makeUnit({ id: 'tel1', nation: 'iran', category: 'missile_battery', position: { lat: 29, lng: 53 } })],
      { atWar: false },
    )
    isolateIntel(state, { decoys: true })
    const rng = new SeededRNG(11)

    runIntel(state, rng, 60)
    expect(decoyUnits(state)).toHaveLength(0)
    expect(state.intel!.decoysSpawned).toBeFalsy()

    state.nations.iran.atWar = ['usa']
    runIntel(state, rng, 120)
    expect(decoyUnits(state)).toHaveLength(4)
  })
})

// ── EMCON (design §1.6) ─────────────────────────────────────────

describe('EMCON', () => {
  it('an EMCON unit contributes no radar contacts to its own picture', () => {
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa', sensors: [radar(100)], emcon: true })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.5 } }) // ~50 km
    const state = makeState([usShip, irShip], { tick: 60 })

    processVisibility(state, null, null, null)
    expect(contact(state, 'usa', 'ir_ship')).toBeUndefined()

    usShip.emcon = false
    state.time.tick = 120
    processVisibility(state, null, null, null)
    expect(contact(state, 'usa', 'ir_ship')?.level).toBe('identified')
  })

  it('an EMCON emitter is not ELINT-detectable', () => {
    const espionage: EspionageResult = {
      humintRevealed: new Map(),
      sigintMultiplier: new Map([['usa', 2.0], ['iran', 1.5]]),
    }
    const build = (emcon: boolean) => [
      makeUnit({ id: 'us_ew', nation: 'usa', sensors: [radar(50)] }),
      makeUnit({ id: 'ir_sam', nation: 'iran', category: 'sam_site', position: { lat: 27, lng: 53.75 }, sensors: [radar(100)], emcon }), // ~173 km
    ]

    const radiating = makeState(build(false), { tick: 60 })
    processVisibility(radiating, null, espionage, null)
    expect(contact(radiating, 'usa', 'ir_sam')?.level).toBe('detected') // 100 × 2.0 = 200 km >= 173

    const silent = makeState(build(true), { tick: 60 })
    processVisibility(silent, null, espionage, null)
    expect(contact(silent, 'usa', 'ir_sam')).toBeUndefined()
  })

  it('radarSeesUnit returns unseen for an EMCON radar (fire-control own-track lost)', () => {
    const usShip = makeUnit({ id: 'us_ship', nation: 'usa', sensors: [radar(100)], emcon: true })
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 27, lng: 52.2 } }) // ~20 km
    expect(radarSeesUnit(usShip, irShip, null)).toBe('unseen')
    usShip.emcon = false
    expect(radarSeesUnit(usShip, irShip, null)).toBe('identified')
  })

  it('detectThreats returns no threats for an EMCON air-defense unit', () => {
    const adUnit = makeUnit({ id: 'us_ad', nation: 'usa', sensors: [radar(100)] })
    const state = makeState([adUnit])
    const missile: Missile = {
      id: 'm_t', weaponId: 'test_wpn', launcherId: 'ir_x', targetId: 'us_ad', nation: 'iran',
      path: [[52.1, 27], [52.3, 27]], timestamps: [900_000, 1_100_000], status: 'inflight',
      launchTime: 900_000, eta: 1_100_000, altitude_m: 50, phase: 'cruise',
      speed_current_mach: 0.8, fuel_remaining_sec: 600, is_interceptor: false,
    }
    state.missiles.set(missile.id, missile)

    expect(detectThreats(state, adUnit, null)).toHaveLength(1)
    adUnit.emcon = true
    expect(detectThreats(state, adUnit, null)).toHaveLength(0)
  })
})

// ── War-support decoy exception (design §1.7) ───────────────────

describe('war-support decoy exception', () => {
  function destroyUnit(state: GameState, unitId: string): void {
    const unit = state.units.get(unitId)!
    unit.status = 'destroyed'
    const event: GameEvent = { type: 'UNIT_DESTROYED', unitId, tick: state.time.tick }
    state.events.push(event)
    state.pendingEvents.push(event)
  }

  function evalAt(state: GameState, tick: number): void {
    state.time.tick = tick
    processWarSupport(state)
  }

  it('destroying a decoy does not drain Iran and instead hands it +1 support', () => {
    const state = makeState([
      makeUnit({ id: 'us1', nation: 'usa' }),
      makeUnit({ id: 'decoy', nation: 'iran', category: 'missile_battery', isDecoy: true }),
      makeUnit({ id: 'real_tel', nation: 'iran', category: 'missile_battery' }),
    ])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 80
    state.warStatus!.usa.warSupport = 90

    destroyUnit(state, 'decoy')
    evalAt(state, 60)
    let support = getWarSupport(state)
    expect(support.iran).toBeCloseTo(81, 1) // +1 propaganda bump, no 1.5 battery drain
    expect(support.usa).toBeLessThan(90.05) // no kill gain for shooting an inflatable

    destroyUnit(state, 'real_tel')
    evalAt(state, 120)
    support = getWarSupport(state)
    expect(support.iran).toBeLessThan(79.6) // the real battery drains normally
    expect(support.usa).toBeGreaterThan(90.4) // and pays out the kill gain
  })
})

// ── Save/load round-trip ────────────────────────────────────────

describe('save/load', () => {
  function makeNation(id: NationId, name: string): Nation {
    return {
      id,
      name,
      economy: { gdp_billions: 1000, military_budget_billions: 100, military_budget_pct_gdp: 3, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 100 },
      relations: { usa: 0, iran: 0 },
      atWar: [],
    }
  }

  it('state.intel survives a JSON round-trip with taskings, agents and meters intact', () => {
    const engine = new GameEngine()
    engine.initFromData(
      'usa',
      { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') },
      [
        makeUnit({ id: 'us_ship', nation: 'usa' }),
        makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27.6, lng: 52.3 } }),
      ],
      [],
      {},
    )
    engine.executeCommand({ type: 'TASK_SATELLITE_PASS', assetId: 'kh11', target: { lat: 27.5, lng: 52.5 }, cloudPct: 12 })
    engine.executeCommand({ type: 'TASK_AGENT', agentId: 'saffron' })
    engine.executeCommand({ type: 'SET_EMCON', unitId: 'us_ship', emcon: true })
    const intel = engine.state.intel!
    intel.paranoia = 57
    intel.leakLevel = 64
    intel.agents.amber.status = 'arrested'
    intel.encryptionUpgradedUntilTick = 4242

    const loaded = new GameEngine()
    loaded.loadState(engine.getFullStateJson())

    expect(loaded.state.intel).toEqual(engine.state.intel)
    expect(loaded.state.intel!.taskings).toHaveLength(1)
    expect(loaded.state.intel!.taskings[0]).toMatchObject({ assetId: 'kh11', cloudPct: 12 })
    expect(loaded.state.intel!.agents.amber.status).toBe('arrested')
    expect(loaded.state.intel!.products.length).toBeGreaterThan(0)
    expect(loaded.state.units.get('us_ship')!.emcon).toBe(true)
  })
})

// ── Snapshot helper ─────────────────────────────────────────────

describe('paranoiaBand', () => {
  it('maps paranoia to the fuzzy display bands', () => {
    expect(paranoiaBand(0)).toBe('LOW')
    expect(paranoiaBand(29)).toBe('LOW')
    expect(paranoiaBand(30)).toBe('ELEVATED')
    expect(paranoiaBand(54)).toBe('ELEVATED')
    expect(paranoiaBand(55)).toBe('HIGH')
    expect(paranoiaBand(74)).toBe('HIGH')
    expect(paranoiaBand(75)).toBe('SEVERE')
    expect(paranoiaBand(100)).toBe('SEVERE')
  })
})
