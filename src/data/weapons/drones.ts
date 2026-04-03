import { weaponSpecs } from './missiles'
import type { WeaponSpec } from '@/types/game'

function reg(spec: WeaponSpec) {
  weaponSpecs[spec.id] = spec
  return spec
}

// ═══════════════════════════════════════════════
//  IRANIAN LOITERING MUNITIONS (DRONES)
// ═══════════════════════════════════════════════

/**
 * Shahed-136 — Iran's primary mass-production loitering munition.
 * Delta-wing design, piston engine (Mado MD-550), composite airframe.
 * GPS/INS guidance, no terminal seeker. Launched from truck-mounted rails.
 * Extensively used in Ukraine conflict by Russia (Geran-2 designation).
 * Sources: CSIS Missile Threat, IISS Military Balance 2025
 */
export const SHAHED_136 = reg({
  id: 'shahed_136',
  name: 'Shahed-136',
  type: 'loitering_munition',
  range_km: 2500,
  speed_mach: 0.15, // ~185 km/h piston engine
  warhead_kg: 40,
  cep_m: 12,
  pk: {}, // no air-to-air capability
  flight_altitude_ft: 500, // ~150m cruise altitude, below most radar coverage
  guidance: 'INS/GPS/GLONASS',
  rcs_m2: 0.1, // tiny composite airframe, very low RCS
})

/**
 * Shahed-131 — lighter, shorter-range variant of the Shahed-136.
 * Smaller warhead, same piston propulsion. Used for area saturation.
 * Sources: CSIS Missile Threat, FAS
 */
export const SHAHED_131 = reg({
  id: 'shahed_131',
  name: 'Shahed-131',
  type: 'loitering_munition',
  range_km: 900,
  speed_mach: 0.15, // same piston engine class
  warhead_kg: 15,
  cep_m: 15,
  pk: {},
  flight_altitude_ft: 500,
  guidance: 'INS/GPS/GLONASS',
  rcs_m2: 0.08, // even smaller than -136
})

/**
 * Shahed-238 — jet-powered evolution. Toloue-10 turbojet engine.
 * Significantly faster than piston variants. Multiple seeker options:
 * INS/GPS for land attack, IIR for terminal precision.
 * First revealed at IRGC Aerospace exhibition, 2023.
 * Sources: CSIS Missile Threat, IISS
 */
export const SHAHED_238 = reg({
  id: 'shahed_238',
  name: 'Shahed-238',
  type: 'loitering_munition',
  range_km: 1000,
  speed_mach: 0.43, // ~520 km/h turbojet
  warhead_kg: 50,
  cep_m: 8,
  pk: {},
  flight_altitude_ft: 1000, // ~300m, slightly higher than piston variants
  guidance: 'INS/GPS/IIR terminal',
  rcs_m2: 0.15, // slightly larger than piston variants
})
