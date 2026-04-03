import type {
  GameEvent,
  GameTime,
  Missile,
  Nation,
  NationId,
  PointDefenseSystem,
  Position,
  ROE,
  SupplyLine,
  UnitCategory,
  UnitId,
  UnitStatus,
  WeaponLoadout,
  WeaponStock,
} from './game'

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
  roe: ROE
  waypoints: Position[]
  parentId?: UnitId
  subordinateIds: UnitId[]
}
