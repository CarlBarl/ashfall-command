import type { NationId, Unit, Nation, ShippingLane, SupplyLine, WeaponStock, Position, UnitCategory } from './game'

export interface ScenarioDefinition {
  id: string
  name: string
  description: string
  year: number
  startDate: string              // ISO date string
  nations: NationId[]            // available nations in this scenario
  defaultPlayerNation: NationId
  mapCenter?: { longitude: number; latitude: number; zoom: number }
  getData: () => ScenarioData    // lazy-loaded to avoid import overhead
}

export interface ScenarioData {
  nations: Record<string, Nation>
  units: Unit[]
  supplyLines: SupplyLine[]
  baseSupply: Record<string, WeaponStock[]>
  shippingLanes?: ShippingLane[]
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
