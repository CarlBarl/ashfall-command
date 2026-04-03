import { weaponSpecs } from './missiles'

/**
 * Patch interceptor pK values for loitering_munition targets.
 * Must be called after missiles.ts and drones.ts have loaded.
 *
 * pK rationale:
 * - PAC-3 MSE: massive overkill for a slow drone, but hit-to-kill works (0.95)
 * - THAAD: exo/endo interceptor optimized for ballistic targets at high altitude,
 *   poor engagement geometry vs low-slow drones (0.20)
 * - SM-2 IIIA: blast-frag warhead effective at medium range, good vs slow targets (0.85)
 * - SM-3 IIA: exoatmospheric hit-to-kill, essentially useless vs low drones (0.10)
 * - SM-6: dual-mode seeker, long range, effective against diverse targets (0.90)
 * - S-300 48N6E2: optimized for high-alt fast targets, struggles with low-slow clutter (0.60)
 * - Bavar-373: Iranian S-300 derivative, similar limitations (0.55)
 * - 3rd Khordad (Sayyad-3): medium-range, better low-alt tracking (0.70)
 * - Tor-M1: short-range, low-altitude specialist — best Iranian counter to drones (0.80)
 */
export function patchDronePK(): void {
  const patches: Record<string, number> = {
    pac3_mse: 0.95,
    thaad_int: 0.20,
    sm2_iiia: 0.85,
    sm3_iia: 0.10,
    sm6: 0.90,
    s300_48n6e2: 0.60,
    bavar373_int: 0.55,
    khordad15_int: 0.70,
    tor_m1_int: 0.80,
  }

  for (const [id, pk] of Object.entries(patches)) {
    if (weaponSpecs[id]) {
      weaponSpecs[id].pk.loitering_munition = pk
    }
  }
}
