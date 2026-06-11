import { describe, it, expect, beforeEach } from 'vitest'
import {
  processAirOps,
  launchAirMission,
  cancelAirMission,
  setSurgeOps,
  resetAirOpsState,
} from '../air-ops'
import { processMovement } from '../movement'
import { SeededRNG } from '../../utils/rng'
import { GameEngine } from '../../game-engine'
import { haversine, destination } from '../../utils/geo'
import {
  CAP_TURNAROUND_TICKS,
  STRIKE_TURNAROUND_SURGE_TICKS,
  STRIKE_TURNAROUND_SUSTAINED_TICKS,
  STRIKE_PLANNING_MIN_TICKS,
  STRIKE_PLANNING_MAX_TICKS,
} from '@/data/air/airframes'
import type { GameState, Nation, NationId, Position, SquadronState, Unit, VisibilityLevel } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

const CARRIER_POS: Position = { lat: 25, lng: 56 }

function eco(): Nation['economy'] {
  return { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }
}

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
    position: { ...CARRIER_POS },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 150,
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

function sq(id: string, name: string, airframe: SquadronState['airframe'], total: number, available = total): SquadronState {
  return { id, name, airframe, total, available, readyAt: [] }
}

function carrier(squadrons: SquadronState[]): Unit {
  return makeUnit({ id: 'cvn', nation: 'usa', category: 'carrier_group', airWing: squadrons })
}

function makeState(units: Unit[], opts: { atWar?: boolean } = {}): GameState {
  const atWar = opts.atWar ?? true
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 0, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: eco(), relations: {}, atWar: atWar ? ['iran'] : [] },
      iran: { id: 'iran', name: 'Iran', economy: eco(), relations: {}, atWar: atWar ? ['usa'] : [] },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
    attackCounters: {},
    airMissions: [],
    surgeOps: { enabled: false },
  }
}

/** Mirror the engine tick order for the systems under test: move, then air ops */
function step(state: GameState, rng: SeededRNG, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    state.time.tick++
    state.time.timestamp += 1000
    processMovement(state, null)
    processAirOps(state, rng, null)
  }
}

function seedContact(state: GameState, observer: string, target: Unit, level: VisibilityLevel = 'tracked'): void {
  state.visibility ??= {}
  const contacts = (state.visibility[observer] ??= {})
  contacts[target.id] = { level, lastSeenTick: state.time.tick, lastKnownPosition: { ...target.position } }
}

function events(state: GameState, type: string) {
  return state.events.filter(e => e.type === type)
}

function flightOf(state: GameState, idx = 0): Unit {
  return state.units.get(state.airMissions![idx].flightUnitId!)!
}

// ── Tests ───────────────────────────────────────────────────────

describe('air-ops launch', () => {
  beforeEach(() => resetAirOpsState())

  it('CAP launch deducts the pool and spawns a correctly shaped Flight unit', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    const station = destination(CARRIER_POS, 0, 50)

    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station })
    expect(state.airMissions).toHaveLength(1)
    expect(state.airMissions![0].status).toBe('active')

    step(state, rng, 1)
    const mission = state.airMissions![0]
    expect(mission.flightUnitId).toBe(`flight_${mission.id}`)
    expect(cvn.airWing![0].available).toBe(10)

    const flight = flightOf(state)
    expect(flight.name).toBe('2× F/A-18E Super Hornet (VFA-14 Tophatters)')
    expect(flight.category).toBe('aircraft')
    expect(flight.nation).toBe('usa')
    expect(flight.maxSpeed_kts).toBe(480)
    expect(flight.roe).toBe('weapons_free')
    expect(flight.hardness).toBe(60)
    expect(flight.sensors).toHaveLength(1)
    expect(flight.weapons).toHaveLength(0) // CAP carries no strike weapons
    expect(flight.flightMeta).toMatchObject({ missionId: mission.id, rtbTo: 'cvn', a2aShots: 12 })
    expect(flight.flightMeta!.bingoTick).toBeGreaterThan(state.time.tick)
    expect(flight.waypoints[0]).toEqual(station)
    expect(events(state, 'AIR_MISSION_LAUNCHED')).toHaveLength(1)
  })

  it('strike planning delay gates the launch until planningCompleteTick', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    // 920 km out — beyond the 900 km release ring, so the racks stay loaded here
    const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 920) })
    const state = makeState([cvn, irBase])
    const rng = new SeededRNG(42)

    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab' })
    const mission = state.airMissions![0]
    expect(mission.status).toBe('planning')
    expect(mission.planningCompleteTick).toBeGreaterThanOrEqual(STRIKE_PLANNING_MIN_TICKS)
    expect(mission.planningCompleteTick).toBeLessThanOrEqual(STRIKE_PLANNING_MAX_TICKS)

    step(state, rng, 1)
    expect(mission.flightUnitId).toBeUndefined()
    expect(cvn.airWing![0].available).toBe(12)

    mission.planningCompleteTick = 3
    step(state, rng, 1) // tick 2 — still planning
    expect(mission.flightUnitId).toBeUndefined()
    step(state, rng, 1) // tick 3 — window opens
    expect(mission.status).toBe('active')
    expect(mission.flightUnitId).toBeDefined()
    expect(flightOf(state).weapons).toEqual([
      { weaponId: 'jassm_er', count: 4, maxCount: 4, reloadTimeSec: 0 },
    ])
  })

  it('aborts at launch time when the pool was drained after ordering', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12, 2)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 50) })
    cvn.airWing![0].available = 1

    step(state, rng, 1)
    expect(state.airMissions![0].status).toBe('aborted')
    expect(state.airMissions![0].flightUnitId).toBeUndefined()
    expect(cvn.airWing![0].available).toBe(1)
  })

  it('extendedRange taxes the first fa18e squadron 2 quick-turn sorties and extends bingo', () => {
    const launchStrike = (extendedRange: boolean) => {
      resetAirOpsState()
      const cvn = carrier([
        sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12),
        sq('vfa97', 'VFA-97 Warhawks', 'f35c', 10),
      ])
      const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 400) })
      const state = makeState([cvn, irBase])
      const rng = new SeededRNG(42)
      launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa97', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab', extendedRange })
      state.airMissions![0].planningCompleteTick = 1
      step(state, rng, 1)
      return { state, cvn }
    }

    const ext = launchStrike(true)
    expect(ext.cvn.airWing![1].available).toBe(8) // the flight itself
    expect(ext.cvn.airWing![0].available).toBe(10) // tanker tax
    expect(ext.cvn.airWing![0].readyAt).toEqual([1 + CAP_TURNAROUND_TICKS, 1 + CAP_TURNAROUND_TICKS])

    const base = launchStrike(false)
    expect(base.cvn.airWing![0].available).toBe(12)
    expect(base.cvn.airWing![0].readyAt).toEqual([])
    expect(flightOf(ext.state).flightMeta!.bingoTick).toBeGreaterThan(flightOf(base.state).flightMeta!.bingoTick)
  })
})

describe('air-ops CAP', () => {
  beforeEach(() => resetAirOpsState())

  it('reaches station, emits FLIGHT_ON_STATION exactly once, and keeps an orbit going', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    const station = destination(CARRIER_POS, 0, 20)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station })

    step(state, rng, 150)
    expect(events(state, 'FLIGHT_ON_STATION')).toHaveLength(1)
    const flight = flightOf(state)
    expect(flight.waypoints.length).toBeGreaterThan(0)
    expect(haversine(flight.position, station)).toBeLessThan(20)

    step(state, rng, 400)
    expect(events(state, 'FLIGHT_ON_STATION')).toHaveLength(1) // never re-emitted
    expect(haversine(flightOf(state).position, station)).toBeLessThan(20) // still orbiting
  })

  it('intercepts a hostile flight: chase, A2A rolls, kills, FLIGHT_LOST with pilot fate', () => {
    const cvn = carrier([sq('vfa97', 'VFA-97 Warhawks', 'f35c', 10)])
    // Naval base host so the Iranian scramble AI (airbase-only) stays out of this test
    const irHost = makeUnit({
      id: 'ir_port', nation: 'iran', category: 'naval_base',
      position: destination(CARRIER_POS, 0, 67),
      airWing: [sq('tfb1_mig29', '11th TFS Fulcrums', 'mig29', 10)],
    })
    const state = makeState([cvn, irHost])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa97', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 30) })
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'tfb1_mig29', fromUnitId: 'ir_port', flightSize: 2, station: destination(CARRIER_POS, 0, 40) })
    step(state, rng, 1)

    const usaFlight = flightOf(state, 0)
    const iranFlight = flightOf(state, 1)
    seedContact(state, 'usa', iranFlight)
    seedContact(state, 'iran', usaFlight)

    step(state, rng, 600)

    const intercepts = events(state, 'AIR_INTERCEPT')
    expect(intercepts.length).toBeGreaterThan(0)
    // Both sides rolled (defender shoots back)
    expect(intercepts.some(e => e.type === 'AIR_INTERCEPT' && e.attackerName.includes('F-35C'))).toBe(true)
    expect(intercepts.some(e => e.type === 'AIR_INTERCEPT' && e.attackerName.includes('MiG-29'))).toBe(true)

    const losses = events(state, 'FLIGHT_LOST')
    expect(losses.length).toBeGreaterThanOrEqual(1)
    const loss = losses[0]
    if (loss.type !== 'FLIGHT_LOST') throw new Error('unreachable')
    expect(loss.airframesLost).toBe(2)
    expect(['kia', 'rescued', 'pow']).toContain(loss.pilotFate)

    const lostMission = state.airMissions!.find(m => m.id === loss.missionId)!
    expect(lostMission.status).toBe('complete')
    const victim = state.units.get(lostMission.flightUnitId!)!
    expect(victim.status).toBe('destroyed')
    expect(victim.flightMeta!.a2aShots).toBeLessThan(8)
    expect(events(state, 'UNIT_DESTROYED').some(e => e.type === 'UNIT_DESTROYED' && e.unitId === victim.id)).toBe(true)
    // Airframes never return: squadron loses them off the books
    const loserHost = victim.nation === 'usa' ? cvn : irHost
    expect(loserHost.airWing![0].total).toBe(8)
    expect(loserHost.airWing![0].readyAt).toEqual([])
  })

  it('never auto-engages non-aircraft units', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const station = destination(CARRIER_POS, 0, 20)
    const irShip = makeUnit({ id: 'ir_ship', nation: 'iran', category: 'ship', position: destination(station, 0, 10) })
    const state = makeState([cvn, irShip])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station })
    step(state, rng, 1)
    seedContact(state, 'usa', irShip)

    step(state, rng, 300)
    expect(events(state, 'AIR_INTERCEPT')).toHaveLength(0)
    expect(irShip.health).toBe(100)
    expect(flightOf(state).flightMeta!.a2aShots).toBe(12)
  })

  it('forces RTB at bingo', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 50) })
    step(state, rng, 1)
    flightOf(state).flightMeta!.bingoTick = state.time.tick + 30

    step(state, rng, 45)
    const rtb = events(state, 'FLIGHT_RTB')
    expect(rtb).toHaveLength(1)
    expect(rtb[0].type === 'FLIGHT_RTB' && rtb[0].reason).toBe('bingo fuel')
  })
})

describe('air-ops strike', () => {
  beforeEach(() => resetAirOpsState())

  it('transits, releases the full magazine inside release range, then RTBs', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 920) })
    const state = makeState([cvn, irBase])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab' })
    state.airMissions![0].planningCompleteTick = 1
    step(state, rng, 1)
    expect(state.missiles.size).toBe(0) // 920 km out — beyond the 900 km release ring

    // Release falls ~tick 82 (20 km closure); stop before the return leg completes
    step(state, rng, 100)
    expect(state.missiles.size).toBe(4) // 2 jassm_er per airframe × 2
    expect(events(state, 'MISSILE_LAUNCHED')).toHaveLength(4)
    const flight = flightOf(state)
    expect(flight).toBeDefined()
    expect(flight.weapons[0].count).toBe(0)
    const rtb = events(state, 'FLIGHT_RTB')
    expect(rtb).toHaveLength(1)
    expect(rtb[0].type === 'FLIGHT_RTB' && rtb[0].reason).toBe('weapons released')
    expect(haversine(flight.waypoints[0], CARRIER_POS)).toBeLessThan(1)
    for (const m of state.missiles.values()) {
      expect(m.launcherId).toBe(flight.id)
      expect(m.targetId).toBe('ir_ab')
    }
  })

  it('a pre-war air strike puts both nations at war', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 100) })
    const state = makeState([cvn, irBase], { atWar: false })
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab' })
    state.airMissions![0].planningCompleteTick = 1

    step(state, rng, 2) // launch + immediate release (already in range)
    expect(state.missiles.size).toBe(4)
    expect(state.nations.usa.atWar).toContain('iran')
    expect(state.nations.iran.atWar).toContain('usa')
    expect(events(state, 'WAR_DECLARED')).toHaveLength(1)
  })

  it('RTBs "target down" when the target dies before release', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 920) })
    const state = makeState([cvn, irBase])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab' })
    state.airMissions![0].planningCompleteTick = 1
    step(state, rng, 5)

    irBase.status = 'destroyed'
    step(state, rng, 2)
    const rtb = events(state, 'FLIGHT_RTB')
    expect(rtb).toHaveLength(1)
    expect(rtb[0].type === 'FLIGHT_RTB' && rtb[0].reason).toBe('target down')
    expect(state.missiles.size).toBe(0)
  })

  it('SEAD escort reveals emitting SAMs within 150 km as detected contacts', () => {
    const runStrike = (escortSead: boolean) => {
      resetAirOpsState()
      const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
      // Far target keeps the flight airborne through the first minute boundary
      const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 920) })
      const sam = makeUnit({
        id: 'sam1', nation: 'iran', category: 'sam_site',
        position: destination(CARRIER_POS, 90, 100),
        sensors: [{ type: 'radar', range_km: 120, detection_prob: 0.9 }],
      })
      const state = makeState([cvn, irBase, sam])
      const rng = new SeededRNG(42)
      launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab', escortSead })
      state.airMissions![0].planningCompleteTick = 1
      step(state, rng, 60) // through the first game-minute boundary
      return state
    }

    expect(runStrike(true).visibility?.usa?.sam1?.level).toBe('detected')
    expect(runStrike(false).visibility?.usa?.sam1).toBeUndefined()
  })
})

describe('air-ops RTB + recovery', () => {
  beforeEach(() => resetAirOpsState())

  it('cancel aborts to RTB; recovery restores the pool on the CAP quick-turn clock', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 20) })
    step(state, rng, 100) // on station
    const mission = state.airMissions![0]
    const flightId = mission.flightUnitId!

    cancelAirMission(state, mission.id)
    step(state, rng, 1)
    const rtb = events(state, 'FLIGHT_RTB')
    expect(rtb).toHaveLength(1)
    expect(rtb[0].type === 'FLIGHT_RTB' && rtb[0].reason).toBe('mission aborted')

    let recoveredTick = -1
    for (let i = 0; i < 400 && recoveredTick < 0; i++) {
      step(state, rng, 1)
      if (!state.units.has(flightId)) recoveredTick = state.time.tick
    }
    expect(recoveredTick).toBeGreaterThan(0)
    expect(mission.status).toBe('complete')
    const squadron = cvn.airWing![0]
    expect(squadron.available).toBe(10) // not back yet
    expect(squadron.readyAt).toEqual([recoveredTick + CAP_TURNAROUND_TICKS, recoveredTick + CAP_TURNAROUND_TICKS])

    // Ready clock pops them back on a game-minute boundary
    const due = squadron.readyAt[0]
    state.time.tick = Math.ceil(due / 60) * 60 - 1
    step(state, rng, 1)
    expect(squadron.available).toBe(12)
    expect(squadron.readyAt).toEqual([])
  })

  it('strike turnaround honors SURGE OPS vs sustained', () => {
    const runStrike = (surge: boolean) => {
      resetAirOpsState()
      const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
      const irBase = makeUnit({ id: 'ir_ab', nation: 'iran', category: 'airbase', position: destination(CARRIER_POS, 90, 100) })
      const state = makeState([cvn, irBase])
      const rng = new SeededRNG(42)
      if (surge) setSurgeOps(state, true)
      launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'strike', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, targetId: 'ir_ab' })
      state.airMissions![0].planningCompleteTick = 1
      const flightId = `flight_${state.airMissions![0].id}`
      let recoveredTick = -1
      for (let i = 0; i < 50 && recoveredTick < 0; i++) {
        step(state, rng, 1)
        if (state.airMissions![0].flightUnitId && !state.units.has(flightId)) recoveredTick = state.time.tick
      }
      return { state, cvn, recoveredTick }
    }

    const surge = runStrike(true)
    expect(surge.recoveredTick).toBeGreaterThan(0)
    expect(surge.cvn.airWing![0].readyAt).toEqual([
      surge.recoveredTick + STRIKE_TURNAROUND_SURGE_TICKS,
      surge.recoveredTick + STRIKE_TURNAROUND_SURGE_TICKS,
    ])

    const sustained = runStrike(false)
    expect(sustained.cvn.airWing![0].readyAt).toEqual([
      sustained.recoveredTick + STRIKE_TURNAROUND_SUSTAINED_TICKS,
      sustained.recoveredTick + STRIKE_TURNAROUND_SUSTAINED_TICKS,
    ])
  })

  it('diverts to the nearest friendly field with an air wing when the host dies', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const diego = makeUnit({
      id: 'diego', nation: 'usa', category: 'airbase',
      position: destination(CARRIER_POS, 180, 80),
      airWing: [sq('det1', 'Detachment', 'fa18e', 4)],
    })
    const state = makeState([cvn, diego])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 20) })
    step(state, rng, 100)
    const mission = state.airMissions![0]
    const flight = flightOf(state)

    cvn.status = 'destroyed'
    cancelAirMission(state, mission.id)
    step(state, rng, 1)
    expect(flight.flightMeta!.rtbTo).toBe('diego')

    for (let i = 0; i < 600 && state.units.has(flight.id); i++) step(state, rng, 1)
    expect(state.units.has(flight.id)).toBe(false)
    expect(mission.status).toBe('complete')
    expect(cvn.airWing![0].readyAt).toHaveLength(2) // squadron bookkeeping still applies
    expect(events(state, 'FLIGHT_LOST')).toHaveLength(0)
  })

  it('ditches with fate "rescued" when no divert field exists', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 20) })
    step(state, rng, 30)
    const mission = state.airMissions![0]
    const flightId = mission.flightUnitId!

    cvn.status = 'destroyed'
    cancelAirMission(state, mission.id)
    step(state, rng, 1)

    const losses = events(state, 'FLIGHT_LOST')
    expect(losses).toHaveLength(1)
    expect(losses[0].type === 'FLIGHT_LOST' && losses[0].pilotFate).toBe('rescued')
    expect(losses[0].type === 'FLIGHT_LOST' && losses[0].airframesLost).toBe(2)
    expect(state.units.has(flightId)).toBe(false)
    expect(mission.status).toBe('complete')
  })

  it('a flight destroyed by outside combat is reported lost and never returns airframes', () => {
    const cvn = carrier([sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn', flightSize: 2, station: destination(CARRIER_POS, 0, 50) })
    step(state, rng, 5)
    const mission = state.airMissions![0]
    const flight = flightOf(state)

    flight.health = 0
    flight.status = 'destroyed'
    step(state, rng, 1)

    const losses = events(state, 'FLIGHT_LOST')
    expect(losses).toHaveLength(1)
    expect(losses[0].type === 'FLIGHT_LOST' && losses[0].missionId).toBe(mission.id)
    expect(losses[0].type === 'FLIGHT_LOST' && losses[0].airframesLost).toBe(2)
    expect(mission.status).toBe('complete')
    const squadron = cvn.airWing![0]
    expect(squadron.total).toBe(10)
    expect(squadron.available).toBe(10)
    expect(squadron.readyAt).toEqual([])
  })

  it('ready clock pops due airframes each game-minute, capped at total', () => {
    const squadron = sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 10, 9)
    squadron.readyAt = [30, 30, 90]
    const cvn = carrier([squadron])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)

    step(state, rng, 60)
    expect(squadron.available).toBe(10) // 9 + 2 due, capped at total 10
    expect(squadron.readyAt).toEqual([90])

    step(state, rng, 60)
    expect(squadron.available).toBe(10)
    expect(squadron.readyAt).toEqual([])
  })
})

describe('air-ops AEW', () => {
  beforeEach(() => resetAirOpsState())

  it('orbits station with datalink up and never RTBs for winchester', () => {
    const cvn = carrier([sq('vaw116', 'VAW-116 Sun Kings', 'e2d', 5)])
    const state = makeState([cvn])
    const rng = new SeededRNG(42)
    const station = destination(CARRIER_POS, 0, 20)
    launchAirMission(state, rng, { type: 'LAUNCH_AIR_MISSION', kind: 'aew', squadronId: 'vaw116', fromUnitId: 'cvn', flightSize: 2, station })
    step(state, rng, 1)

    const flight = flightOf(state)
    expect(flight.datalink_range_km).toBe(600)
    expect(flight.weapons).toHaveLength(0)
    expect(flight.flightMeta!.a2aShots).toBe(0)

    step(state, rng, 250)
    expect(events(state, 'FLIGHT_ON_STATION')).toHaveLength(1)
    expect(events(state, 'FLIGHT_RTB')).toHaveLength(0)
    expect(state.units.has(flight.id)).toBe(true)
  })
})

describe('air-ops Iranian scramble', () => {
  beforeEach(() => resetAirOpsState())

  it('scrambles a 2-ship CAP at the midpoint against a detected enemy flight, max 2 live', () => {
    const base = makeUnit({
      id: 'tabriz_ab', nation: 'iran', category: 'airbase',
      position: { lat: 32, lng: 50 },
      airWing: [sq('tfb2_mig29', '23rd TFS Fulcrums', 'mig29', 8)],
    })
    const intruders = [0, 1, 2].map(i =>
      makeUnit({ id: `us_jet_${i}`, nation: 'usa', category: 'aircraft', position: destination({ lat: 32, lng: 50 }, 90, 150 + i * 10) }))
    const state = makeState([base, ...intruders])
    const rng = new SeededRNG(42)
    for (const u of intruders) seedContact(state, 'iran', u, 'detected')

    step(state, rng, 59)
    expect(state.airMissions).toHaveLength(0) // scans only on minute boundaries

    step(state, rng, 1) // tick 60
    const caps = state.airMissions!.filter(m => m.nation === 'iran' && m.kind === 'cap')
    expect(caps).toHaveLength(2) // 3 threats, capped at 2 live CAPs
    const cap = caps[0]
    expect(cap.fromUnitId).toBe('tabriz_ab')
    expect(cap.flightSize).toBe(2)
    const expected = { lat: (32 + intruders[0].position.lat) / 2, lng: (50 + intruders[0].position.lng) / 2 }
    expect(cap.station!.lat).toBeCloseTo(expected.lat, 5)
    expect(cap.station!.lng).toBeCloseTo(expected.lng, 5)

    step(state, rng, 1)
    expect(state.units.has(`flight_${cap.id}`)).toBe(true)
  })

  it('ignores threats beyond 250 km and stands down at peace', () => {
    const base = makeUnit({
      id: 'tabriz_ab', nation: 'iran', category: 'airbase',
      position: { lat: 32, lng: 50 },
      airWing: [sq('tfb2_mig29', '23rd TFS Fulcrums', 'mig29', 8)],
    })
    const farJet = makeUnit({ id: 'us_far', nation: 'usa', category: 'aircraft', position: destination({ lat: 32, lng: 50 }, 90, 300) })
    const state = makeState([base, farJet])
    const rng = new SeededRNG(42)
    seedContact(state, 'iran', farJet, 'tracked')
    step(state, rng, 60)
    expect(state.airMissions).toHaveLength(0)

    // Same geometry in range but at peace: still nothing
    const nearJet = makeUnit({ id: 'us_near', nation: 'usa', category: 'aircraft', position: destination({ lat: 32, lng: 50 }, 90, 100) })
    const peace = makeState([base, nearJet], { atWar: false })
    resetAirOpsState()
    seedContact(peace, 'iran', nearJet, 'tracked')
    step(peace, new SeededRNG(42), 60)
    expect(peace.airMissions).toHaveLength(0)
  })

  it('Su-35s only scramble for threats within 250 km of Mehrabad', () => {
    const runScramble = (baseId: string) => {
      resetAirOpsState()
      const base = makeUnit({
        id: baseId, nation: 'iran', category: 'airbase',
        position: { lat: 35.7, lng: 51.3 },
        airWing: [sq('tfb1_su35', 'Su-35SE Group', 'su35', 8)],
      })
      const jet = makeUnit({ id: 'us_jet', nation: 'usa', category: 'aircraft', position: destination(base.position, 90, 200) })
      const units = [base, jet]
      if (baseId !== 'mehrabad') {
        // A far-away Mehrabad: the threat is near the Su-35 base but not the capital axis
        units.push(makeUnit({ id: 'mehrabad', nation: 'iran', category: 'airbase', position: { lat: 27, lng: 60 } }))
      }
      const state = makeState(units)
      seedContact(state, 'iran', jet, 'detected')
      step(state, new SeededRNG(42), 60)
      return state
    }

    expect(runScramble('mehrabad').airMissions).toHaveLength(1) // defends the capital
    expect(runScramble('bandar_ab').airMissions).toHaveLength(0) // refuses elsewhere
  })
})

describe('air-ops save/load (GameEngine)', () => {
  beforeEach(() => resetAirOpsState())

  function makeNation(id: NationId, name: string): Nation {
    return { id, name, economy: eco(), relations: { usa: 0, iran: 0 }, atWar: [] }
  }

  it('round-trips a mid-mission flight and finishes the mission after load', () => {
    const engine = new GameEngine()
    engine.initFromData('usa', { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }, [
      makeUnit({ id: 'cvn72_lincoln', nation: 'usa', category: 'carrier_group' }),
      makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27.5, lng: 52 } }),
    ], [], {})

    const station = destination(CARRIER_POS, 0, 30)
    engine.executeCommand({ type: 'LAUNCH_AIR_MISSION', kind: 'cap', squadronId: 'vfa14', fromUnitId: 'cvn72_lincoln', flightSize: 2, station })
    for (let i = 0; i < 120; i++) engine.tick()

    const mission = engine.state.airMissions![0]
    expect(mission.status).toBe('active')
    const flightId = mission.flightUnitId!
    const flightBefore = engine.state.units.get(flightId)!
    expect(flightBefore.flightMeta?.missionId).toBe(mission.id)
    const posBefore = { ...flightBefore.position }

    const loaded = new GameEngine()
    loaded.loadState(engine.getFullStateJson())
    const flightAfter = loaded.state.units.get(flightId)!
    expect(flightAfter.flightMeta).toEqual(flightBefore.flightMeta)
    expect(flightAfter.position).toEqual(posBefore)

    for (let i = 0; i < 120; i++) loaded.tick()
    expect(loaded.state.units.has(flightId)).toBe(true) // still flying after load

    loaded.executeCommand({ type: 'CANCEL_AIR_MISSION', missionId: mission.id })
    for (let i = 0; i < 600 && loaded.state.units.has(flightId); i++) loaded.tick()
    expect(loaded.state.units.has(flightId)).toBe(false)
    expect(loaded.state.airMissions![0].status).toBe('complete')

    const squadron = loaded.state.units.get('cvn72_lincoln')!.airWing!.find(s => s.id === 'vfa14')!
    expect(squadron.readyAt).toHaveLength(5) // 3 maintenance birds + 2 recovered
  })
})
