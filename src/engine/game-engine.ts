import type { GameState, GameEvent, NationId, Unit, UnitId } from '@/types/game'
import type { GameViewState, ViewUnit } from '@/types/view'
import type { Command } from '@/types/commands'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import { SeededRNG } from './utils/rng'
import { processMovement } from './systems/movement'
import { processCombat, launchMissile, launchSAM, resetCombatState } from './systems/combat'
import { processAI, resetAIState, orientSAMRadars } from './systems/ai'
import { processEconomy } from './systems/economy'
import { processOrders, resetOrdersState } from './systems/orders'
import { processFriendlyAI, resetFriendlyAIState } from './systems/friendly-ai'
import { processLogistics, resetLogisticsState } from './systems/logistics'
import { processPointDefense, resetPointDefenseState } from './systems/point-defense'
import { processRepair, resetRepairState } from './systems/repair'
import { processReadiness } from './systems/readiness'
import { usaBaseSupply, usaSupplyLines } from '@/data/supply/usa-supply'
import { iranBaseSupply, iranSupplyLines } from '@/data/supply/iran-supply'
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
// Ground warfare systems
import { processFrontline, resetFrontlineState, getCachedFrontlines, getCachedTerritories } from './systems/frontline'
import { processGroundCombat, resetGroundCombatState } from './systems/ground-combat'
import { processGeneralAI, resetGeneralAIState } from './systems/general-ai'
import { processGroundSupply, resetGroundSupplyState } from './systems/ground-supply'
import { processResearch, resetResearchState } from './systems/research'

const TICK_MS = 1_000 // 1 tick = 1 game second (real-time at 1x)
const SCENARIO_START = new Date('2026-06-15T06:00:00Z').getTime()

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
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
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

  /** Initialize game from the default scenario (backward-compatible) */
  initDefaultScenario(playerNation: NationId = 'usa'): void {
    const units = new Map<UnitId, Unit>()
    for (const u of [...usaUnits, ...iranUnits]) {
      units.set(u.id, { ...u })
    }

    this.state = {
      playerNation,
      initialized: true,
      time: {
        tick: 0,
        timestamp: SCENARIO_START,
        speed: 0,
        tickIntervalMs: 100,
      },
      nations: {
        usa: {
          id: 'usa',
          name: 'United States of America',
          economy: {
            gdp_billions: 28000,
            military_budget_billions: 886,
            military_budget_pct_gdp: 3.2,
            oil_revenue_billions: 0,
            sanctions_impact: 0,
            war_cost_per_day_millions: 0,
            reserves_billions: 800,
          },
          relations: { usa: 100, iran: -60 },
          atWar: [],
        },
        iran: {
          id: 'iran',
          name: 'Islamic Republic of Iran',
          economy: {
            gdp_billions: 400,
            military_budget_billions: 25,
            military_budget_pct_gdp: 6.3,
            oil_revenue_billions: 50,
            sanctions_impact: 0.3,
            war_cost_per_day_millions: 0,
            reserves_billions: 120,
          },
          relations: { usa: -60, iran: 100 },
          atWar: [],
        },
      },
      units,
      missiles: new Map(),
      engagements: new Map(),
      supplyLines: new Map<string, import('@/types/game').SupplyLine>(),
      events: [],
      pendingEvents: [],
    }

    // Initialize supply
    for (const [unitId, stocks] of Object.entries({ ...usaBaseSupply, ...iranBaseSupply })) {
      const unit = this.state.units.get(unitId)
      if (unit) {
        unit.supplyStocks = stocks
        unit.logistics = 100
      }
    }
    for (const line of [...usaSupplyLines, ...iranSupplyLines]) {
      this.state.supplyLines.set(line.id, { ...line })
    }

    // Initialize intel budgets
    // USA: 15% total, balanced allocation
    this.state.nations.usa.intelBudget = { total_pct: 15, humint_pct: 33, sigint_pct: 34, satellite_pct: 33 }
    // Iran: 10% total, more HUMINT focused
    this.state.nations.iran.intelBudget = { total_pct: 10, humint_pct: 50, sigint_pct: 30, satellite_pct: 20 }

    // Orient sector-limited SAMs toward enemy before first tick
    orientSAMRadars(this.state)

    // Initialize satellite constellations
    this.initSatellites()
  }

  /** Initialize from scenario data (used by the game mode menu) */
  initFromData(
    playerNation: NationId,
    nations: Record<string, import('@/types/game').Nation>,
    unitList: Unit[],
    supplyLines: import('@/types/game').SupplyLine[],
    baseSupply: Record<string, import('@/types/game').WeaponStock[]>,
    startDate?: string,
    ground?: {
      groundUnits?: import('@/types/ground').GroundUnit[]
      generals?: import('@/types/ground').General[]
      armyGroups?: import('@/types/ground').ArmyGroup[]
      controlGrid?: import('@/types/ground').ControlGrid
      initialResearch?: Record<string, import('@/types/ground').ResearchState>
      tickScale?: number
    },
  ): void {
    const units = new Map<UnitId, Unit>()
    for (const u of unitList) {
      units.set(u.id, { ...u })
    }

    const timestamp = startDate ? new Date(startDate).getTime() : SCENARIO_START

    this.state = {
      playerNation,
      initialized: true,
      time: { tick: 0, timestamp, speed: 0, tickIntervalMs: 100, tickScale: ground?.tickScale },
      nations,
      units,
      missiles: new Map(),
      engagements: new Map(),
      supplyLines: new Map<string, import('@/types/game').SupplyLine>(),
      events: [],
      pendingEvents: [],
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

    // ─── Ground warfare data ───
    if (ground?.groundUnits?.length) {
      this.state.groundUnits = new Map()
      for (const gu of ground.groundUnits) {
        this.state.groundUnits.set(gu.id, { ...gu })
      }
    }
    if (ground?.generals?.length) {
      this.state.generals = new Map()
      for (const gen of ground.generals) {
        this.state.generals.set(gen.id, { ...gen, pendingReports: [] })
      }
    }
    if (ground?.armyGroups?.length) {
      this.state.armyGroups = new Map()
      for (const ag of ground.armyGroups) {
        this.state.armyGroups.set(ag.id, { ...ag })
      }
    }
    if (ground?.controlGrid) {
      this.state.controlGrid = ground.controlGrid
    }
    if (ground?.initialResearch) {
      this.state.research = new Map()
      for (const [nation, rs] of Object.entries(ground.initialResearch)) {
        this.state.research.set(nation, { ...rs })
      }
    }

    // Initialize intel budgets for all nations that don't have one
    for (const nation of Object.values(this.state.nations)) {
      if (!nation.intelBudget) {
        nation.intelBudget = { total_pct: 10, humint_pct: 40, sigint_pct: 30, satellite_pct: 30 }
      }
    }

    // Orient sector-limited SAMs toward enemy before first tick
    orientSAMRadars(this.state)

    // Initialize satellite constellations (only for modern scenarios with USA/Iran)
    if (this.state.nations.usa && this.state.nations.iran) {
      this.initSatellites()
    }

    // Compute initial frontlines so they're visible before first tick
    if (this.state.groundUnits?.size) {
      processFrontline(this.state)
    }
  }

  /** Advance simulation by one tick */
  tick(): void {
    if (!this.state.initialized) return
    const { state } = this
    state.time.tick++
    const scale = state.time.tickScale ?? 1
    state.time.timestamp += TICK_MS * scale

    processMovement(state, this.elevationGrid)
    processReadiness(state)

    // Build sensor network graph for this tick (used by combat for networked detection)
    this.sensorNetwork = buildSensorNetwork(state, this.elevationGrid)

    // ROE enforcement + command queue before combat
    const orderCmds = processOrders(state, this.elevationGrid)
    for (const cmd of orderCmds) {
      this.executeCommand(cmd)
    }

    processCombat(state, this.rng, this.elevationGrid, this.sensorNetwork)
    processPointDefense(state, this.rng)
    processEconomy(state)
    processLogistics(state)
    processRepair(state)

    // Autonomous offensive fire for weapons_free units (any nation)
    const friendlyCmds = processFriendlyAI(state, this.rng)
    // Enemy AI generates commands
    const aiCommands = processAI(state, this.rng)
    for (const cmd of [...friendlyCmds, ...aiCommands]) {
      this.executeCommand(cmd)
    }

    // Satellite reconnaissance passes
    processSatellites(state)

    // Espionage: HUMINT reveals + SIGINT multiplier
    this.lastEspionageResult = processEspionage(state, this.rng)

    // ─── Ground warfare systems (skip when no ground units) ───
    if (state.groundUnits && state.groundUnits.size > 0) {
      const tick = state.time.tick
      if (tick % 6 === 0) processGroundSupply(state)
      if (tick % 12 === 0) processGeneralAI(state, this.rng)
      if (tick % 4 === 0) {
        processGroundCombat(state, this.rng)
        processFrontline(state)
      }
      if (tick % 720 === 0) processResearch(state)
    }

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
              // Auto-route naval units around land
              const finalDest = cmd.waypoints[cmd.waypoints.length - 1]
              const route = findNavalRoute(unit.position, finalDest, this.elevationGrid)
              if (route) {
                unit.waypoints = [...route, finalDest]
              } else {
                unit.waypoints = cmd.waypoints // fallback to direct if no route
              }
            } else {
              unit.waypoints = cmd.waypoints
            }
            unit.status = 'moving'
          }
        }
        break
      }
      case 'LAUNCH_MISSILE': {
        const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId, cmd.waypoints)
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

        let declaredWar = false
        for (let i = 0; i < cmd.count; i++) {
          const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId, cmd.waypoints)
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
        const player = state.playerNation
        state.nations[player].atWar = state.nations[player].atWar.filter(n => n !== cmd.target)
        state.nations[cmd.target].atWar = state.nations[cmd.target].atWar.filter(n => n !== player)
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
      // ─── Ground warfare commands ───
      case 'GENERAL_ORDER': {
        const general = state.generals?.get(cmd.generalId)
        if (general) general.currentOrder = cmd.order
        break
      }
      case 'REASSIGN_DIVISION': {
        const div = state.groundUnits?.get(cmd.divisionId)
        if (div && state.armyGroups) {
          // Remove from old army group
          const oldAG = state.armyGroups.get(div.armyGroupId)
          if (oldAG) {
            oldAG.divisionIds = oldAG.divisionIds.filter(id => id !== cmd.divisionId)
          }
          // Add to new army group
          const newAG = state.armyGroups.get(cmd.targetArmyGroupId)
          if (newAG) {
            newAG.divisionIds.push(cmd.divisionId)
            div.armyGroupId = cmd.targetArmyGroupId
          }
        }
        break
      }
      case 'SET_RESEARCH': {
        const rs = state.research?.get(cmd.nation)
        if (rs) {
          rs.currentResearch = cmd.techId
          rs.researchProgress = 0
        }
        break
      }
      case 'SET_RESEARCH_BUDGET': {
        const rs = state.research?.get(cmd.nation)
        if (rs) rs.monthlyBudget = cmd.budget
        break
      }
    }
  }

  /** Get serializable snapshot for the main thread */
  getViewState(): GameViewState {
    const { state } = this
    const events = [...state.pendingEvents]
    state.pendingEvents = [] // one-shot delivery

    return {
      playerNation: state.playerNation,
      initialized: state.initialized,
      time: { ...state.time },
      nations: Object.values(state.nations),
      units: Array.from(state.units.values()).map(toViewUnit),
      missiles: Array.from(state.missiles.values()),
      supplyLines: Array.from(state.supplyLines.values()),
      events,
      pendingEventCount: state.events.length,
      satelliteDetectedUnitIds: Array.from(getSatelliteDetections(state.time.tick)),
      // Ground warfare data (from cache, no recomputation)
      ...(state.groundUnits?.size ? this.getGroundViewData() : {}),
    }
  }

  /** Extract ground warfare data for the view state */
  private getGroundViewData(): Partial<GameViewState> {
    const { state } = this

    // Collect general reports (one-shot delivery like events)
    const reports: import('@/types/ground').GeneralReport[] = []
    if (state.generals) {
      for (const gen of state.generals.values()) {
        reports.push(...gen.pendingReports)
        gen.pendingReports = []
      }
    }
    // Build research summary
    const researchSummary: Record<string, { current: string | null; progress: number; completed: string[] }> = {}
    if (state.research) {
      for (const [nation, rs] of state.research) {
        researchSummary[nation] = {
          current: rs.currentResearch,
          progress: rs.researchProgress,
          completed: Array.from(rs.completedTechs),
        }
      }
    }

    // Convert ground units from grid coords to lat/lng for map display
    const grid = state.controlGrid
    const groundUnits: import('@/types/view').ViewGroundUnit[] = []
    if (state.groundUnits && grid) {
      const kmPerDegLat = 111.32
      const kmPerDegLng = kmPerDegLat * Math.cos((grid.originLat * Math.PI) / 180)
      for (const gu of state.groundUnits.values()) {
        groundUnits.push({
          id: gu.id,
          name: gu.name,
          nation: gu.nation,
          type: gu.type,
          armyGroupId: gu.armyGroupId,
          lat: grid.originLat + (gu.gridRow * grid.cellSizeKm) / kmPerDegLat,
          lng: grid.originLng + (gu.gridCol * grid.cellSizeKm) / kmPerDegLng,
          strength: gu.strength,
          morale: gu.morale,
          organization: gu.organization,
          stance: gu.stance,
          status: gu.status,
          supplyState: gu.supplyState,
          entrenched: gu.entrenched,
        })
      }
    }

    // Convert generals and army groups for UI
    const generals: import('@/types/view').ViewGeneral[] = []
    if (state.generals) {
      for (const gen of state.generals.values()) {
        generals.push({
          id: gen.id,
          name: gen.name,
          nation: gen.nation,
          armyGroupId: gen.armyGroupId,
          traits: gen.traits,
          currentOrder: gen.currentOrder,
        })
      }
    }

    const armyGroups: import('@/types/view').ViewArmyGroup[] = []
    if (state.armyGroups) {
      for (const ag of state.armyGroups.values()) {
        armyGroups.push({
          id: ag.id,
          name: ag.name,
          nation: ag.nation,
          generalId: ag.generalId,
          divisionIds: ag.divisionIds,
        })
      }
    }

    const territories = getCachedTerritories()
    const frontlines = getCachedFrontlines()
    return {
      frontlines,
      territories: territories.length > 0 ? territories : undefined,
      generalReports: reports.length > 0 ? reports : undefined,
      researchSummary: Object.keys(researchSummary).length > 0 ? researchSummary : undefined,
      groundUnits: groundUnits.length > 0 ? groundUnits : undefined,
      generals: generals.length > 0 ? generals : undefined,
      armyGroups: armyGroups.length > 0 ? armyGroups : undefined,
    }
  }

  /** Load a previously saved state */
  loadState(json: string): void {
    const raw = JSON.parse(json)
    const units = new Map(raw.units as [string, Unit][])
    // Backfill new fields for saves from older versions
    for (const unit of units.values()) {
      if (unit.maxHealth == null) unit.maxHealth = 100
      if (unit.pointDefense == null) unit.pointDefense = []
      // Backfill readiness for units that have deploy_time_sec but were saved before readiness existed
      if (unit.deploy_time_sec != null && unit.readiness == null) {
        unit.readiness = 'deployed'
      }
    }
    this.state = {
      playerNation: raw.playerNation ?? 'usa',
      initialized: true,
      time: raw.time,
      nations: raw.nations,
      units,
      missiles: new Map(raw.missiles),
      engagements: new Map(raw.engagements),
      supplyLines: new Map(raw.supplyLines ?? []),
      events: raw.events ?? [],
      pendingEvents: [],
    }
    // Reset all module-level state that would otherwise persist across loads
    resetCombatState()
    resetAIState()
    resetFriendlyAIState()
    resetOrdersState()
    resetLogisticsState()
    resetPointDefenseState()
    resetRepairState()
    resetDroneAIState()
    resetSatelliteState()
    // Ground warfare resets
    resetFrontlineState()
    resetGroundCombatState()
    resetGeneralAIState()
    resetGroundSupplyState()
    resetResearchState()
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

function toViewUnit(u: Unit): ViewUnit {
  return {
    id: u.id,
    name: u.name,
    nation: u.nation,
    category: u.category,
    position: { ...u.position },
    heading: u.heading,
    speed_kts: u.speed_kts,
    status: u.status,
    health: u.health,
    maxHealth: u.maxHealth,
    logistics: u.logistics,
    supplyStocks: u.supplyStocks.map(s => ({ ...s })),
    weapons: u.weapons.map(w => ({ ...w })),
    pointDefense: u.pointDefense.map(pd => ({ ...pd })),
    sensors: u.sensors.map(s => ({ ...s })),
    roe: u.roe,
    waypoints: u.waypoints.map(w => ({ ...w })),
    parentId: u.parentId,
    subordinateIds: [...u.subordinateIds],
    readiness: u.readiness,
    readinessTimer: u.readinessTimer,
  }
}
