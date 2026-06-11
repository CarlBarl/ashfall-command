import type {
  AirMission,
  GameEvent,
  GameState,
  NationId,
  PilotFate,
  Position,
  SquadronState,
  Unit,
  UnitId,
} from '@/types/game'
import type { Command } from '@/types/commands'
import type { ElevationGrid } from './elevation'
import type { SeededRNG } from '../utils/rng'
import { AIR_WINGS } from '@/data/air/airwings'
import {
  AIRFRAMES,
  A2A_COMMIT_RANGE_KM,
  A2A_ENGAGE_RANGE_KM,
  A2A_ROLL_INTERVAL_TICKS,
  CAP_TURNAROUND_TICKS,
  EXTENDED_RANGE_BONUS,
  EXTENDED_RANGE_SORTIE_COST,
  MAINTENANCE_FRACTION,
  STRIKE_PLANNING_MIN_TICKS,
  STRIKE_PLANNING_MAX_TICKS,
  STRIKE_TURNAROUND_SURGE_TICKS,
  STRIKE_TURNAROUND_SUSTAINED_TICKS,
  SURGE_OPS_DURATION_TICKS,
  type AirframeSpec,
} from '@/data/air/airframes'
import { weaponSpecs } from '@/data/weapons/missiles'
import { launchMissile } from './combat'
import { getFireControlQuality, revealContact } from './visibility'
import { bearing, destination, haversine, ktsToKmh } from '../utils/geo'

/**
 * Air operations — squadrons as pools, flights as transient units, orders at
 * mission level only. Design: docs/plans/air-war-v5.md. All state lives on
 * GameState (airMissions, surgeOps, Unit.airWing, Unit.flightMeta) so
 * save/load is free.
 *
 * The Iranian scramble AI also lives here (scrambleInterceptors), called from
 * processAirOps instead of ai.ts — it reads only plain GameState (contacts,
 * wings, missions), so ai.ts needs no coupling to the air war.
 */

const EVAL_INTERVAL_TICKS = 60
const STATION_ARRIVE_KM = 5
const RECOVERY_RANGE_KM = 5
/** 4-point racetrack ring radius — legs come out ~20 km (design §3) */
const ORBIT_RING_KM = 14
const SEAD_ELINT_REVEAL_KM = 150
const STEALTH_DEFENSE_MULTIPLIER = 0.5
const SCRAMBLE_NATION: NationId = 'iran'
const SCRAMBLE_RADIUS_KM = 250
const MAX_SCRAMBLE_CAPS = 2
const SCRAMBLE_FLIGHT_SIZE = 2
const SU35_HOME_BASE_ID = 'mehrabad'

// Event/chase dedup only, never behavior-critical: the lifecycle re-derives
// RTB/orbit/intercept from GameState every pass, so after save/load (maps
// empty) the worst case is one duplicate FLIGHT_RTB feed item.
const onStationEmitted = new Set<string>()
const rtbEmitted = new Set<string>()
const capTargets = new Map<string, UnitId>()

export function resetAirOpsState(): void {
  resetAirMissionCounter()
  onStationEmitted.clear()
  rtbEmitted.clear()
  capTargets.clear()
}

/** Scenario init: attach air wings to hosts and stand down the maintenance fraction */
export function initAirWings(state: GameState): void {
  state.airMissions = []
  state.surgeOps = { enabled: false }
  for (const [unitId, squadrons] of Object.entries(AIR_WINGS)) {
    const host = state.units.get(unitId)
    if (!host) continue
    host.airWing = squadrons.map(s => {
      const down = Math.floor(s.total * MAINTENANCE_FRACTION)
      return {
        ...s,
        available: s.total - down,
        // Maintenance birds trickle back over the first 12-24 game-hours
        readyAt: Array.from({ length: down }, (_, i) => 12 * 3600 + i * Math.floor((12 * 3600) / Math.max(1, down))),
      }
    })
  }
}

export function findSquadron(state: GameState, squadronId: string): { host: Unit; squadron: SquadronState } | null {
  for (const unit of state.units.values()) {
    const squadron = unit.airWing?.find(s => s.id === squadronId)
    if (squadron) return { host: unit, squadron }
  }
  return null
}

let missionCounter = 0

/** Validate + record a mission. Lifecycle (spawn/orbit/strike/RTB) runs in processAirOps. */
export function launchAirMission(
  state: GameState,
  rng: SeededRNG,
  cmd: Extract<Command, { type: 'LAUNCH_AIR_MISSION' }>,
): void {
  const found = findSquadron(state, cmd.squadronId)
  if (!found || found.host.id !== cmd.fromUnitId || found.host.status === 'destroyed') return
  const spec = AIRFRAMES[found.squadron.airframe]
  if (!spec) return

  const flightSize = Math.max(2, Math.min(4, cmd.flightSize))
  if (found.squadron.available < flightSize) return
  if (cmd.kind === 'strike' && !cmd.targetId) return
  if ((cmd.kind === 'cap' || cmd.kind === 'aew') && !cmd.station) return
  if (cmd.kind === 'strike' && spec.strikeWeapons.length === 0) return
  if (cmd.kind === 'aew' && !spec.datalink_range_km) return

  const tick = state.time.tick
  const mission: AirMission = {
    id: `am_${++missionCounter}_${tick}`,
    kind: cmd.kind,
    nation: found.host.nation,
    squadronId: cmd.squadronId,
    fromUnitId: cmd.fromUnitId,
    flightSize,
    station: cmd.station ? { ...cmd.station } : undefined,
    targetId: cmd.targetId,
    escortSead: cmd.escortSead,
    extendedRange: cmd.extendedRange,
    status: cmd.kind === 'strike' ? 'planning' : 'active',
    createdTick: tick,
    planningCompleteTick:
      cmd.kind === 'strike'
        ? tick + STRIKE_PLANNING_MIN_TICKS + rng.int(0, STRIKE_PLANNING_MAX_TICKS - STRIKE_PLANNING_MIN_TICKS)
        : undefined,
  }
  ;(state.airMissions ??= []).push(mission)
}

export function cancelAirMission(state: GameState, missionId: string): void {
  const mission = state.airMissions?.find(m => m.id === missionId)
  if (!mission || mission.status === 'complete' || mission.status === 'aborted') return
  // Lifecycle in processAirOps sees 'aborted' and RTBs any airborne flight
  mission.status = 'aborted'
}

export function setSurgeOps(state: GameState, enabled: boolean): void {
  state.surgeOps ??= { enabled: false }
  if (enabled && !state.surgeOps.enabled) {
    state.surgeOps = { enabled: true, activatedTick: state.time.tick }
  } else if (!enabled) {
    state.surgeOps = { enabled: false, activatedTick: state.surgeOps.activatedTick }
  }
}

/** Surge window still open? (96 h from activation) */
export function surgeActive(state: GameState): boolean {
  const s = state.surgeOps
  if (!s?.enabled || s.activatedTick === undefined) return false
  return state.time.tick - s.activatedTick < SURGE_OPS_DURATION_TICKS
}

/**
 * Per-tick mission lifecycle — implemented per docs/plans/air-war-v5.md §3:
 * launch due missions (spawn Flight units), CAP orbit + auto-intercept with the
 * A2A pK model, strike transit/release via launchMissile, AEW station-keeping,
 * SEAD escort contact reveals, bingo/RTB, recovery + turnaround bookkeeping,
 * losses with pilot-fate rolls, and the Iranian scramble AI.
 *
 * Cheap arrival/release checks run every tick; expensive scans (intercept
 * search, SEAD reveal, scramble, ready clock) gate to game-minute boundaries.
 */
export function processAirOps(
  state: GameState,
  rng: SeededRNG,
  grid: ElevationGrid | null,
): void {
  const tick = state.time.tick
  const minuteBoundary = tick % EVAL_INTERVAL_TICKS === 0

  if (minuteBoundary) tickReadyClock(state)
  launchDueMissions(state)
  sweepDestroyedFlights(state, rng)

  const rolledPairs = new Set<string>()
  for (const mission of state.airMissions ?? []) {
    if (mission.status === 'complete' || !mission.flightUnitId) continue
    const flight = state.units.get(mission.flightUnitId)
    if (!flight || flight.status === 'destroyed' || !flight.flightMeta) continue

    const reason = rtbReason(state, mission, flight)
    if (reason) {
      handleRtb(state, mission, flight, reason, minuteBoundary)
      continue
    }
    if (mission.kind === 'strike') {
      handleStrikeTransit(state, mission, flight, grid, minuteBoundary)
      continue
    }
    const chasing = mission.kind === 'cap' &&
      updateCapIntercept(state, rng, mission, flight, minuteBoundary, rolledPairs)
    if (!chasing) keepStation(state, mission, flight)
  }

  if (minuteBoundary) {
    revealSeadContacts(state)
    scrambleInterceptors(state, rng)
  }
}

// ---------------------------------------------------------------------------
// Launch + ready clock
// ---------------------------------------------------------------------------

function launchDueMissions(state: GameState): void {
  const tick = state.time.tick
  for (const mission of state.airMissions ?? []) {
    if (mission.status === 'planning' &&
        mission.planningCompleteTick !== undefined && tick >= mission.planningCompleteTick) {
      mission.status = 'active'
    }
    if (mission.status !== 'active' || mission.flightUnitId) continue
    launchFlight(state, mission)
  }
}

function launchFlight(state: GameState, mission: AirMission): void {
  const tick = state.time.tick
  const found = findSquadron(state, mission.squadronId)
  const host = state.units.get(mission.fromUnitId)
  const spec = found ? AIRFRAMES[found.squadron.airframe] : undefined
  const target = mission.targetId ? state.units.get(mission.targetId) : undefined
  const dest = mission.kind === 'strike' ? target?.position : mission.station
  if (!found || !spec || !host || host.status === 'destroyed' || !dest ||
      (mission.kind === 'strike' && (!target || target.status === 'destroyed')) ||
      found.squadron.available < mission.flightSize) {
    mission.status = 'aborted'
    return
  }

  found.squadron.available -= mission.flightSize
  if (mission.extendedRange && host.nation === 'usa') {
    const tanker = host.airWing?.find(s => s.airframe === 'fa18e')
    if (tanker) {
      const cost = Math.min(EXTENDED_RANGE_SORTIE_COST, tanker.available)
      tanker.available -= cost
      // Buddy tankers fly a quick-turn cycle, not a combat sortie
      for (let i = 0; i < cost; i++) tanker.readyAt.push(tick + CAP_TURNAROUND_TICKS)
    }
  }

  const distKm = haversine(host.position, dest)
  const kmPerTick = ktsToKmh(spec.speed_kts) / 3600
  const radiusKm = spec.combat_radius_km * (mission.extendedRange ? EXTENDED_RANGE_BONUS : 1)
  // Bingo = out + back + loiter on whatever radius the transit didn't spend
  const bingoTick = tick + Math.ceil((2 * distKm + Math.max(0, 2 * (radiusKm - distKm))) / kmPerTick)
  const perLoadout = (countPerAirframe: number) => countPerAirframe * mission.flightSize

  const flight: Unit = {
    id: `flight_${mission.id}`,
    name: `${mission.flightSize}× ${spec.name} (${found.squadron.name})`,
    nation: mission.nation,
    category: 'aircraft',
    position: { ...host.position },
    heading: bearing(host.position, dest),
    speed_kts: 0,
    maxSpeed_kts: spec.speed_kts,
    status: 'moving',
    health: 100,
    maxHealth: 100,
    hardness: 60,
    logistics: 0,
    supplyStocks: [],
    weapons: mission.kind === 'strike'
      ? spec.strikeWeapons.map(w => ({
          weaponId: w.weaponId,
          count: perLoadout(w.countPerAirframe),
          maxCount: perLoadout(w.countPerAirframe),
          reloadTimeSec: 0,
        }))
      : [],
    pointDefense: [],
    sensors: spec.sensors.map(s => ({ ...s })),
    waypoints: [{ ...dest }],
    roe: 'weapons_free',
    subordinateIds: [],
    datalink_range_km: spec.datalink_range_km,
    flightMeta: {
      missionId: mission.id,
      bingoTick,
      rtbTo: host.id,
      a2aShots: (spec.a2a?.shots ?? 0) * mission.flightSize,
    },
  }
  state.units.set(flight.id, flight)
  mission.flightUnitId = flight.id
  emitAirEvent(state, {
    type: 'AIR_MISSION_LAUNCHED',
    missionId: mission.id,
    kind: mission.kind,
    flightName: flight.name,
    tick,
  })
}

/** Pop turnaround/maintenance airframes back into `available` (capped at total) */
function tickReadyClock(state: GameState): void {
  const tick = state.time.tick
  for (const unit of state.units.values()) {
    if (!unit.airWing) continue
    for (const s of unit.airWing) {
      if (s.readyAt.length === 0) continue
      const due = s.readyAt.filter(t => t <= tick).length
      if (due === 0) continue
      s.readyAt = s.readyAt.filter(t => t > tick)
      s.available = Math.min(s.total, s.available + due)
    }
  }
}

// ---------------------------------------------------------------------------
// RTB + recovery + losses
// ---------------------------------------------------------------------------

/**
 * RTB is derived, not flagged: every condition (abort, bingo, empty racks,
 * dead target, winchester) is recomputed from GameState so a save mid-RTB
 * resumes correctly without extra mission fields.
 */
function rtbReason(state: GameState, mission: AirMission, flight: Unit): string | null {
  const meta = flight.flightMeta
  if (!meta) return null
  if (mission.status === 'aborted') return 'mission aborted'
  if (state.time.tick >= meta.bingoTick) return 'bingo fuel'
  if (mission.kind === 'strike') {
    const target = mission.targetId ? state.units.get(mission.targetId) : undefined
    if (!target || target.status === 'destroyed') return 'target down'
    if (flight.weapons.length > 0 && flight.weapons.every(w => w.count <= 0)) return 'weapons released'
  }
  if (mission.kind === 'cap' && meta.a2aShots <= 0) return 'winchester'
  return null
}

function handleRtb(
  state: GameState,
  mission: AirMission,
  flight: Unit,
  reason: string,
  minuteBoundary: boolean,
): void {
  const meta = flight.flightMeta
  if (!meta) return

  let host = state.units.get(meta.rtbTo)
  if (!host || host.status === 'destroyed') {
    const divert = findDivertField(state, flight)
    if (!divert) {
      loseFlight(state, mission, flight, 'rescued', true)
      return
    }
    meta.rtbTo = divert.id
    host = divert
  }

  if (!rtbEmitted.has(mission.id)) {
    rtbEmitted.add(mission.id)
    emitAirEvent(state, {
      type: 'FLIGHT_RTB',
      missionId: mission.id,
      flightName: flight.name,
      reason,
      tick: state.time.tick,
    })
    flight.waypoints = [{ ...host.position }]
  } else if (minuteBoundary || flight.waypoints.length === 0) {
    // Carriers move — re-steer at the host's live position
    flight.waypoints = [{ ...host.position }]
  }

  if (haversine(flight.position, host.position) <= RECOVERY_RANGE_KM) {
    recoverFlight(state, mission, flight)
  }
}

function recoverFlight(state: GameState, mission: AirMission, flight: Unit): void {
  state.units.delete(flight.id)
  const found = findSquadron(state, mission.squadronId)
  if (found) {
    const turnaround = mission.kind === 'cap'
      ? CAP_TURNAROUND_TICKS
      : surgeActive(state) ? STRIKE_TURNAROUND_SURGE_TICKS : STRIKE_TURNAROUND_SUSTAINED_TICKS
    for (let i = 0; i < mission.flightSize; i++) {
      found.squadron.readyAt.push(state.time.tick + turnaround)
    }
  }
  completeMission(mission)
}

function findDivertField(state: GameState, flight: Unit): Unit | null {
  let best: Unit | null = null
  let bestDist = Infinity
  for (const u of state.units.values()) {
    if (u.nation !== flight.nation || u.status === 'destroyed' || !u.airWing) continue
    if (u.category !== 'airbase' && u.category !== 'carrier_group') continue
    const d = haversine(flight.position, u.position)
    if (d < bestDist) {
      best = u
      bestDist = d
    }
  }
  return best
}

/** Flights destroyed by SAMs/combat: report the loss; airframes never come back */
function sweepDestroyedFlights(state: GameState, rng: SeededRNG): void {
  for (const mission of state.airMissions ?? []) {
    if (mission.status === 'complete' || !mission.flightUnitId) continue
    const flight = state.units.get(mission.flightUnitId)
    if (!flight) {
      completeMission(mission)
      continue
    }
    if (flight.status !== 'destroyed') continue
    loseFlight(state, mission, flight, rollPilotFate(rng), false)
  }
}

function loseFlight(
  state: GameState,
  mission: AirMission,
  flight: Unit,
  pilotFate: PilotFate,
  removeUnit: boolean,
): void {
  emitAirEvent(state, {
    type: 'FLIGHT_LOST',
    missionId: mission.id,
    flightName: flight.name,
    airframesLost: mission.flightSize,
    pilotFate,
    tick: state.time.tick,
  })
  const found = findSquadron(state, mission.squadronId)
  if (found) {
    found.squadron.total = Math.max(0, found.squadron.total - mission.flightSize)
    found.squadron.available = Math.min(found.squadron.available, found.squadron.total)
  }
  if (removeUnit) state.units.delete(flight.id)
  completeMission(mission)
}

function rollPilotFate(rng: SeededRNG): PilotFate {
  const r = rng.next()
  return r < 0.4 ? 'kia' : r < 0.8 ? 'rescued' : 'pow'
}

function completeMission(mission: AirMission): void {
  mission.status = 'complete'
  onStationEmitted.delete(mission.id)
  rtbEmitted.delete(mission.id)
  capTargets.delete(mission.id)
}

// ---------------------------------------------------------------------------
// CAP / AEW station keeping + A2A intercept
// ---------------------------------------------------------------------------

function keepStation(state: GameState, mission: AirMission, flight: Unit): void {
  const station = mission.station
  if (!station) return
  const dist = haversine(flight.position, station)
  if (dist <= STATION_ARRIVE_KM && !onStationEmitted.has(mission.id)) {
    onStationEmitted.add(mission.id)
    emitAirEvent(state, {
      type: 'FLIGHT_ON_STATION',
      missionId: mission.id,
      flightName: flight.name,
      tick: state.time.tick,
    })
  }
  if (flight.waypoints.length === 0) {
    flight.waypoints = dist <= ORBIT_RING_KM + STATION_ARRIVE_KM
      ? [0, 90, 180, 270].map(b => destination(station, b, ORBIT_RING_KM))
      : [{ ...station }]
  }
}

/** Returns true while the CAP is committed on an intercept (skips station keeping) */
function updateCapIntercept(
  state: GameState,
  rng: SeededRNG,
  mission: AirMission,
  flight: Unit,
  minuteBoundary: boolean,
  rolledPairs: Set<string>,
): boolean {
  if (minuteBoundary) {
    const target = findInterceptTarget(state, flight)
    if (target) capTargets.set(mission.id, target.id)
    else capTargets.delete(mission.id)
  }
  const targetId = capTargets.get(mission.id)
  if (!targetId) return false
  const target = state.units.get(targetId)
  if (!target || target.status === 'destroyed') {
    capTargets.delete(mission.id)
    return false
  }

  if (minuteBoundary || flight.waypoints.length === 0) {
    flight.waypoints = [{ ...target.position }]
  }

  if (state.time.tick % A2A_ROLL_INTERVAL_TICKS === 0 &&
      haversine(flight.position, target.position) <= A2A_ENGAGE_RANGE_KM) {
    const pairKey = [flight.id, target.id].sort().join('|')
    if (!rolledPairs.has(pairKey)) {
      rolledPairs.add(pairKey)
      resolveA2AExchange(state, rng, flight, target)
    }
  }
  return true
}

/** Nearest live enemy aircraft with a tracked+ contact inside commit range. Never non-aircraft. */
function findInterceptTarget(state: GameState, flight: Unit): Unit | null {
  if (flight.roe !== 'weapons_free') return null
  const nation = state.nations[flight.nation]
  if (!nation || nation.atWar.length === 0) return null
  const enemies = new Set(nation.atWar)
  const contacts = state.visibility?.[flight.nation as string]
  if (!contacts) return null

  let best: Unit | null = null
  let bestDist = Infinity
  for (const u of state.units.values()) {
    if (!enemies.has(u.nation) || u.category !== 'aircraft' || u.status === 'destroyed') continue
    const c = contacts[u.id]
    if (!c || (c.level !== 'tracked' && c.level !== 'identified')) continue
    const d = haversine(flight.position, u.position)
    if (d <= A2A_COMMIT_RANGE_KM && d < bestDist) {
      best = u
      bestDist = d
    }
  }
  return best
}

/** One exchange per pair per interval: attacker shoots, surviving armed defender shoots back */
function resolveA2AExchange(state: GameState, rng: SeededRNG, attacker: Unit, defender: Unit): void {
  rollA2AShot(state, rng, attacker, defender)
  if (defender.status !== 'destroyed' && defender.flightMeta && defender.roe !== 'hold_fire') {
    rollA2AShot(state, rng, defender, attacker)
  }
}

function rollA2AShot(state: GameState, rng: SeededRNG, shooter: Unit, target: Unit): void {
  const meta = shooter.flightMeta
  const a2a = flightAirframe(state, shooter)?.a2a
  if (!meta || !a2a || meta.a2aShots <= 0) return
  meta.a2aShots--

  const rcs = flightAirframe(state, target)?.rcsClass ?? 'fighter'
  let pk = rcs === 'large' ? a2a.pkLarge : a2a.pkFighter
  if (rcs === 'stealth') pk *= STEALTH_DEFENSE_MULTIPLIER

  const killed = rng.chance(pk)
  emitAirEvent(state, {
    type: 'AIR_INTERCEPT',
    attackerName: shooter.name,
    defenderName: target.name,
    kills: killed ? 1 : 0,
    tick: state.time.tick,
  })
  if (killed) applyA2AKill(state, rng, target)
}

/** Each kill downs one airframe: 100/flightSize damage; at 0 the flight is gone */
function applyA2AKill(state: GameState, rng: SeededRNG, victim: Unit): void {
  const mission = missionOfFlight(state, victim)
  const damage = Math.ceil(100 / (mission?.flightSize ?? 1))
  victim.health = Math.max(0, victim.health - damage)
  if (victim.health > 0) return

  victim.status = 'destroyed'
  victim.speed_kts = 0
  victim.waypoints = []
  emitAirEvent(state, { type: 'UNIT_DESTROYED', unitId: victim.id, tick: state.time.tick })
  state.attackCounters ??= {}
  state.attackCounters[victim.nation] = (state.attackCounters[victim.nation] ?? 0) + 1
  if (!mission) {
    // Plain aircraft unit (no mission) — the destroyed-flight sweep won't report it
    emitAirEvent(state, {
      type: 'FLIGHT_LOST',
      flightName: victim.name,
      airframesLost: 1,
      pilotFate: rollPilotFate(rng),
      tick: state.time.tick,
    })
  }
  // Mission flights get FLIGHT_LOST + bookkeeping from sweepDestroyedFlights next tick
}

function missionOfFlight(state: GameState, unit: Unit): AirMission | null {
  if (!unit.flightMeta) return null
  return state.airMissions?.find(m => m.id === unit.flightMeta?.missionId) ?? null
}

function flightAirframe(state: GameState, unit: Unit): AirframeSpec | null {
  const mission = missionOfFlight(state, unit)
  if (!mission) return null
  const found = findSquadron(state, mission.squadronId)
  return found ? AIRFRAMES[found.squadron.airframe] : null
}

// ---------------------------------------------------------------------------
// Strike transit + weapons release
// ---------------------------------------------------------------------------

function handleStrikeTransit(
  state: GameState,
  mission: AirMission,
  flight: Unit,
  grid: ElevationGrid | null,
  minuteBoundary: boolean,
): void {
  const target = mission.targetId ? state.units.get(mission.targetId) : undefined
  if (!target || target.status === 'destroyed') return // rtbReason turns them home next pass

  const releaseKm = releaseRangeKm(flight)
  if (releaseKm > 0 && haversine(flight.position, target.position) <= releaseKm) {
    releaseWeapons(state, flight, target, grid)
    return
  }
  if (minuteBoundary || flight.waypoints.length === 0) {
    flight.waypoints = [{ ...target.position }]
  }
}

/** Release at 90% of the shortest-legged weapon so every rack can fire */
function releaseRangeKm(flight: Unit): number {
  let min = Infinity
  for (const w of flight.weapons) {
    if (w.count <= 0) continue
    const spec = weaponSpecs[w.weaponId]
    if (spec && spec.range_km < min) min = spec.range_km
  }
  return Number.isFinite(min) ? min * 0.9 : 0
}

function releaseWeapons(state: GameState, flight: Unit, target: Unit, grid: ElevationGrid | null): void {
  const quality = getFireControlQuality(state, flight, target, grid) ?? 'datalink'
  let fired = 0
  for (const loadout of flight.weapons) {
    while (loadout.count > 0) {
      const event = launchMissile(state, flight.id, loadout.weaponId, target.id, undefined, quality)
      if (!event) break
      emitAirEvent(state, event)
      fired++
    }
  }
  // Empty racks flip rtbReason to 'weapons released' on the next pass
  if (fired > 0) declareAirWar(state, flight.nation, target.nation)
}

/** Air strikes are hostile acts — mirror the LAUNCH_MISSILE command's war transition */
function declareAirWar(state: GameState, attacker: NationId, defender: NationId): void {
  if (attacker === defender) return
  const a = state.nations[attacker]
  const d = state.nations[defender]
  if (!a || !d || a.atWar.includes(defender)) return
  a.atWar.push(defender)
  if (!d.atWar.includes(attacker)) d.atWar.push(attacker)
  emitAirEvent(state, { type: 'WAR_DECLARED', attacker, defender, tick: state.time.tick })
}

// ---------------------------------------------------------------------------
// SEAD escort — ELINT reveal only
// ---------------------------------------------------------------------------

/**
 * EA-18G escort: emitting enemy SAMs near the escorted flight become 'detected'
 * contacts each minute. The design's SAM detect/pk ×0.6 vs the escorted flight
 * needs combat.ts coupling — BACKLOG, not implemented here.
 */
function revealSeadContacts(state: GameState): void {
  for (const mission of state.airMissions ?? []) {
    if (!mission.escortSead || mission.status === 'complete' || !mission.flightUnitId) continue
    const flight = state.units.get(mission.flightUnitId)
    if (!flight || flight.status === 'destroyed') continue
    for (const sam of state.units.values()) {
      if (sam.nation === flight.nation || sam.category !== 'sam_site' || sam.status === 'destroyed') continue
      if (sam.emcon || !sam.sensors.some(s => s.type === 'radar' && s.range_km > 0)) continue
      if (haversine(flight.position, sam.position) <= SEAD_ELINT_REVEAL_KM) {
        revealContact(state, flight.nation as string, sam, 'detected')
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Iranian scramble AI — reactive CAP only (design §3 "Iran AI")
// ---------------------------------------------------------------------------

function scrambleInterceptors(state: GameState, rng: SeededRNG): void {
  if (state.playerNation === SCRAMBLE_NATION) return
  const iran = state.nations[SCRAMBLE_NATION]
  if (!iran || iran.atWar.length === 0) return
  const contacts = state.visibility?.[SCRAMBLE_NATION]
  if (!contacts) return

  let liveCaps = 0
  for (const m of state.airMissions ?? []) {
    if (m.nation === SCRAMBLE_NATION && m.kind === 'cap' &&
        m.status !== 'complete' && m.status !== 'aborted') liveCaps++
  }
  if (liveCaps >= MAX_SCRAMBLE_CAPS) return

  const enemies = new Set(iran.atWar)
  const su35Home = state.units.get(SU35_HOME_BASE_ID)

  for (const threat of state.units.values()) {
    if (liveCaps >= MAX_SCRAMBLE_CAPS) break
    if (!enemies.has(threat.nation) || threat.category !== 'aircraft' || threat.status === 'destroyed') continue
    if (!contacts[threat.id]) continue

    let bestBase: Unit | null = null
    let bestSquadron: SquadronState | null = null
    let bestDist = Infinity
    for (const base of state.units.values()) {
      if (base.nation !== SCRAMBLE_NATION || base.category !== 'airbase' ||
          base.status === 'destroyed' || !base.airWing) continue
      const dist = haversine(base.position, threat.position)
      if (dist > SCRAMBLE_RADIUS_KM || dist >= bestDist) continue
      const squadron = base.airWing.find(s => {
        if (s.available < SCRAMBLE_FLIGHT_SIZE || !AIRFRAMES[s.airframe]?.a2a) return false
        if (s.airframe === 'su35') {
          // Su-35s defend the capital axis only
          return su35Home !== undefined && haversine(su35Home.position, threat.position) <= SCRAMBLE_RADIUS_KM
        }
        return true
      })
      if (squadron) {
        bestBase = base
        bestSquadron = squadron
        bestDist = dist
      }
    }
    if (!bestBase || !bestSquadron) continue

    const before = state.airMissions?.length ?? 0
    launchAirMission(state, rng, {
      type: 'LAUNCH_AIR_MISSION',
      kind: 'cap',
      squadronId: bestSquadron.id,
      fromUnitId: bestBase.id,
      flightSize: SCRAMBLE_FLIGHT_SIZE,
      station: midpoint(bestBase.position, threat.position),
    })
    if ((state.airMissions?.length ?? 0) > before) liveCaps++
  }
}

function midpoint(a: Position, b: Position): Position {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

// ---------------------------------------------------------------------------
// View / events / counters
// ---------------------------------------------------------------------------

/** Player-nation mission slice for the snapshot */
export function getAirMissionsView(state: GameState, nation: NationId): AirMission[] {
  return (state.airMissions ?? [])
    .filter(m => m.nation === nation)
    .map(m => ({ ...m, station: m.station ? { ...m.station } : undefined }))
}

export function emitAirEvent(state: GameState, event: GameEvent): void {
  state.events.push(event)
  if (state.events.length > 2000) state.events.splice(0, state.events.length - 2000)
  state.pendingEvents.push(event)
}

/** Restore the mission id counter after load so new ids never collide */
export function setAirMissionCounter(state: GameState): void {
  let max = 0
  for (const m of state.airMissions ?? []) {
    const n = /^am_(\d+)_/.exec(m.id)
    if (n) max = Math.max(max, Number(n[1]))
  }
  missionCounter = max
}

export function resetAirMissionCounter(): void {
  missionCounter = 0
}
