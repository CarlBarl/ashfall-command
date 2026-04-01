import type {
  GameEvent,
  GameTime,
  Missile,
  Nation,
  NationId,
  Position,
  ROE,
  UnitCategory,
  UnitId,
  UnitStatus,
  WeaponLoadout,
} from './game'

/** Flat, serializable snapshot sent from Worker → Main at 30fps */
export interface GameViewState {
  time: GameTime
  nations: Nation[]
  units: ViewUnit[]
  missiles: Missile[]
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
  weapons: WeaponLoadout[]
  roe: ROE
  parentId?: UnitId
  subordinateIds: UnitId[]
}
