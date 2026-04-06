import type {
  GameEvent,
  GameTime,
  Missile,
  Nation,
  NationId,
  PointDefenseSystem,
  Position,
  ROE,
  Sensor,
  SupplyLine,
  UnitCategory,
  UnitId,
  UnitStatus,
  WeaponLoadout,
  WeaponStock,
} from './game'
import type { BattleIndicator, EncirclementPocket, FrontlineSegment, GeneralReport } from './ground'

/** Flat, serializable snapshot sent from Worker → Main at 30fps */
export interface GameViewState {
  playerNation: NationId
  initialized: boolean
  time: GameTime
  nations: Nation[]
  units: ViewUnit[]
  missiles: Missile[]
  supplyLines: SupplyLine[]
  /** New events since last poll (one-shot delivery) */
  events: GameEvent[]
  pendingEventCount: number
  /** Unit IDs recently detected by satellite passes (fades after ~60 ticks) */
  satelliteDetectedUnitIds: string[]

  // ─── Ground warfare (present only when ground units exist) ───
  frontlines?: FrontlineSegment[]
  territories?: { nation: string; polygon: [number, number][][] }[]
  battles?: BattleIndicator[]
  encirclements?: EncirclementPocket[]
  generalReports?: GeneralReport[]
  researchSummary?: Record<string, { current: string | null; progress: number; completed: string[] }>
}

export interface ViewUnit {
  id: UnitId
  name: string
  nation: NationId
  category: UnitCategory
  position: Position
  heading: number
  speed_kts: number
  status: UnitStatus
  health: number
  maxHealth: number
  logistics: number
  supplyStocks: WeaponStock[]
  weapons: WeaponLoadout[]
  pointDefense: PointDefenseSystem[]
  sensors: Sensor[]
  roe: ROE
  waypoints: Position[]
  parentId?: UnitId
  subordinateIds: UnitId[]
  readiness?: 'deployed' | 'packing' | 'deploying' | 'moving'
  readinessTimer?: number
}
