import type { NationId, Position } from './game'

// ─── Branded ID types ───

export type GroundUnitId = string & { readonly __brand?: 'GroundUnitId' }
export type GeneralId = string & { readonly __brand?: 'GeneralId' }
export type ArmyGroupId = string & { readonly __brand?: 'ArmyGroupId' }
export type TechId = string & { readonly __brand?: 'TechId' }

// ─── String literal unions (no enums — erasableSyntaxOnly) ───

export type DivisionType = 'infantry' | 'armor' | 'mechanized' | 'artillery' | 'airborne' | 'mountain'
export type DivisionStance = 'attack' | 'defend' | 'retreat' | 'reserve' | 'fortify'
export type GroundUnitStatus = 'active' | 'routing' | 'encircled' | 'destroyed' | 'reserve'
export type TerrainType = 'plains' | 'forest' | 'hills' | 'mountains' | 'urban' | 'river' | 'marsh' | 'desert'
export type ReportType = 'progress' | 'breakthrough' | 'stalled' | 'casualties' | 'supply_crisis' | 'encirclement' | 'retreat'

// ─── Ground Unit (engine-internal, never rendered individually) ───

export interface GroundUnit {
  id: GroundUnitId
  name: string
  nation: NationId
  type: DivisionType
  armyGroupId: ArmyGroupId

  /** Position on the hidden control grid (NOT lat/lng) */
  gridCol: number
  gridRow: number

  // Combat stats
  strength: number       // 0-100 (% of full establishment)
  morale: number         // 0-100
  experience: number     // 0.5-2.0 multiplier
  organization: number   // 0-100, recovers when not in combat

  // Attack/defense values (data-driven from division templates)
  softAttack: number
  hardAttack: number
  defense: number
  breakthrough: number
  /** Fraction of unit that is armored (0-1). Infantry ~0.05, Panzer ~0.70 */
  hardness: number

  // Logistics
  supplyState: number    // 0-100
  fuelState: number      // 0-100 (armor/mech consume fuel to attack)
  ammoState: number      // 0-100

  // State
  stance: DivisionStance
  /** Entrenchment level, builds over time in defend/fortify stance */
  entrenched: number     // 0-100
  /** How many grid cells this division occupies on the front */
  combatWidth: number
  status: GroundUnitStatus
}

// ─── Generals ───

export interface GeneralTraits {
  /** Biases toward attack, breakthrough attempts (0-10) */
  aggression: number
  /** Biases toward defense, withdrawal when outnumbered (0-10) */
  caution: number
  /** Supply efficiency bonus for assigned units (0-10) */
  logistics: number
  /** Chance of creative maneuvers — flanking, feints (0-10) */
  innovation: number
  /** Bonus to unit morale recovery (0-10) */
  morale: number
}

export interface General {
  id: GeneralId
  name: string
  nation: NationId
  armyGroupId: ArmyGroupId
  portrait?: string

  traits: GeneralTraits

  currentOrder: GeneralOrder | null
  lastReportTick: number
  pendingReports: GeneralReport[]
}

export type GeneralOrder =
  | { type: 'ADVANCE'; objectiveCol: number; objectiveRow: number }
  | { type: 'HOLD_LINE' }
  | { type: 'ENCIRCLE'; targetCol: number; targetRow: number }
  | { type: 'WITHDRAW'; fallbackCol: number; fallbackRow: number }
  | { type: 'RESERVE' }

export interface GeneralReport {
  tick: number
  type: ReportType
  message: string
  severity: 'info' | 'warning' | 'critical'
}

// ─── Army Groups ───

export interface ArmyGroup {
  id: ArmyGroupId
  name: string           // e.g. "Army Group North"
  nation: NationId
  generalId: GeneralId
  divisionIds: GroundUnitId[]
  /** Front sector range on the control grid (column range) */
  sectorStartCol: number
  sectorEndCol: number
}

// ─── Control Grid (hidden computational layer) ───

export interface ControlCell {
  controller: NationId | null
  /** Accumulated force pressure (-100..+100) */
  pressure: number
  terrain: TerrainType
  /** Built up by engineers/defending units (0-100) */
  fortification: number
  /** Can trace supply path to national depot */
  supplyConnected: boolean
}

export interface ControlGrid {
  rows: number
  cols: number
  /** Latitude of grid row 0 */
  originLat: number
  /** Longitude of grid col 0 */
  originLng: number
  /** Approximate km per cell (~10) */
  cellSizeKm: number
  /** Row-major: cells[row * cols + col] */
  cells: ControlCell[]
}

// ─── Frontline (derived for rendering, sent in ViewState) ───

export interface FrontlineSegment {
  /** Polyline coordinates [lng, lat][] */
  coordinates: [number, number][]
  sideA: NationId
  sideB: NationId
}

// ─── Battle indicator (for rendering) ───

export interface BattleIndicator {
  position: Position
  /** 0-100, larger = more intense fighting */
  intensity: number
  attackerNation: NationId
  defenderNation: NationId
}

// ─── Encirclement pocket (for rendering) ───

export interface EncirclementPocket {
  /** Polygon coordinates [lng, lat][][] */
  polygon: [number, number][][]
  nation: NationId
}

// ─── Research / Tech Tree ───

export interface TechNode {
  id: TechId
  name: string
  description: string
  category?: 'infantry' | 'armor' | 'artillery' | 'air' | 'naval' | 'industry' | 'electronics'
  /** Earliest year this tech can be researched */
  year: number
  /** Research points required to complete */
  cost: number
  prerequisites: TechId[]
  effects: TechEffect[]
}

export type TechEffect =
  | { type: 'UNLOCK_UNIT_TYPE'; divisionType: DivisionType; unitTemplateId: string }
  | { type: 'STAT_BONUS'; stat: string; bonus: number }
  | { type: 'PRODUCTION_BONUS'; category: string; multiplier: number }
  | { type: 'UNLOCK_WEAPON'; weaponId: string }
  // Flexible format used by data files
  | { type: 'unlock_unit'; target: string; description?: string }
  | { type: 'stat_bonus'; target: string; stat: string; value: number; description?: string }
  | { type: 'unlock_weapon'; target: string; description?: string }

export interface ResearchState {
  completedTechs: Set<TechId>
  currentResearch: TechId | null
  researchProgress: number
  /** Research points generated per game month */
  monthlyBudget: number
}

// ─── Division template (data file type) ───

export interface DivisionTemplate {
  id: string
  name: string
  type?: DivisionType
  /** Base stats at full strength */
  softAttack: number
  hardAttack: number
  defense: number
  breakthrough: number
  hardness: number
  combatWidth?: number
  /** Tech required to build this division type */
  requiredTech?: TechId
  // Extended fields used by data files
  nation?: string
  era?: string
  defaultStrength?: number
  defaultMorale?: number
}

// ─── Terrain modifier (data file type) ───

export interface TerrainModifier {
  type: TerrainType
  /** Multiplier on attacker combat power */
  attackModifier: number
  /** Multiplier on defender combat power */
  defenseModifier: number
  /** Movement cost (1 = normal, 2 = double) */
  movementCost: number
}
