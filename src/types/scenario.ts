import type { NationId, Unit, Nation, SupplyLine, WeaponStock, Position, UnitCategory } from './game'
import type { ArmyGroup, ControlGrid, General, GroundUnit, ResearchState } from './ground'

export interface ScenarioDefinition {
  id: string
  name: string
  description: string
  year: number
  startDate: string              // ISO date string
  nations: NationId[]            // available nations in this scenario
  defaultPlayerNation: NationId
  mapCenter?: { longitude: number; latitude: number; zoom: number }
  borderGeojsonPath?: string     // scenario-specific border GeoJSON (e.g. historical borders)
  getData: () => ScenarioData    // lazy-loaded to avoid import overhead
}

export interface ScenarioData {
  nations: Record<string, Nation>
  units: Unit[]
  supplyLines: SupplyLine[]
  baseSupply: Record<string, WeaponStock[]>
  // ─── Ground warfare (optional) ───
  groundUnits?: GroundUnit[]
  generals?: General[]
  armyGroups?: ArmyGroup[]
  controlGrid?: ControlGrid
  initialResearch?: Record<string, ResearchState>
  /** Game-seconds per tick. Default 1 (modern). WW2 = 3600 (1 tick = 1 hour). */
  tickScale?: number
}

export interface FreeModeConfig {
  playerNation: NationId
  budget: number                 // millions USD
  selectedUnits: FreeModeUnit[]
  enemyUnits?: FreeModeUnit[]    // optional — if not provided, AI places
  rngSeed: number
}

export interface FreeModeUnit {
  catalogId: string
  position: Position
  customName?: string
}

export interface UnitCatalogEntry {
  id: string
  name: string
  nation: NationId
  category: UnitCategory
  cost_millions: number
  description: string
  template: Omit<Unit, 'id' | 'position' | 'status' | 'waypoints' | 'subordinateIds' | 'maxHealth' | 'pointDefense'> & { maxHealth?: number; pointDefense?: Unit['pointDefense'] }
}

export type GameModeConfig =
  | { mode: 'scenario'; scenarioId: string; playerNation: NationId }
  | { mode: 'free'; config: FreeModeConfig }
