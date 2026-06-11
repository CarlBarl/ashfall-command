import type {
  AgentSource,
  AirMission,
  GameEvent,
  GameOverReport,
  GameTime,
  IntelAsset,
  IntelProduct,
  Missile,
  Nation,
  NationId,
  PointDefenseSystem,
  Position,
  ROE,
  SatTasking,
  Sensor,
  ShippingLane,
  SquadronState,
  SupplyLine,
  UnitCategory,
  UnitId,
  UnitStatus,
  VisibilityLevel,
  WeaponLoadout,
  WeaponStock,
} from './game'

/** Intel slice of the snapshot — player-nation data only */
export interface IntelViewState {
  assets: IntelAsset[]
  agents: AgentSource[]
  products: IntelProduct[]
  taskings: SatTasking[]
  leakLevel: number
  /** Fuzzy read of Iranian counterintel posture — exact paranoia stays hidden */
  paranoiaBand: 'LOW' | 'ELEVATED' | 'HIGH' | 'SEVERE'
  encryptionUpgradedUntilTick: number | null
}

/** Live status of one scenario objective, computed engine-side for the player's nation */
export interface ObjectiveStatus {
  id: string
  label: string
  /** 0-1 progress toward the player's goal */
  progress: number
  status: 'good' | 'contested' | 'bad'
  detail: string
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
  shippingLanes: ShippingLane[]
  /** New events since last poll (one-shot delivery) */
  events: GameEvent[]
  pendingEventCount: number
  /** Unit IDs recently detected by satellite passes (fades after ~60 ticks) */
  satelliteDetectedUnitIds: string[]
  /** Political will per nation id, 0-100 — the win/lose meter */
  warSupport: Record<string, number>
  /** Set once the war has been decided; the world keeps ticking afterwards */
  gameOver: GameOverReport | null
  /** Scenario objectives for the player's side (empty at peace) */
  objectives: ObjectiveStatus[]
  /** Intel suite: assets, sources, products, counterintel meters (player nation only) */
  intel: IntelViewState
  /** Air war: the player's missions (engine always supplies; optional to spare fixtures) */
  airMissions?: AirMission[]
  /** SURGE OPS lever state */
  surgeOps?: boolean
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
  radius_km?: number
  mine_count?: number
  droneMission?: 'military' | 'shipping_interdiction'
  /** Fog of war: how well the player sees this unit. Own units are always 'identified'. */
  visibility: VisibilityLevel
  /** True when position is a last-known fix rather than a live track */
  stale: boolean
  /** Own units: radar silent (EMCON) */
  emcon?: boolean
  /** Own carriers/airbases: squadron pools (never exposed for enemy units) */
  airWing?: SquadronState[]
  /** Enemy contacts: positively identified as a decoy */
  decoyRevealed?: boolean
}
