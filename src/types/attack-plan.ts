import type { UnitId, WeaponId, UnitCategory } from './game'

export type TargetCategory = UnitCategory

export type Severity = 'surgical' | 'standard' | 'overwhelming'
// surgical: 1 missile per target (assumes AD suppressed)
// standard: auto-calculated based on AD environment (1-4 per target)
// overwhelming: 2x standard (guaranteed kill through AD)

export type TimingMode = 'simultaneous' | 'staggered' | 'sequential'

export interface AttackPriority {
  id: string
  targetCategory: TargetCategory
  severity: Severity
  seadFirst: boolean
  weaponPreference: WeaponId[] | 'any'
  launcherPreference: UnitCategory[] | 'any'
}

export interface PlannedStrike {
  launcherId: UnitId
  launcherName: string
  weaponId: WeaponId
  weaponName: string
  targetId: UnitId
  targetName: string
  targetCategory: UnitCategory
  count: number
  inRange: boolean
  distanceKm: number
  flightTimeSec: number
  priorityTier: number
}

export interface AttackPlanSummary {
  totalMissiles: number
  totalTargets: number
  weaponBudget: Record<string, { needed: number; available: number }>
  targetCoverage: Record<string, { targeted: number; total: number }>
  estimatedPenetration: number // 0-1, fraction that get through AD
  estimatedKills: number
  warnings: string[]
}

export interface AttackPlan {
  name: string
  priorities: AttackPriority[]
  timing: TimingMode
  strikes: PlannedStrike[]
  summary: AttackPlanSummary
}
