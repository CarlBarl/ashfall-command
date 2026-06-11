import type {
  AirMission,
  GameEvent,
  GameState,
  NationId,
  SquadronState,
  Unit,
} from '@/types/game'
import type { Command } from '@/types/commands'
import type { ElevationGrid } from './elevation'
import type { SeededRNG } from '../utils/rng'
import { AIR_WINGS } from '@/data/air/airwings'
import {
  AIRFRAMES,
  MAINTENANCE_FRACTION,
  STRIKE_PLANNING_MIN_TICKS,
  STRIKE_PLANNING_MAX_TICKS,
  SURGE_OPS_DURATION_TICKS,
} from '@/data/air/airframes'

/**
 * Air operations — squadrons as pools, flights as transient units, orders at
 * mission level only. Design: docs/plans/air-war-v5.md. All state lives on
 * GameState (airMissions, surgeOps, Unit.airWing, Unit.flightMeta) so
 * save/load is free.
 */

export function resetAirOpsState(): void {
  resetAirMissionCounter()
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
 * SEAD escort effects, bingo/RTB, recovery + turnaround bookkeeping, losses
 * with pilot-fate rolls, and the Iranian scramble AI hook.
 */
export function processAirOps(
  state: GameState,
  rng: SeededRNG,
  grid: ElevationGrid | null,
): void {
  // C1 implements — contracts above are frozen.
  void state
  void rng
  void grid
}

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
