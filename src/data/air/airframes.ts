import type { AirframeId, Sensor } from '@/types/game'

/**
 * Airframe performance table — design: docs/plans/air-war-v5.md §1.
 * A2A combat is a pK-roll abstraction (no missile entities): one engagement
 * roll per 30 game-s inside 40 km, shots = per-airframe magazine.
 */
export interface AirframeSpec {
  id: AirframeId
  name: string
  /** Cruise speed for transit (kts) */
  speed_kts: number
  combat_radius_km: number
  /** Sensors mounted per flight (antenna_height_m carries the airborne range bonus) */
  sensors: Sensor[]
  /** Strike loadout per airframe: weaponId × countPerAirframe (empty = no strike role) */
  strikeWeapons: { weaponId: string; countPerAirframe: number }[]
  /** A2A magazine + kill probabilities per target class */
  a2a: { shots: number; pkFighter: number; pkLarge: number } | null
  /** AEW hubs relay fire-control tracks */
  datalink_range_km?: number
  rcsClass: 'stealth' | 'fighter' | 'large'
}

const radar = (range_km: number, antenna_height_m: number): Sensor => ({
  type: 'radar',
  range_km,
  detection_prob: 0.9,
  antenna_height_m,
})

export const AIRFRAMES: Record<AirframeId, AirframeSpec> = {
  fa18e: {
    id: 'fa18e',
    name: 'F/A-18E Super Hornet',
    speed_kts: 480,
    combat_radius_km: 740,
    sensors: [radar(150, 9000)],
    strikeWeapons: [{ weaponId: 'jassm_er', countPerAirframe: 2 }],
    a2a: { shots: 6, pkFighter: 0.65, pkLarge: 0.85 },
    rcsClass: 'fighter',
  },
  f35c: {
    id: 'f35c',
    name: 'F-35C Lightning II',
    speed_kts: 500,
    combat_radius_km: 1100,
    sensors: [radar(170, 9000)],
    strikeWeapons: [{ weaponId: 'jassm_er', countPerAirframe: 2 }],
    a2a: { shots: 4, pkFighter: 0.75, pkLarge: 0.9 },
    rcsClass: 'stealth',
  },
  ea18g: {
    id: 'ea18g',
    name: 'EA-18G Growler',
    speed_kts: 480,
    combat_radius_km: 700,
    sensors: [radar(120, 9000)],
    strikeWeapons: [],
    a2a: { shots: 2, pkFighter: 0.4, pkLarge: 0.6 },
    rcsClass: 'fighter',
  },
  e2d: {
    id: 'e2d',
    name: 'E-2D Advanced Hawkeye',
    speed_kts: 330,
    combat_radius_km: 600,
    sensors: [radar(450, 9000)],
    strikeWeapons: [],
    a2a: null,
    datalink_range_km: 600,
    rcsClass: 'large',
  },
  f14: {
    id: 'f14',
    name: 'F-14AM Tomcat',
    speed_kts: 480,
    combat_radius_km: 700,
    sensors: [radar(160, 9000)],
    strikeWeapons: [],
    a2a: { shots: 4, pkFighter: 0.5, pkLarge: 0.75 },
    rcsClass: 'fighter',
  },
  mig29: {
    id: 'mig29',
    name: 'MiG-29A Fulcrum',
    speed_kts: 470,
    combat_radius_km: 550,
    sensors: [radar(100, 9000)],
    strikeWeapons: [],
    a2a: { shots: 4, pkFighter: 0.45, pkLarge: 0.7 },
    rcsClass: 'fighter',
  },
  su24: {
    id: 'su24',
    name: 'Su-24MK Fencer',
    speed_kts: 470,
    combat_radius_km: 600,
    sensors: [radar(90, 9000)],
    strikeWeapons: [{ weaponId: 'noor', countPerAirframe: 2 }],
    a2a: null,
    rcsClass: 'large',
  },
  su35: {
    id: 'su35',
    name: 'Su-35SE Flanker-E',
    speed_kts: 500,
    combat_radius_km: 900,
    sensors: [radar(180, 9000)],
    strikeWeapons: [],
    a2a: { shots: 6, pkFighter: 0.6, pkLarge: 0.85 },
    rcsClass: 'fighter',
  },
}

// Sortie economy (CMO published numbers — roadmap Wave C)
export const CAP_TURNAROUND_TICKS = 90 * 60
export const STRIKE_TURNAROUND_SURGE_TICKS = 6 * 3600
export const STRIKE_TURNAROUND_SUSTAINED_TICKS = 20 * 3600
export const SURGE_OPS_DURATION_TICKS = 96 * 3600
/** Fraction of each squadron down for maintenance at scenario start */
export const MAINTENANCE_FRACTION = 0.3
/** Strike planning delay window (game-seconds) */
export const STRIKE_PLANNING_MIN_TICKS = 2 * 3600
export const STRIKE_PLANNING_MAX_TICKS = 6 * 3600
/** A2A engagement model */
export const A2A_COMMIT_RANGE_KM = 120
export const A2A_ENGAGE_RANGE_KM = 40
export const A2A_ROLL_INTERVAL_TICKS = 30
/** SEAD escort effect radius + multiplier */
export const SEAD_RADIUS_KM = 80
export const SEAD_MULTIPLIER = 0.6
export const EXTENDED_RANGE_BONUS = 1.35
export const EXTENDED_RANGE_SORTIE_COST = 2
