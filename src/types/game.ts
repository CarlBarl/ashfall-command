export type NationId = 'usa' | 'iran'
export type UnitId = string
export type WeaponId = string

export type DetectionState = 'unknown' | 'estimated' | 'detected' | 'tracked'

export interface Position {
  lng: number
  lat: number
  elevation_m?: number
}

export interface GameTime {
  tick: number
  /** In-game epoch ms (maps to a real-world date) */
  timestamp: number
  speed: number
  /** Real ms between ticks — always 100ms */
  tickIntervalMs: number
}

export interface Nation {
  id: NationId
  name: string
  economy: Economy
  relations: Record<NationId, number> // -100..+100
  atWar: NationId[]
}

export interface Economy {
  gdp_billions: number
  military_budget_billions: number
  military_budget_pct_gdp: number
  oil_revenue_billions: number
  /** 0-1 multiplier on economic output */
  sanctions_impact: number
  war_cost_per_day_millions: number
  reserves_billions: number
}

export interface Unit {
  id: UnitId
  name: string
  nation: NationId
  category: UnitCategory
  position: Position
  heading: number
  speed_kts: number
  maxSpeed_kts: number
  status: UnitStatus
  health: number // 0-100
  /** Max recoverable health (decreases on heavy damage = permanent structural damage) */
  maxHealth: number // 0-100, starts at 100
  hardness: number // damage resistance: airbase=200, sam_site=100, ship=150, missile_battery=80
  /** Logistics capability 0-100 (bases only). Affects resupply rate. */
  logistics: number
  /** Weapon stocks stored at this base for resupply (bases only) */
  supplyStocks: WeaponStock[]
  weapons: WeaponLoadout[]
  /** Gun/missile point defense (Phalanx CIWS, C-RAM, etc.) */
  pointDefense: PointDefenseSystem[]
  sensors: Sensor[]
  waypoints: Position[]
  roe: ROE
  parentId?: UnitId
  subordinateIds: UnitId[]
  /** Hub units only — range of datalink to share detection data */
  datalink_range_km?: number
}

export interface WeaponStock {
  weaponId: WeaponId
  count: number
  maxCount: number
  /** Units produced per game hour (0 for most — only rear bases produce) */
  productionRate: number
}

export interface SupplyLine {
  id: string
  fromBaseId: UnitId
  toBaseId: UnitId
  /** Resupply capacity (arbitrary units, affects throughput) */
  capacity: number
  health: number // 0-100
  distance_km: number
}

export type UnitCategory =
  | 'airbase'
  | 'naval_base'
  | 'sam_site'
  | 'missile_battery'
  | 'aircraft'
  | 'ship'
  | 'submarine'
  | 'carrier_group'

export type UnitStatus =
  | 'ready'
  | 'engaged'
  | 'moving'
  | 'damaged'
  | 'destroyed'
  | 'reloading'
  | 'repairing'

export interface WeaponLoadout {
  weaponId: WeaponId
  count: number
  maxCount: number
  reloadTimeSec: number
  reloadingUntil?: number // game timestamp
}

export interface Sensor {
  type: 'radar' | 'irst' | 'sonar' | 'ew'
  range_km: number
  detection_prob: number // 0-1
  antenna_height_m?: number // height above ground level, defaults vary by system
  sector_deg?: number // coverage arc in degrees, default 360 = omnidirectional
}

export type ROE = 'weapons_free' | 'weapons_tight' | 'hold_fire'

export interface WeaponSpec {
  id: WeaponId
  name: string
  type: WeaponType
  range_km: number
  speed_mach: number
  warhead_kg: number
  cep_m: number
  /** Base probability of kill per target category */
  pk: Partial<Record<WeaponType, number>>
  flight_altitude_ft: number
  guidance: string
  /** Radar cross-section in m² (defaults to 1.0). Shaheds ~0.1 m² */
  rcs_m2?: number
}

export type WeaponType =
  | 'cruise_missile'
  | 'ballistic_missile'
  | 'sam'
  | 'aam'
  | 'ashm'
  | 'loitering_munition'

export interface ADSystemSpec {
  id: string
  name: string
  radar_range_km: number
  engagement_range_km: number
  max_altitude_m: number
  fire_channels: number
  reload_time_sec: number
  interceptorId: WeaponId
}

export interface PointDefenseSystem {
  specId: string
  active: boolean
  ammo: number
  maxAmmo: number
  cooldownUntil?: number
}

export interface PointDefenseSpec {
  id: string
  name: string
  /** Effective engagement range in km (1.5 for Phalanx, 2 for C-RAM) */
  range_km: number
  /** Probability of kill per target weapon type */
  pk: Partial<Record<WeaponType, number>>
  /** Rounds consumed per engagement attempt */
  ammoPerEngagement: number
  /** Seconds between engagements */
  cooldown_sec: number
  /** 'gun' = instant resolution (CIWS), 'missile' = launches interceptor (Iron Dome) */
  engagementType: 'gun' | 'missile'
}

export interface AircraftSpec {
  id: string
  name: string
  combat_radius_km: number
  max_speed_mach: number
  ceiling_ft: number
  loadout: WeaponId[]
  readiness_rate: number // 0-1
}

export interface Missile {
  id: string
  weaponId: WeaponId
  launcherId: UnitId
  targetId: UnitId
  nation: NationId
  path: [number, number][] // [lng, lat] for TripsLayer
  timestamps: number[] // for TripsLayer animation
  status: 'inflight' | 'intercepted' | 'impact'
  launchTime: number
  eta: number
  /** Current altitude in meters — computed from flight phase */
  altitude_m: number
  /** Flight phase for ballistic missiles */
  phase: 'boost' | 'midcourse' | 'terminal' | 'cruise'
  /** Actual current speed in Mach (varies with fuel, phase, gravity) */
  speed_current_mach: number
  /** Seconds of fuel remaining */
  fuel_remaining_sec: number
  /** True for SAM interceptor missiles */
  is_interceptor: boolean
  /** Which missile this interceptor is chasing */
  interceptTargetMissileId?: string
  /** Detection quality that led to this intercept (for accuracy modifier) */
  networkQuality?: 'own' | 'tracked' | 'detected'
}

export interface Engagement {
  id: string
  interceptorUnitId: UnitId
  missileId: string
  weaponId: WeaponId
  startTick: number
  resolved: boolean
}

export interface GameState {
  /** Which nation the player controls (enemy runs on AI) */
  playerNation: NationId
  /** false until initGame() is called — tick() is a no-op while uninitialized */
  initialized: boolean
  time: GameTime
  nations: Record<NationId, Nation>
  units: Map<UnitId, Unit>
  missiles: Map<string, Missile>
  engagements: Map<string, Engagement>
  supplyLines: Map<string, SupplyLine>
  events: GameEvent[]
  /** Events accumulated since last getViewState() call */
  pendingEvents: GameEvent[]
}

export type GameEvent =
  | { type: 'MISSILE_LAUNCHED'; missileId: string; launcherId: UnitId; targetId: UnitId; weaponName: string; tick: number }
  | { type: 'MISSILE_INTERCEPTED'; missileId: string; interceptorId: UnitId; position: Position; tick: number }
  | { type: 'MISSILE_IMPACT'; missileId: string; targetId: UnitId; damage: number; tick: number }
  | { type: 'UNIT_DESTROYED'; unitId: UnitId; tick: number }
  | { type: 'WAR_DECLARED'; attacker: NationId; defender: NationId; tick: number }
  | { type: 'AMMO_DEPLETED'; unitId: UnitId; weaponId: WeaponId; tick: number }
  | { type: 'RESUPPLIED'; unitId: UnitId; weaponId: WeaponId; count: number; fromBaseId: UnitId; tick: number }
  | { type: 'SUPPLY_LINE_CUT'; lineId: string; tick: number }
  | { type: 'UNIT_REPAIRED'; unitId: UnitId; healthRestored: number; tick: number }
  | { type: 'POINT_DEFENSE_KILL'; unitId: UnitId; missileId: string; specId: string; tick: number }
