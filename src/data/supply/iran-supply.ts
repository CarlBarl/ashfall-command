import type { WeaponStock, SupplyLine } from '@/types/game'
import { haversine } from '@/engine/utils/geo'

// ═══════════════════════════════════════════════
//  IRAN BASE POSITIONS (from iran-orbat.ts)
// ═══════════════════════════════════════════════

const basePositions = {
  // SAM sites (major ones with supply depots)
  s300_isfahan:    { lat: 32.66, lng: 51.68 },
  s300_bushehr:    { lat: 28.97, lng: 50.83 },
  s300_natanz:     { lat: 33.73, lng: 51.73 },
  bavar_tehran:    { lat: 35.69, lng: 51.39 },
  khordad_bandar:  { lat: 27.18, lng: 56.27 },

  // Airbases
  mehrabad:        { lat: 35.69, lng: 51.31 },  // Tehran
  isfahan_ab:      { lat: 32.75, lng: 51.86 },  // 8th TFB
  bushehr_ab:      { lat: 28.95, lng: 50.83 },
  bandar_abbas_ab: { lat: 27.22, lng: 56.38 },
  tabriz_ab:       { lat: 38.13, lng: 46.24 },  // 2nd TFB

  // Missile batteries (key depots)
  shahab_tabriz:      { lat: 38.08, lng: 46.29 },
  shahab_khorramabad: { lat: 33.49, lng: 48.35 },
  sejjil_semnan:      { lat: 35.58, lng: 53.39 },
  fateh_dezful:       { lat: 32.38, lng: 48.40 },
  fateh_shiraz:       { lat: 29.59, lng: 52.59 },
  zolfaghar_kermanshah: { lat: 34.31, lng: 47.07 },
  soumar_base:        { lat: 34.10, lng: 50.90 },

  // Shahed drone launchers
  shahed_kermanshah:  { lat: 34.35, lng: 47.15 },
  shahed_dezful:      { lat: 32.40, lng: 48.35 },
  shahed_isfahan:     { lat: 32.60, lng: 51.75 },
  shahed_shiraz:      { lat: 29.55, lng: 52.55 },
} as const

// ═══════════════════════════════════════════════
//  BASE SUPPLY STOCKS
//
//  Iranian AD and missile inventories are smaller
//  than US equivalents. Production is limited —
//  only Tehran (Mehrabad) has meaningful domestic
//  production capacity (~1/hr for key systems).
//  Other bases are pure depots with no production.
// ═══════════════════════════════════════════════

export const iranBaseSupply: Record<string, WeaponStock[]> = {
  // ─── AIRBASES (major logistics hubs) ───

  mehrabad: [
    // Tehran is the national logistics center
    { weaponId: 's300_48n6e2',  count: 32, maxCount: 64, productionRate: 1 },
    { weaponId: 'bavar373_int', count: 24, maxCount: 48, productionRate: 1 },
    { weaponId: 'khordad15_int', count: 16, maxCount: 32, productionRate: 1 },
    { weaponId: 'shahab3',      count: 8,  maxCount: 16, productionRate: 0 },
    { weaponId: 'sejjil2',      count: 4,  maxCount: 8,  productionRate: 0 },
    { weaponId: 'fateh110',     count: 12, maxCount: 24, productionRate: 0 },
    { weaponId: 'soumar',       count: 6,  maxCount: 12, productionRate: 0 },
    // Shahed drone production — Iran mass-produces at ~100-300/month
    { weaponId: 'shahed_136',   count: 200, maxCount: 500, productionRate: 2 },
    { weaponId: 'shahed_131',   count: 100, maxCount: 200, productionRate: 1 },
    { weaponId: 'shahed_238',   count: 50,  maxCount: 100, productionRate: 0.5 },
  ],

  isfahan_ab: [
    // Isfahan — central depot
    { weaponId: 's300_48n6e2',  count: 24, maxCount: 32, productionRate: 0 },
    { weaponId: 'bavar373_int', count: 16, maxCount: 24, productionRate: 0 },
    { weaponId: 'fateh110',     count: 8,  maxCount: 16, productionRate: 0 },
    { weaponId: 'zolfaghar',    count: 8,  maxCount: 16, productionRate: 0 },
  ],

  bushehr_ab: [
    // Bushehr — southern coast depot
    { weaponId: 's300_48n6e2',  count: 16, maxCount: 24, productionRate: 0 },
    { weaponId: 'tor_m1_int',   count: 8,  maxCount: 16, productionRate: 0 },
    { weaponId: 'noor',         count: 12, maxCount: 24, productionRate: 0 },
  ],

  bandar_abbas_ab: [
    // Bandar Abbas — Strait of Hormuz supply hub
    { weaponId: 'khordad15_int', count: 12, maxCount: 24, productionRate: 0 },
    { weaponId: 'noor',          count: 16, maxCount: 32, productionRate: 0 },
    { weaponId: 'khalij_fars',   count: 8,  maxCount: 16, productionRate: 0 },
    { weaponId: 'fateh110',      count: 8,  maxCount: 16, productionRate: 0 },
  ],

  tabriz_ab: [
    // Tabriz — northwestern depot, close to missile TELs
    { weaponId: 'shahab3',    count: 12, maxCount: 24, productionRate: 0 },
    { weaponId: 'zolfaghar',  count: 8,  maxCount: 16, productionRate: 0 },
    { weaponId: 'fateh110',   count: 6,  maxCount: 12, productionRate: 0 },
  ],

  // ─── SAM SITE DEPOTS (smaller stocks) ───

  s300_isfahan: [
    { weaponId: 's300_48n6e2', count: 16, maxCount: 32, productionRate: 0 },
  ],

  s300_bushehr: [
    { weaponId: 's300_48n6e2', count: 16, maxCount: 32, productionRate: 0 },
  ],

  s300_natanz: [
    { weaponId: 's300_48n6e2', count: 16, maxCount: 32, productionRate: 0 },
  ],

  bavar_tehran: [
    { weaponId: 'bavar373_int', count: 12, maxCount: 24, productionRate: 0 },
  ],

  khordad_bandar: [
    { weaponId: 'khordad15_int', count: 8, maxCount: 16, productionRate: 0 },
  ],
}

// ═══════════════════════════════════════════════
//  SUPPLY LINES
//
//  Interior lines connecting major Iranian cities.
//  Iran's geography (mountain ranges, long distances)
//  means supply lines run along major highways.
//  All theater lines capacity 100, health 100.
// ═══════════════════════════════════════════════

function makeLine(
  fromId: string,
  toId: string,
  capacity: number,
): SupplyLine {
  const from = basePositions[fromId as keyof typeof basePositions]
  const to = basePositions[toId as keyof typeof basePositions]
  return {
    id: `supply_iran_${fromId}_${toId}`,
    fromBaseId: fromId,
    toBaseId: toId,
    capacity,
    health: 100,
    distance_km: Math.round(haversine(from, to)),
  }
}

export const iranSupplyLines: SupplyLine[] = [
  // ─── Tehran hub spokes ───
  makeLine('mehrabad', 'bavar_tehran', 100),      // Tehran airbase ↔ Tehran SAM
  makeLine('mehrabad', 's300_natanz', 100),        // Tehran → Natanz (~160 km)
  makeLine('mehrabad', 'sejjil_semnan', 100),      // Tehran → Semnan (~220 km)
  makeLine('mehrabad', 'soumar_base', 100),        // Tehran → Soumar (~180 km)

  // ─── Isfahan cluster ───
  makeLine('isfahan_ab', 's300_isfahan', 100),     // Isfahan airbase ↔ Isfahan SAM
  makeLine('isfahan_ab', 's300_natanz', 100),      // Isfahan → Natanz (~120 km)
  makeLine('isfahan_ab', 'fateh_shiraz', 100),     // Isfahan → Shiraz (~470 km)

  // ─── Western corridor (Zagros) ───
  makeLine('mehrabad', 'zolfaghar_kermanshah', 100), // Tehran → Kermanshah (~480 km)
  makeLine('zolfaghar_kermanshah', 'shahab_khorramabad', 100), // Kermanshah → Khorramabad (~150 km)
  makeLine('shahab_khorramabad', 'fateh_dezful', 100), // Khorramabad → Dezful (~120 km)

  // ─── Southern coast ───
  makeLine('bushehr_ab', 's300_bushehr', 100),     // Bushehr airbase ↔ Bushehr SAM
  makeLine('bushehr_ab', 'bandar_abbas_ab', 100),  // Bushehr → Bandar Abbas (~580 km)
  makeLine('bandar_abbas_ab', 'khordad_bandar', 100), // Bandar Abbas AB ↔ Khordad SAM

  // ─── North-south trunk ───
  makeLine('mehrabad', 'isfahan_ab', 100),         // Tehran → Isfahan (~400 km)
  makeLine('isfahan_ab', 'bushehr_ab', 100),       // Isfahan → Bushehr (~450 km)
  makeLine('isfahan_ab', 'fateh_dezful', 80),      // Isfahan → Dezful (~350 km, secondary route)

  // ─── Northwest ───
  makeLine('mehrabad', 'tabriz_ab', 80),           // Tehran → Tabriz (~600 km, long but critical)
  makeLine('tabriz_ab', 'shahab_tabriz', 100),     // Tabriz AB ↔ Shahab TELs (co-located)

  // ─── Drone launcher supply lines ───
  makeLine('zolfaghar_kermanshah', 'shahed_kermanshah', 100), // Kermanshah hub → drone battery
  makeLine('fateh_dezful', 'shahed_dezful', 100),             // Dezful hub → drone battery
  makeLine('isfahan_ab', 'shahed_isfahan', 100),              // Isfahan hub → drone battery
  makeLine('fateh_shiraz', 'shahed_shiraz', 100),             // Shiraz hub → drone battery
]
