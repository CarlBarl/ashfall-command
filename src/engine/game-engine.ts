import type { GameState, GameEvent, NationId, ScheduledLaunch, Unit, UnitId } from '@/types/game'
import type { GameViewState, ViewUnit } from '@/types/view'
import type { Command } from '@/types/commands'
import { SeededRNG } from './utils/rng'
import { processMovement } from './systems/movement'
import { resetDetectionCache } from './systems/detection'
import { processCombat, launchMissile, launchSAM, resetCombatState, setCombatCounters } from './systems/combat'
import { processScheduledLaunches, scheduleSalvo } from './systems/strike-scheduler'
import { processAI, resetAIState, orientSAMRadars } from './systems/ai'
import { processEconomy } from './systems/economy'
import { processOrders, resetOrdersState } from './systems/orders'
import { processFriendlyAI, resetFriendlyAIState } from './systems/friendly-ai'
import { processLogistics, resetLogisticsState } from './systems/logistics'
import { processPointDefense, resetPointDefenseState } from './systems/point-defense'
import { processRepair, resetRepairState } from './systems/repair'
import { processReadiness } from './systems/readiness'
// Register drone weapon specs + patch interceptor pK values
import '@/data/weapons/drones'
import { patchDronePK } from '@/data/weapons/drone-pk-patch'
import { resetDroneAIState } from './systems/drone-ai'
import { ElevationGrid } from './systems/elevation'
import { buildSensorNetwork, type SensorNetwork } from './systems/sensor-network'
import { processSatellites, resetSatelliteState, getSatelliteDetections } from './systems/satellites'
import { processEspionage, type EspionageResult } from './systems/espionage'
import { findNavalRoute } from './systems/route-planner'
import type { SatellitePass } from '@/types/game'
import { processShipping, resetShippingState } from './systems/shipping'
import { shippingLanes as defaultShippingLanes } from '@/data/shipping/shipping-lanes'
import { processVisibility, resetVisibilityState, seedInitialVisibility, getViewVisibility, contactDisplayName, type ViewVisibility } from './systems/visibility'
import { processWarSupport, resetWarSupportState, offerCeasefire, acceptCeasefire, resign, getWarSupport, getObjectives } from './systems/war-support'
import { processIntel, initIntelState, resetIntelState, taskSatellitePass, taskAgent, restAgent, exfiltrateAgent, opsecSweep, maybeLeakStrike, paranoiaBand } from './systems/intel'
import { processAirOps, initAirWings, resetAirOpsState, setAirMissionCounter, launchAirMission, cancelAirMission, setSurgeOps, surgeActive, getAirMissionsView } from './systems/air-ops'
import type { IntelViewState } from '@/types/view'

const TICK_MS = 1_000 // 1 tick = 1 game second (real-time at 1x)
const SCENARIO_START = new Date('2026-06-15T06:00:00Z').getTime()

/** Bump whenever the save format changes incompatibly — loadState rejects mismatches */
export const SAVE_SCHEMA_VERSION = 1

function createEmptyState(): GameState {
  return {
    playerNation: 'usa',
    initialized: false,
    time: { tick: 0, timestamp: SCENARIO_START, speed: 0, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: 100, iran: 0 }, atWar: [] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 0, military_budget_billions: 0, military_budget_pct_gdp: 0, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 0 }, relations: { usa: 0, iran: 100 }, atWar: [] },
    },
    units: new Map(),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
    attackCounters: {},
  }
}

export class GameEngine {
  state: GameState
  rng: SeededRNG
  elevationGrid: ElevationGrid | null = null
  sensorNetwork: SensorNetwork | null = null
  lastEspionageResult: EspionageResult | null = null

  constructor() {
    this.rng = new SeededRNG(42)
    patchDronePK()

    // Start with empty uninitialized state — initGame() populates it
    this.state = createEmptyState()
  }

  setElevationGrid(grid: ElevationGrid): void {
    this.elevationGrid = grid
  }

  /** Initialize from scenario data (used by the game mode menu) */
  initFromData(
    playerNation: NationId,
    nations: Record<string, import('@/types/game').Nation>,
    unitList: Unit[],
    supplyLines: import('@/types/game').SupplyLine[],
    baseSupply: Record<string, import('@/types/game').WeaponStock[]>,
    startDate?: string,
  ): void {
    // The worker holds one engine for the whole session — clear module-level
    // system state so a new game doesn't inherit the previous game's
    this.resetAllSystems()

    const units = new Map<UnitId, Unit>()
    for (const u of unitList) {
      units.set(u.id, { ...u })
    }

    const timestamp = startDate ? new Date(startDate).getTime() : SCENARIO_START

    this.state = {
      playerNation,
      initialized: true,
      time: { tick: 0, timestamp, speed: 0, tickIntervalMs: 100 },
      nations,
      units,
      missiles: new Map(),
      supplyLines: new Map<string, import('@/types/game').SupplyLine>(),
      shippingLanes: new Map(),
      events: [],
      pendingEvents: [],
      attackCounters: {},
    }

    for (const [unitId, stocks] of Object.entries(baseSupply)) {
      const unit = this.state.units.get(unitId)
      if (unit) {
        unit.supplyStocks = stocks
        unit.logistics = 100
      }
    }
    for (const line of supplyLines) {
      this.state.supplyLines.set(line.id, { ...line })
    }
    for (const lane of defaultShippingLanes) {
      this.state.shippingLanes.set(lane.id, { ...lane })
    }

    // Initialize intel budgets for all nations that don't have one
    for (const nation of Object.values(this.state.nations)) {
      if (!nation.intelBudget) {
        nation.intelBudget = { total_pct: 10, humint_pct: 40, sigint_pct: 30, satellite_pct: 30 }
      }
    }

    // Orient sector-limited SAMs toward enemy before first tick
    orientSAMRadars(this.state)

    // Fixed installations are public knowledge — both sides start with them on the map
    seedInitialVisibility(this.state)

    // Intel suite: ISR assets, HUMINT roster, counterintel meters
    initIntelState(this.state)

    // Air war: squadron pools on carriers/airbases
    initAirWings(this.state)

    // Initialize satellite constellations (only for modern scenarios with USA/Iran)
    if (this.state.nations.usa && this.state.nations.iran) {
      this.initSatellites()
    }
  }

  /** Advance simulation by one tick */
  tick(): void {
    if (!this.state.initialized) return
    const { state } = this
    state.time.tick++
    state.time.timestamp += TICK_MS

    processMovement(state, this.elevationGrid)
    processReadiness(state)

    // Build sensor network graph for this tick (used by combat for networked detection)
    this.sensorNetwork = buildSensorNetwork(state, this.elevationGrid)

    // ROE enforcement before combat
    processOrders(state, this.elevationGrid)

    // Engine-side salvo spacing — runs before combat so due rounds join this tick's air picture
    processScheduledLaunches(state, (entry) => this.fireScheduledLaunch(entry))

    processCombat(state, this.rng, this.elevationGrid, this.sensorNetwork)
    processPointDefense(state, this.rng)
    processShipping(state, this.rng)
    processEconomy(state)
    processLogistics(state)
    processRepair(state)

    // Autonomous engagement of tracked contacts (any nation, ROE-gated)
    const friendlyCmds = processFriendlyAI(state, this.rng, this.elevationGrid)
    // Enemy AI generates commands
    const aiCommands = processAI(state, this.rng, this.elevationGrid)
    for (const cmd of [...friendlyCmds, ...aiCommands]) {
      this.executeCommand(cmd)
    }

    // Satellite reconnaissance passes
    processSatellites(state)

    // Espionage: HUMINT reveals + SIGINT multiplier
    this.lastEspionageResult = processEspionage(state, this.rng)

    // Fog of war: fold radar/satellite/HUMINT/ELINT pictures into per-nation contacts
    processVisibility(state, this.sensorNetwork, this.lastEspionageResult, this.elevationGrid)

    // Intel suite: satellite taskings, SIGINT intercepts, HUMINT, counterintel
    processIntel(state, this.rng, this.elevationGrid)

    // Air operations: mission lifecycle, CAP intercepts, strikes, RTB
    processAirOps(state, this.rng, this.elevationGrid)

    // Political will: war-support drains, ceasefire logic, capitulation, objectives
    processWarSupport(state)

    // Cap pendingEvents to prevent unbounded growth during fast-forward
    if (state.pendingEvents.length > 2000) {
      state.pendingEvents.splice(0, state.pendingEvents.length - 2000)
    }
  }

  /** Execute a player command */
  executeCommand(cmd: Command): void {
    const { state } = this
    switch (cmd.type) {
      case 'SET_SPEED':
        state.time.speed = cmd.speed
        break
      case 'DECLARE_WAR': {
        this.declareWar(state.playerNation, cmd.target)
        break
      }
      case 'SET_ROE': {
        const unit = state.units.get(cmd.unitId)
        if (unit) unit.roe = cmd.roe
        break
      }
      case 'MOVE_UNIT': {
        const unit = state.units.get(cmd.unitId)
        if (unit) {
          // Land units can't be ordered into the sea — reject up front with feedback
          const isLandMover = unit.category === 'missile_battery' || unit.category === 'sam_site'
          const dest = cmd.waypoints[cmd.waypoints.length - 1]
          if (isLandMover && dest && this.elevationGrid?.isWater(dest.lat, dest.lng)) {
            this.emitEvent({
              type: 'ORDER_REJECTED',
              unitId: unit.id,
              reason: 'destination is open water',
              tick: state.time.tick,
            })
            break
          }
          if (unit.deploy_time_sec != null) {
            // Unit has readiness lifecycle (mobile SAMs, TELs)
            if (unit.readiness === 'deployed') {
              // Start packing — store waypoints but don't move yet
              unit.readiness = 'packing'
              unit.readinessTimer = unit.pack_time_sec ?? 300
              unit.waypoints = cmd.waypoints
            } else if (unit.readiness === 'moving') {
              // Already moving — just update waypoints
              unit.waypoints = cmd.waypoints
              unit.status = 'moving'
            }
            // If packing or deploying, reject silently (unit is transitioning)
          } else {
            // No readiness lifecycle (ships, aircraft, etc.) — move immediately
            const isNaval = unit.category === 'ship' || unit.category === 'submarine' || unit.category === 'carrier_group'
            if (isNaval && this.elevationGrid && cmd.waypoints.length > 0) {
              // Auto-route naval units around land, honoring every player waypoint as a leg
              const routed: typeof cmd.waypoints = []
              let from = unit.position
              for (const wp of cmd.waypoints) {
                const leg = findNavalRoute(from, wp, this.elevationGrid)
                if (leg) routed.push(...leg)
                routed.push(wp)
                from = wp
              }
              unit.waypoints = routed
            } else {
              unit.waypoints = cmd.waypoints
            }
            unit.status = 'moving'
          }
        }
        break
      }
      case 'LAUNCH_MISSILE': {
        const compromised = this.applyStrikeLeak(cmd.launcherId, cmd.targetId, cmd.trackQuality)
        const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId, cmd.waypoints, cmd.trackQuality, compromised)
        if (event) {
          const launcher = state.units.get(cmd.launcherId)
          const target = state.units.get(cmd.targetId)
          // A successful offensive launch is a hostile act; enter war state immediately.
          if (launcher && target && launcher.nation !== target.nation) {
            this.declareWar(launcher.nation, target.nation)
          }
          this.emitEvent(event)
        }
        break
      }
      case 'LAUNCH_SALVO': {
        if (cmd.count <= 0) break

        const compromised = this.applyStrikeLeak(cmd.launcherId, cmd.targetId, undefined)

        // TOT path: a delayed first round can't fire "now" — queue the whole salvo
        if ((cmd.delayTicks ?? 0) > 0) {
          scheduleSalvo(state, cmd, compromised)
          break
        }

        const spacing = cmd.spacingTicks ?? 0
        if (spacing > 0) {
          // First round fires now (war declaration + the salvo's single leak roll just
          // happened); the rest are scheduled on GameState and reuse the same roll.
          const fired = this.fireScheduledLaunch({
            dueTick: state.time.tick,
            launcherId: cmd.launcherId,
            weaponId: cmd.weaponId,
            targetId: cmd.targetId,
            waypoints: cmd.waypoints,
            compromised,
          })
          if (!fired) break // whole salvo would have failed today — don't queue duds

          state.scheduledLaunches ??= []
          for (let i = 1; i < cmd.count; i++) {
            state.scheduledLaunches.push({
              dueTick: state.time.tick + i * spacing,
              launcherId: cmd.launcherId,
              weaponId: cmd.weaponId,
              targetId: cmd.targetId,
              waypoints: cmd.waypoints,
              compromised,
            })
          }
          break
        }

        let declaredWar = false
        for (let i = 0; i < cmd.count; i++) {
          const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId, cmd.waypoints, undefined, compromised)
          if (!event) break

          if (!declaredWar) {
            const launcher = state.units.get(cmd.launcherId)
            const target = state.units.get(cmd.targetId)
            // The first successful shot in a salvo is enough to transition both nations to war.
            if (launcher && target && launcher.nation !== target.nation) {
              this.declareWar(launcher.nation, target.nation)
              declaredWar = true
            }
          }

          this.emitEvent(event)
        }
        break
      }
      case 'LAUNCH_SAM': {
        launchSAM(state, cmd.launcherId, cmd.weaponId, cmd.missileId, this.rng)
        break
      }
      case 'CEASE_FIRE': {
        acceptCeasefire(state, state.playerNation, cmd.target)
        break
      }
      case 'OFFER_CEASEFIRE': {
        offerCeasefire(state, state.playerNation, cmd.target)
        break
      }
      case 'RESIGN': {
        resign(state)
        break
      }
      case 'SET_HEADING': {
        const unit = state.units.get(cmd.unitId)
        if (unit) unit.heading = cmd.heading
        break
      }
      case 'SET_INTEL_BUDGET': {
        const nation = state.nations[state.playerNation]
        if (nation) nation.intelBudget = cmd.budget
        break
      }
      case 'SET_DRONE_MISSION': {
        const unit = state.units.get(cmd.unitId)
        if (unit) unit.droneMission = cmd.mission
        break
      }
      case 'TASK_SATELLITE_PASS': {
        taskSatellitePass(state, cmd.assetId, cmd.target, cmd.cloudPct)
        break
      }
      case 'TASK_AGENT': {
        taskAgent(state, this.rng, cmd.agentId)
        break
      }
      case 'REST_AGENT': {
        restAgent(state, cmd.agentId)
        break
      }
      case 'EXFILTRATE_AGENT': {
        exfiltrateAgent(state, cmd.agentId)
        break
      }
      case 'OPSEC_SWEEP': {
        opsecSweep(state)
        break
      }
      case 'SET_EMCON': {
        const unit = state.units.get(cmd.unitId)
        if (unit) unit.emcon = cmd.emcon
        break
      }
      case 'LAUNCH_AIR_MISSION': {
        launchAirMission(state, this.rng, cmd)
        break
      }
      case 'CANCEL_AIR_MISSION': {
        cancelAirMission(state, cmd.missionId)
        break
      }
      case 'SET_SURGE_OPS': {
        setSurgeOps(state, cmd.enabled)
        break
      }
    }
  }

  /**
   * Deliberate player strikes (strike panel, no auto-fire trackQuality) feed Iranian
   * pattern analysis: bump the leak level and possibly compromise this launch.
   */
  private applyStrikeLeak(launcherId: UnitId, targetId: UnitId, trackQuality?: import('@/types/game').TrackQuality): boolean {
    const { state } = this
    if (trackQuality) return false // reactive auto-engagement, not a planned strike
    const intel = state.intel
    const launcher = state.units.get(launcherId)
    const target = state.units.get(targetId)
    if (!intel || !launcher || !target) return false
    if (launcher.nation !== state.playerNation || target.nation === state.playerNation) return false
    intel.leakLevel = Math.min(100, intel.leakLevel + 5)
    return maybeLeakStrike(state, this.rng, targetId)
  }

  /**
   * Same side effects as the LAUNCH_MISSILE command minus the leak roll — that
   * happened once when the salvo was commanded and the entry carries the result.
   */
  private fireScheduledLaunch(entry: ScheduledLaunch): boolean {
    const { state } = this
    // launchMissile doesn't check status — destroyed units keep their loadout
    const launcher = state.units.get(entry.launcherId)
    const target = state.units.get(entry.targetId)
    if (!launcher || launcher.status === 'destroyed') return false
    if (!target || target.status === 'destroyed') return false

    const event = launchMissile(state, entry.launcherId, entry.weaponId, entry.targetId, entry.waypoints, entry.trackQuality, entry.compromised)
    if (!event) return false

    if (launcher.nation !== target.nation) {
      this.declareWar(launcher.nation, target.nation)
    }
    this.emitEvent(event)
    return true
  }

  /** Get serializable snapshot for the main thread */
  getViewState(): GameViewState {
    const { state } = this
    const events = [...state.pendingEvents]
    state.pendingEvents = [] // one-shot delivery

    const units: ViewUnit[] = []
    for (const u of state.units.values()) {
      const vis = getViewVisibility(state, state.playerNation, u)
      if (vis) units.push(toViewUnit(u, vis, state.playerNation))
    }

    return {
      playerNation: state.playerNation,
      initialized: state.initialized,
      time: { ...state.time },
      nations: Object.values(state.nations),
      units,
      missiles: Array.from(state.missiles.values()),
      supplyLines: Array.from(state.supplyLines.values()),
      shippingLanes: Array.from(state.shippingLanes.values()),
      events,
      pendingEventCount: state.events.length,
      satelliteDetectedUnitIds: Array.from(getSatelliteDetections(state.playerNation, state.time.tick)),
      warSupport: getWarSupport(state),
      gameOver: state.gameOver ?? null,
      objectives: getObjectives(state),
      intel: this.getIntelViewState(),
      airMissions: getAirMissionsView(state, state.playerNation),
      surgeOps: surgeActive(state),
    }
  }

  /** Player-nation slice of the intel suite — exact paranoia stays engine-side */
  private getIntelViewState(): IntelViewState {
    const intel = this.state.intel
    if (!intel) {
      return { assets: [], agents: [], products: [], taskings: [], leakLevel: 0, paranoiaBand: 'LOW', encryptionUpgradedUntilTick: null }
    }
    const player = this.state.playerNation
    return {
      assets: Object.values(intel.assets).filter(a => a.nation === player).map(a => ({ ...a })),
      agents: player === 'usa' ? Object.values(intel.agents).map(a => ({ ...a })) : [],
      products: player === 'usa' ? intel.products.map(p => ({ ...p })) : [],
      taskings: intel.taskings
        .filter(t => intel.assets[t.assetId]?.nation === player)
        .map(t => ({ ...t, target: { ...t.target } })),
      leakLevel: intel.leakLevel,
      paranoiaBand: paranoiaBand(intel.paranoia),
      encryptionUpgradedUntilTick: intel.encryptionUpgradedUntilTick ?? null,
    }
  }

  /** Serialize the full engine state for saving */
  getFullStateJson(): string {
    const s = this.state
    return JSON.stringify({
      version: SAVE_SCHEMA_VERSION,
      playerNation: s.playerNation,
      time: s.time,
      nations: s.nations,
      attackCounters: s.attackCounters ?? {},
      visibility: s.visibility ?? {},
      warStatus: s.warStatus ?? {},
      gameOver: s.gameOver ?? null,
      intel: s.intel ?? null,
      scheduledLaunches: s.scheduledLaunches ?? [],
      airMissions: s.airMissions ?? [],
      surgeOps: s.surgeOps ?? null,
      units: Array.from(s.units.entries()),
      missiles: Array.from(s.missiles.entries()),
      supplyLines: Array.from(s.supplyLines.entries()),
      shippingLanes: Array.from(s.shippingLanes.entries()),
      events: s.events,
    })
  }

  /** Load a previously saved state */
  loadState(json: string): void {
    const raw = JSON.parse(json)
    if (raw.version !== SAVE_SCHEMA_VERSION) {
      throw new Error(
        `Incompatible save file: schema version ${raw.version ?? 'missing (pre-release save)'}, expected ${SAVE_SCHEMA_VERSION}`,
      )
    }
    const units = new Map(raw.units as [string, Unit][])
    // Backfill new fields for saves from older versions
    for (const unit of units.values()) {
      if (unit.maxHealth == null) unit.maxHealth = 100
      if (unit.pointDefense == null) unit.pointDefense = []
      // Backfill readiness for units that have deploy_time_sec but were saved before readiness existed
      if (unit.deploy_time_sec != null && unit.readiness == null) {
        unit.readiness = 'deployed'
      }
      if (unit.droneMission == null) unit.droneMission = 'military'
    }
    this.state = {
      playerNation: raw.playerNation ?? 'usa',
      initialized: true,
      time: raw.time,
      nations: raw.nations,
      units,
      missiles: new Map(raw.missiles),
      supplyLines: new Map(raw.supplyLines ?? []),
      shippingLanes: new Map(raw.shippingLanes ?? []),
      events: raw.events ?? [],
      pendingEvents: [],
      attackCounters: raw.attackCounters ?? {},
      visibility: raw.visibility ?? {},
      warStatus: raw.warStatus ?? {},
      gameOver: raw.gameOver ?? undefined,
      intel: raw.intel ?? undefined,
      scheduledLaunches: raw.scheduledLaunches ?? undefined,
      airMissions: raw.airMissions ?? undefined,
      surgeOps: raw.surgeOps ?? undefined,
    }
    // Saves from before the intel suite get a fresh roster
    if (!this.state.intel) initIntelState(this.state)
    // Saves from before the air war get wings stood up fresh
    if (!this.state.airMissions) initAirWings(this.state)
    setAirMissionCounter(this.state)
    // Backfill shipping lanes for old saves that didn't have them
    if (!raw.shippingLanes || raw.shippingLanes.length === 0) {
      for (const lane of defaultShippingLanes) {
        this.state.shippingLanes.set(lane.id, { ...lane })
      }
    }
    // Backfill intel state for saves created before satellites/intelBudget existed
    for (const nation of Object.values(this.state.nations)) {
      if (!nation.intelBudget) {
        nation.intelBudget = { total_pct: 10, humint_pct: 40, sigint_pct: 30, satellite_pct: 30 }
      }
    }
    if (this.state.nations.usa && this.state.nations.iran &&
        (!this.state.nations.usa.satellites || !this.state.nations.iran.satellites)) {
      this.initSatellites()
    }

    // Reset all module-level state that would otherwise persist across loads
    this.resetAllSystems()
    // Restore id counters above the loaded missiles so new launches can't overwrite them
    let maxMissile = 0
    let maxInterceptor = 0
    for (const id of this.state.missiles.keys()) {
      const m = /^m_(\d+)$/.exec(id)
      if (m) maxMissile = Math.max(maxMissile, Number(m[1]))
      const i = /^int_(\d+)$/.exec(id)
      if (i) maxInterceptor = Math.max(maxInterceptor, Number(i[1]))
    }
    setCombatCounters(maxMissile, maxInterceptor)
  }

  /** Clear all module-level system state (the worker reuses one engine across games/loads) */
  private resetAllSystems(): void {
    resetCombatState()
    resetAIState()
    resetFriendlyAIState()
    resetOrdersState()
    resetLogisticsState()
    resetPointDefenseState()
    resetRepairState()
    resetDroneAIState()
    resetSatelliteState()
    resetShippingState()
    resetVisibilityState()
    resetWarSupportState()
    resetIntelState()
    resetDetectionCache()
    resetAirOpsState()
  }

  /** Set up satellite constellations for each nation */
  private initSatellites(): void {
    const usaSats: SatellitePass[] = [
      {
        id: 'usa_optical_1',
        nation: 'usa',
        type: 'optical',
        swathWidth_km: 50,
        revisitInterval_sec: 3600, // 1 hour
        lastPassTick: 0,
        groundTrack: {
          startLat: 38, startLng: 44,  // NW Turkey
          endLat: 24, endLng: 60,       // SE Arabian Sea
        },
      },
      {
        id: 'usa_optical_2',
        nation: 'usa',
        type: 'optical',
        swathWidth_km: 50,
        revisitInterval_sec: 3600,
        lastPassTick: 1800, // offset so passes alternate
        groundTrack: {
          startLat: 24, startLng: 44,  // SW Saudi Arabia
          endLat: 38, endLng: 60,       // NE Turkmenistan
        },
      },
      {
        id: 'usa_radar_sat_1',
        nation: 'usa',
        type: 'radar_sat',
        swathWidth_km: 200,
        revisitInterval_sec: 7200, // 2 hours
        lastPassTick: 0,
        groundTrack: {
          startLat: 36, startLng: 46,  // NW Iraq
          endLat: 26, endLng: 58,       // SE Gulf of Oman
        },
      },
    ]

    const iranSats: SatellitePass[] = [
      {
        id: 'iran_optical_1',
        nation: 'iran',
        type: 'optical',
        swathWidth_km: 30,
        revisitInterval_sec: 10800, // 3 hours
        lastPassTick: 0,
        groundTrack: {
          startLat: 34, startLng: 46,  // NW Iran border
          endLat: 26, endLng: 58,       // SE Gulf of Oman
        },
      },
    ]

    this.state.nations.usa.satellites = usaSats
    this.state.nations.iran.satellites = iranSats
    resetSatelliteState()
  }

  private emitEvent(event: GameEvent): void {
    this.state.events.push(event)
    // Cap event history to prevent unbounded memory growth
    if (this.state.events.length > 2000) {
      this.state.events.splice(0, this.state.events.length - 2000)
    }
    this.state.pendingEvents.push(event)
  }

  private declareWar(attacker: NationId, defender: NationId): void {
    if (attacker === defender) return
    if (!this.state.nations[attacker] || !this.state.nations[defender]) return

    let changed = false
    if (!this.state.nations[attacker].atWar.includes(defender)) {
      this.state.nations[attacker].atWar.push(defender)
      changed = true
    }
    if (!this.state.nations[defender].atWar.includes(attacker)) {
      this.state.nations[defender].atWar.push(attacker)
      changed = true
    }
    if (!changed) return

    this.emitEvent({
      type: 'WAR_DECLARED',
      attacker,
      defender,
      tick: this.state.time.tick,
    })
  }
}

function toViewUnit(u: Unit, vis: ViewVisibility, playerNation: NationId): ViewUnit {
  // Scrub by contact quality: 'detected' hides everything but the contact itself,
  // 'tracked' shows identity and condition but not loadout. Own units are 'identified'.
  const identified = vis.level === 'identified'
  const trackedPlus = identified || vis.level === 'tracked'
  const isOwn = u.nation === playerNation
  return {
    id: u.id,
    name: trackedPlus ? u.name : contactDisplayName(u.category),
    nation: u.nation,
    category: u.category,
    position: { ...vis.position },
    heading: trackedPlus ? u.heading : 0,
    speed_kts: trackedPlus ? u.speed_kts : 0,
    status: trackedPlus ? u.status : 'ready',
    health: trackedPlus ? u.health : 100,
    maxHealth: trackedPlus ? u.maxHealth : 100,
    logistics: identified ? u.logistics : 0,
    supplyStocks: identified ? u.supplyStocks.map(s => ({ ...s })) : [],
    weapons: identified ? u.weapons.map(w => ({ ...w })) : [],
    pointDefense: identified ? u.pointDefense.map(pd => ({ ...pd })) : [],
    sensors: identified ? u.sensors.map(s => ({ ...s })) : [],
    roe: u.roe,
    waypoints: identified ? u.waypoints.map(w => ({ ...w })) : [],
    parentId: identified ? u.parentId : undefined,
    subordinateIds: identified ? [...u.subordinateIds] : [],
    readiness: identified ? u.readiness : undefined,
    readinessTimer: identified ? u.readinessTimer : undefined,
    radius_km: u.radius_km,
    mine_count: identified ? u.mine_count : undefined,
    droneMission: identified ? u.droneMission : undefined,
    visibility: vis.level,
    stale: vis.stale,
    emcon: isOwn ? u.emcon : undefined,
    // isDecoy itself NEVER leaks — only the revealed verdict (own decoys are always known)
    decoyRevealed: (isOwn ? u.isDecoy : u.decoyRevealed) || undefined,
    // Squadron pools are own-side knowledge; enemy strength estimates come from BDA only
    airWing: isOwn && u.airWing ? u.airWing.map(s => ({ ...s, readyAt: [...s.readyAt] })) : undefined,
  }
}
