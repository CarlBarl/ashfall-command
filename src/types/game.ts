export type NationId = string & { readonly __brand?: 'NationId' }
export type UnitId = string
export type WeaponId = string

export type DetectionState = 'unknown' | 'estimated' | 'detected' | 'tracked'

/** Fog-of-war contact quality, in escalating order */
export type VisibilityLevel = 'unseen' | 'detected' | 'tracked' | 'identified'

export interface VisibilityContact {
  level: VisibilityLevel
  /** Tick when any sensor last refreshed this contact */
  lastSeenTick: number
  /** Position captured at lastSeenTick — shown when the live track is lost */
  lastKnownPosition: Position
  /** True for contacts whose level can no longer decay below 'detected' (fixed sites) */
  pinned?: boolean
}

/** Political will to keep fighting — the win/lose meter */
export interface WarStatus {
  /** 0-100; at 0 the nation capitulates */
  warSupport: number
  warStartTick?: number
  /** Set while this nation has an unanswered ceasefire offer on the table */
  ceasefireOffered?: boolean
}

export interface WarStats {
  durationTicks: number
  unitsLost: Record<string, number>
  missilesFired: Record<string, number>
  missilesIntercepted: Record<string, number>
  oilPeak: number
  /** Game seconds the Hormuz lane spent in each non-open state */
  hormuzReducedTicks: number
  hormuzBlockedTicks: number
}

export interface GameOverReport {
  outcome: 'victory' | 'defeat' | 'ceasefire'
  /** Nation whose war support collapsed (capitulation outcomes) */
  loser?: NationId
  endTick: number
  stats: WarStats
}

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

export interface SatellitePass {
  id: string
  nation: NationId
  type: 'optical' | 'radar_sat'
  swathWidth_km: number
  /** Game seconds between passes */
  revisitInterval_sec: number
  lastPassTick: number
  groundTrack: {
    startLat: number; startLng: number
    endLat: number; endLng: number
  }
}

export interface IntelBudget {
  total_pct: number        // % of military budget on intel (0-30)
  humint_pct: number       // % of intel budget on HUMINT (0-100, sums with others to 100)
  sigint_pct: number       // % of intel budget on SIGINT
  satellite_pct: number    // % of intel budget on satellite recon
}

export interface Nation {
  id: NationId
  name: string
  economy: Economy
  relations: Record<string, number> // -100..+100
  atWar: NationId[]
  satellites?: SatellitePass[]
  intelBudget?: IntelBudget
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
  /** Currency symbol for display (default '$') */
  currency?: string
  /** World oil price in $/barrel (computed from shipping lane throughput) */
  oilPrice_per_barrel?: number
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
  /** Readiness state for mobile SAMs/TELs. undefined = always operational (ships, airbases) */
  readiness?: 'deployed' | 'packing' | 'deploying' | 'moving'
  /** Seconds remaining in current transition (packing or deploying) */
  readinessTimer?: number
  /** Time in seconds to deploy (set up and become operational) */
  deploy_time_sec?: number
  /** Time in seconds to pack up before moving */
  pack_time_sec?: number
  /** For minefield units — threat radius in km */
  radius_km?: number
  /** For minefield units — remaining active mines */
  mine_count?: number
  /** For minefield units — damage per mine contact */
  damage_per_contact?: number
  /** For drone launcher units — current tactical mission */
  droneMission?: 'military' | 'shipping_interdiction'
  /** EMCON: radar silent — invisible to ELINT, blind on own radar (network picture still applies) */
  emcon?: boolean
  /** Decoy unit (Iranian dummy TELs) — engine truth, scrubbed from snapshots until revealed */
  isDecoy?: boolean
  /** Set once the enemy has positively identified this decoy (NIIRS 7+ pass, HUMINT, or BDA) */
  decoyRevealed?: boolean
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
  | 'minefield'

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
  /** Strike was leaked to the enemy before launch — heavy miss chance at impact */
  compromised?: boolean
}

export interface ShippingLane {
  id: string
  name: string
  /** Polyline path as [lng, lat] pairs defining the lane's geographic corridor */
  path: [number, number][]
  /** Normal-conditions throughput in millions of barrels per day */
  baseThroughput_mbd: number
  /** Current effective throughput, 0 to baseThroughput_mbd */
  currentThroughput_mbd: number
  /** Combined suppression factor from all threats, 0 (clear) to 1 (blocked) */
  suppressionFactor: number
  status: 'open' | 'reduced' | 'blocked'
}

/** One salvo round queued for a future tick (LAUNCH_SALVO with spacingTicks) */
export interface ScheduledLaunch {
  dueTick: number
  launcherId: UnitId
  weaponId: WeaponId
  targetId: UnitId
  waypoints?: Position[]
  trackQuality?: TrackQuality
  /** Result of the salvo command's single leak roll — scheduled rounds never re-roll */
  compromised?: boolean
}

export interface GameState {
  /** Which nation the player controls (enemy runs on AI) */
  playerNation: NationId
  /** false until initGame() is called — tick() is a no-op while uninitialized */
  initialized: boolean
  time: GameTime
  nations: Record<string, Nation>
  units: Map<UnitId, Unit>
  missiles: Map<string, Missile>
  supplyLines: Map<string, SupplyLine>
  events: GameEvent[]
  /** Events accumulated since last getViewState() call */
  pendingEvents: GameEvent[]
  shippingLanes: Map<string, ShippingLane>
  /** Cumulative missile impacts + unit losses per nation — combat writes, enemy AI reads for escalation */
  attackCounters?: Record<string, number>
  /** Fog of war: contacts on ENEMY units, keyed by observing nation then unit id */
  visibility?: Record<string, Record<UnitId, VisibilityContact>>
  /** Per-nation war-support / termination state */
  warStatus?: Record<string, WarStatus>
  /** Set once the war has been resolved — the world keeps ticking but the game is decided */
  gameOver?: GameOverReport
  /** Intel suite v3: ISR assets, HUMINT sources, products, counterintel meters */
  intel?: IntelState
  /** Salvo rounds awaiting their dueTick — drained by processScheduledLaunches each tick */
  scheduledLaunches?: ScheduledLaunch[]
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
  | { type: 'OIL_PRICE_CHANGE'; newPrice: number; oldPrice: number; tick: number }
  | { type: 'SHIPPING_LANE_STATUS_CHANGE'; laneId: string; newStatus: ShippingLane['status']; suppressionFactor: number; tick: number }
  | { type: 'MINE_CONTACT'; minefieldId: UnitId; targetId: UnitId; damage: number; tick: number }
  | { type: 'SUPPLY_LINE_INTERDICTED'; lineId: string; threatUnitId: UnitId; healthAfter: number; tick: number }
  | { type: 'WAR_SUPPORT_CRITICAL'; nation: NationId; support: number; tick: number }
  | { type: 'CEASEFIRE_OFFERED'; by: NationId; tick: number }
  | { type: 'CEASEFIRE_REJECTED'; by: NationId; tick: number }
  | { type: 'WAR_ENDED'; outcome: 'ceasefire' | 'capitulation'; loser?: NationId; tick: number }
  | { type: 'AUTO_ENGAGEMENT'; unitId: UnitId; targetId: UnitId; weaponName: string; count: number; quality: TrackQuality; tick: number }
  | { type: 'MISSILE_MISSED'; missileId: string; targetId: UnitId; tick: number }
  | { type: 'MISSILE_CRASHED'; missileId: string; position?: Position; tick: number }
  | { type: 'ORDER_REJECTED'; unitId: UnitId; reason: string; tick: number }
  | { type: 'SATELLITE_PASS_COMPLETE'; assetId: string; target: Position; found: number; revealedDecoys: number; tick: number }
  | { type: 'SATELLITE_PASS_FAILED'; assetId: string; target: Position; cloudPct: number; tick: number }
  | { type: 'INTERCEPT_DECRYPTED'; precedence: InterceptPrecedence; text: string; aboutUnitId?: UnitId; tick: number }
  | { type: 'AGENT_REPORT'; agentId: string; codename: string; text: string; tick: number }
  | { type: 'AGENT_ARRESTED'; agentId: string; codename: string; tick: number }
  | { type: 'AGENT_EXFILTRATED'; agentId: string; codename: string; tick: number }
  | { type: 'SPY_SWEEP'; arrests: number; tick: number }
  | { type: 'ENCRYPTION_UPGRADED'; untilTick: number; tick: number }
  | { type: 'DECOY_REVEALED'; unitId: UnitId; tick: number }
  | { type: 'STRIKE_LEAKED'; targetId: UnitId; tick: number }
  | { type: 'OPSEC_SWEEP_COMPLETE'; newLeakLevel: number; tick: number }

/** Fire-control source for a shot: the shooter's own sensors, or a track relayed over datalink */
export type TrackQuality = 'own' | 'datalink'

// ---------------------------------------------------------------------------
// Intel suite (v3) — design: docs/plans/intel-suite-v3.md
// ---------------------------------------------------------------------------

export type IntelAssetKind =
  | 'optical_sat'      // KH-11 / Noor — taskable imagery passes
  | 'commercial_sat'   // commercial layer — frequent, lower quality
  | 'sigint_air'       // RC-135 — drives intercept cadence
  | 'maritime_patrol'  // MQ-4C Triton — coarse wide-area ship refresh
  | 'launch_detection' // SBIRS — always-on launch plume FLASH cards
  | 'recon_drone'      // Mohajer-10 — Iran's carrier watcher
  | 'fast_boats'       // IRGC shadowing — Iran's coarse carrier track

export interface IntelAsset {
  id: string
  nation: NationId
  name: string
  kind: IntelAssetKind
  status: 'active' | 'lost'
  /** Game-minutes between collections (0 = continuous) */
  revisit_min: number
  lastCollectionTick: number
  /** Imagery quality for products (NIIRS 0-9); >= 7 reveals decoys */
  niirs?: number
}

export interface SatTasking {
  id: string
  assetId: string
  target: Position
  queuedTick: number
  /** Real-world cloud cover 0-100 captured at tasking time (UI-fetched); undefined = roll it */
  cloudPct?: number
}

export type InterceptPrecedence = 'FLASH' | 'IMMEDIATE' | 'PRIORITY' | 'ROUTINE'

export type IntelProductKind = 'imint' | 'sigint' | 'humint'

/** Metadata only — the UI fetches real imagery at view time */
export interface IntelProduct {
  id: string
  kind: IntelProductKind
  tick: number
  classification: string
  caption: string
  assetId?: string
  target?: Position
  niirs?: number
  precedence?: InterceptPrecedence
  agentId?: string
}

export type AgentStatus = 'active' | 'resting' | 'exfiltrating' | 'exfiltrated' | 'arrested'

export interface AgentSource {
  id: string
  codename: string
  placement: string
  product: string
  status: AgentStatus
  /** 0-100 — arrest risk during Iranian spy sweeps */
  exposure: number
  lastTaskedTick: number
  exfilCompleteTick?: number
}

export interface IntelState {
  assets: Record<string, IntelAsset>
  agents: Record<string, AgentSource>
  /** Newest first, capped at 30 */
  products: IntelProduct[]
  taskings: SatTasking[]
  /** 0-100 Iranian counterintel alert — drives sweeps, encryption upgrades */
  paranoia: number
  /** 0-100 how compromised the player's operations are */
  leakLevel: number
  encryptionUpgradedUntilTick?: number
  lastSweepTick?: number
  lastOpsecSweepTick?: number
  lastIntInterceptTick?: number
  lastCarrierOsintTick?: number
  decoysSpawned?: boolean
  productCounter?: number
}
