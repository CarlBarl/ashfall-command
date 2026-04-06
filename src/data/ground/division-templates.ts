import type { DivisionTemplate } from '@/types/ground'

/**
 * Historical WW2 division stat templates.
 *
 * Stats are relative combat values inspired by board wargame systems
 * (e.g., Third Reich, A World at War) calibrated against historical
 * TO&E data from the IISS Military Balance and Osprey reference series.
 *
 * softAttack  — effectiveness vs unarmored infantry/guns
 * hardAttack  — effectiveness vs armor/mechanized
 * defense     — staying power when under attack
 * breakthrough — ability to exploit success / push through lines
 * hardness    — fraction of unit that is armored (0 = pure infantry, 1 = all armor)
 */

export const divisionTemplates: Record<string, DivisionTemplate> = {
  // ── Germany 1939 ──────────────────────────────────────────────

  'de_inf_1939': {
    id: 'de_inf_1939',
    name: 'German Infantry Division (1939)',
    nation: 'germany',
    era: '1939',
    softAttack: 45,
    hardAttack: 8,
    defense: 55,
    breakthrough: 12,
    hardness: 0.05,
    defaultStrength: 100,
    defaultMorale: 80,
  },

  'de_panzer_1939': {
    id: 'de_panzer_1939',
    name: 'German Panzer Division (1939)',
    nation: 'germany',
    era: '1939',
    softAttack: 35,
    hardAttack: 55,
    defense: 30,
    breakthrough: 65,
    hardness: 0.70,
    defaultStrength: 100,
    defaultMorale: 85,
  },

  'de_arty_1939': {
    id: 'de_arty_1939',
    name: 'German Artillery Regiment (1939)',
    nation: 'germany',
    era: '1939',
    softAttack: 60,
    hardAttack: 15,
    defense: 8,
    breakthrough: 2,
    hardness: 0.10,
    defaultStrength: 100,
    defaultMorale: 70,
  },

  // ── Poland 1939 ───────────────────────────────────────────────

  'pl_inf_1939': {
    id: 'pl_inf_1939',
    name: 'Polish Infantry Division (1939)',
    nation: 'poland',
    era: '1939',
    softAttack: 40,
    hardAttack: 5,
    defense: 50,
    breakthrough: 10,
    hardness: 0.03,
    defaultStrength: 100,
    defaultMorale: 75,
  },

  'pl_cav_1939': {
    id: 'pl_cav_1939',
    name: 'Polish Cavalry Brigade (1939)',
    nation: 'poland',
    era: '1939',
    softAttack: 30,
    hardAttack: 3,
    defense: 35,
    breakthrough: 20,
    hardness: 0.02,
    defaultStrength: 100,
    defaultMorale: 80,
  },
}
