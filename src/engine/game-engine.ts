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
import type { SatellitePass } from '@/types/game'

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
    nations: Record<NationId, import('@/types/game').Nation>,
    unitList: Unit[],
    supplyLines: import('@/types/game').SupplyLine[],
    baseSupply: Record<string, import('@/types/game').WeaponStock[]>,
    startDate?: string,
  ): void {
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

    // Initialize intel budgets (only if not already set from scenario data)
    if (!this.state.nations.usa.intelBudget) {
      this.state.nations.usa.intelBudget = { total_pct: 15, humint_pct: 33, sigint_pct: 34, satellite_pct: 33 }
    }
    if (!this.state.nations.iran.intelBudget) {
      this.state.nations.iran.intelBudget = { total_pct: 10, humint_pct: 50, sigint_pct: 30, satellite_pct: 20 }
    }

    // Orient sector-limited SAMs toward enemy before first tick
    orientSAMRadars(this.state)

    // Initialize satellite constellations
    this.initSatellites()
  }

  /** Advance simulation by one tick */
  tick(): void {
    if (!this.state.initialized) return
    const { state } = this
    state.time.tick++
    state.time.timestamp += TICK_MS

    processMovement(state, this.elevationGrid)

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
          unit.waypoints = cmd.waypoints
          unit.status = 'moving'
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
          const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId)
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
  }
}
