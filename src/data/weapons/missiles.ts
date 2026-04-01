import type { WeaponSpec } from '@/types/game'

/** Lookup table for all weapon specs */
export const weaponSpecs: Record<string, WeaponSpec> = {}

function reg(spec: WeaponSpec) {
  weaponSpecs[spec.id] = spec
  return spec
}

// ═══════════════════════════════════════════════
//  US CRUISE MISSILES
// ═══════════════════════════════════════════════

export const TOMAHAWK = reg({
  id: 'tomahawk',
  name: 'BGM-109 Tomahawk',
  type: 'cruise_missile',
  range_km: 1600,
  speed_mach: 0.75,
  warhead_kg: 450,
  cep_m: 10,
  pk: {},
  flight_altitude_ft: 100,
  guidance: 'TERCOM/DSMAC/GPS',
})

export const JASSM_ER = reg({
  id: 'jassm_er',
  name: 'AGM-158B JASSM-ER',
  type: 'cruise_missile',
  range_km: 925,
  speed_mach: 0.8,
  warhead_kg: 450,
  cep_m: 3,
  pk: {},
  flight_altitude_ft: 200,
  guidance: 'GPS/INS/IIR',
})

export const HARPOON = reg({
  id: 'harpoon',
  name: 'RGM-84 Harpoon',
  type: 'ashm',
  range_km: 130,
  speed_mach: 0.85,
  warhead_kg: 221,
  cep_m: 5,
  pk: { ashm: 0.9 },
  flight_altitude_ft: 15,
  guidance: 'INS/active radar',
})

// ═══════════════════════════════════════════════
//  US AIR DEFENSE INTERCEPTORS
// ═══════════════════════════════════════════════

export const PAC3_MSE = reg({
  id: 'pac3_mse',
  name: 'PAC-3 MSE',
  type: 'sam',
  range_km: 35,
  speed_mach: 5.0,
  warhead_kg: 0, // hit-to-kill
  cep_m: 0,
  pk: { ballistic_missile: 0.85, cruise_missile: 0.90, aam: 0.7 },
  flight_altitude_ft: 80000,
  guidance: 'Ka-band active radar/hit-to-kill',
})

export const THAAD_INT = reg({
  id: 'thaad_int',
  name: 'THAAD Interceptor',
  type: 'sam',
  range_km: 200,
  speed_mach: 8.2,
  warhead_kg: 0, // hit-to-kill
  cep_m: 0,
  pk: { ballistic_missile: 0.80 },
  flight_altitude_ft: 492000, // 150km exoatmospheric
  guidance: 'IR seeker/hit-to-kill',
})

export const SM2_IIIA = reg({
  id: 'sm2_iiia',
  name: 'SM-2 Block IIIA',
  type: 'sam',
  range_km: 170,
  speed_mach: 3.5,
  warhead_kg: 62,
  cep_m: 0,
  pk: { cruise_missile: 0.80, aam: 0.75 },
  flight_altitude_ft: 65000,
  guidance: 'semi-active radar/INS',
})

export const SM3_IIA = reg({
  id: 'sm3_iia',
  name: 'SM-3 Block IIA',
  type: 'sam',
  range_km: 2500,
  speed_mach: 15.0,
  warhead_kg: 0, // hit-to-kill KV
  cep_m: 0,
  pk: { ballistic_missile: 0.80 },
  flight_altitude_ft: 1500000, // ~500km exo
  guidance: 'IR seeker/hit-to-kill',
})

export const SM6 = reg({
  id: 'sm6',
  name: 'SM-6',
  type: 'sam',
  range_km: 240,
  speed_mach: 3.5,
  warhead_kg: 64,
  cep_m: 0,
  pk: { cruise_missile: 0.85, ballistic_missile: 0.70, ashm: 0.80 },
  flight_altitude_ft: 110000,
  guidance: 'active radar/semi-active/INS',
})

// ═══════════════════════════════════════════════
//  IRANIAN BALLISTIC MISSILES
// ═══════════════════════════════════════════════

export const SHAHAB3 = reg({
  id: 'shahab3',
  name: 'Shahab-3',
  type: 'ballistic_missile',
  range_km: 1300,
  speed_mach: 7.0,
  warhead_kg: 760,
  cep_m: 2500,
  pk: {},
  flight_altitude_ft: 500000,
  guidance: 'INS',
})

export const SEJJIL2 = reg({
  id: 'sejjil2',
  name: 'Sejjil-2',
  type: 'ballistic_missile',
  range_km: 2000,
  speed_mach: 7.5,
  warhead_kg: 650,
  cep_m: 500,
  pk: {},
  flight_altitude_ft: 550000,
  guidance: 'INS/GPS',
})

export const FATEH110 = reg({
  id: 'fateh110',
  name: 'Fateh-110',
  type: 'ballistic_missile',
  range_km: 300,
  speed_mach: 3.5,
  warhead_kg: 450,
  cep_m: 100,
  pk: {},
  flight_altitude_ft: 150000,
  guidance: 'INS/GPS',
})

export const ZOLFAGHAR = reg({
  id: 'zolfaghar',
  name: 'Zolfaghar',
  type: 'ballistic_missile',
  range_km: 700,
  speed_mach: 5.0,
  warhead_kg: 450,
  cep_m: 200,
  pk: {},
  flight_altitude_ft: 250000,
  guidance: 'INS/GPS',
})

export const KHALIJ_FARS = reg({
  id: 'khalij_fars',
  name: 'Khalij Fars',
  type: 'ashm',
  range_km: 300,
  speed_mach: 3.0,
  warhead_kg: 450,
  cep_m: 8,
  pk: { ashm: 0.85 },
  flight_altitude_ft: 150000,
  guidance: 'EO/IR terminal',
})

// ═══════════════════════════════════════════════
//  IRANIAN CRUISE MISSILES
// ═══════════════════════════════════════════════

export const NOOR = reg({
  id: 'noor',
  name: 'Noor (C-802)',
  type: 'ashm',
  range_km: 120,
  speed_mach: 0.9,
  warhead_kg: 165,
  cep_m: 5,
  pk: { ashm: 0.80 },
  flight_altitude_ft: 20,
  guidance: 'INS/active radar terminal',
})

export const SOUMAR = reg({
  id: 'soumar',
  name: 'Soumar/Hoveyzeh',
  type: 'cruise_missile',
  range_km: 1350,
  speed_mach: 0.75,
  warhead_kg: 400,
  cep_m: 30,
  pk: {},
  flight_altitude_ft: 150,
  guidance: 'INS/TERCOM',
})

// ═══════════════════════════════════════════════
//  IRANIAN AD INTERCEPTORS
// ═══════════════════════════════════════════════

export const S300_INTERCEPTOR = reg({
  id: 's300_48n6e2',
  name: '48N6E2 (S-300)',
  type: 'sam',
  range_km: 195,
  speed_mach: 6.0,
  warhead_kg: 150,
  cep_m: 0,
  pk: { cruise_missile: 0.75, ballistic_missile: 0.50 },
  flight_altitude_ft: 90000,
  guidance: 'semi-active radar/TVM',
})

export const BAVAR373_INTERCEPTOR = reg({
  id: 'bavar373_int',
  name: 'Bavar-373 Interceptor',
  type: 'sam',
  range_km: 200,
  speed_mach: 5.5,
  warhead_kg: 145,
  cep_m: 0,
  pk: { cruise_missile: 0.70, ballistic_missile: 0.45 },
  flight_altitude_ft: 85000,
  guidance: 'semi-active/active radar',
})

export const KHORDAD15_INT = reg({
  id: 'khordad15_int',
  name: 'Sayyad-3 (3rd Khordad)',
  type: 'sam',
  range_km: 120,
  speed_mach: 4.5,
  warhead_kg: 80,
  cep_m: 0,
  pk: { cruise_missile: 0.65, aam: 0.60 },
  flight_altitude_ft: 80000,
  guidance: 'semi-active radar',
})

export const TOR_M1_INT = reg({
  id: 'tor_m1_int',
  name: '9M331 (Tor-M1)',
  type: 'sam',
  range_km: 12,
  speed_mach: 2.8,
  warhead_kg: 15,
  cep_m: 0,
  pk: { cruise_missile: 0.75, aam: 0.70 },
  flight_altitude_ft: 20000,
  guidance: 'radar command',
})
