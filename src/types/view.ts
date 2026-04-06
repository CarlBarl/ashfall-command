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
import type {
  ArmyGroupId,
  BattleIndicator,
  DivisionStance,
  DivisionType,
  EncirclementPocket,
  FrontlineSegment,
  GeneralId,
  GeneralOrder,
  GeneralReport,
  GeneralTraits,
  GroundUnitId,
  GroundUnitStatus,
} from './ground'

export interface ViewTerritory {
  /** Current controller */
  nation: string
  /** Original sovereign owner */
  owner?: string | null
  occupied?: boolean
  /** Polygon rings [lng, lat][][] */
  polygon: [number, number][][]
}

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
  territories?: ViewTerritory[]
  battles?: BattleIndicator[]
  encirclements?: EncirclementPocket[]
  generalReports?: GeneralReport[]
  researchSummary?: Record<string, { current: string | null; progress: number; completed: string[] }>
  groundUnits?: ViewGroundUnit[]
  generals?: ViewGeneral[]
  armyGroups?: ViewArmyGroup[]
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

// ─── Ground warfare view types ─────────────────────────────────────

export interface ViewGroundUnit {
  id: GroundUnitId
  name: string
  nation: NationId
  type: DivisionType
  armyGroupId: ArmyGroupId
  /** Map position (converted from grid coords) */
  lat: number
  lng: number
  strength: number
  morale: number
  organization: number
  stance: DivisionStance
  status: GroundUnitStatus
  supplyState: number
  entrenched: number
}

export interface ViewGeneral {
  id: GeneralId
  name: string
  nation: NationId
  armyGroupId: ArmyGroupId
  traits: GeneralTraits
  currentOrder: GeneralOrder | null
  pendingReports: GeneralReport[]
}

export interface ViewArmyGroup {
  id: ArmyGroupId
  name: string
  nation: NationId
  generalId: GeneralId
  divisionIds: GroundUnitId[]
}
