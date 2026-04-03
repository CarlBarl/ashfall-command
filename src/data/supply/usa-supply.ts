import type { WeaponStock, SupplyLine } from '@/types/game'
import { haversine } from '@/engine/utils/geo'

// ═══════════════════════════════════════════════
//  US BASE POSITIONS (from usa-orbat.ts)
// ═══════════════════════════════════════════════

const basePositions = {
  al_udeid:      { lat: 25.117, lng: 51.315 },  // Qatar — CENTCOM forward HQ
  al_dhafra:     { lat: 24.248, lng: 54.547 },  // UAE
  prince_sultan: { lat: 24.062, lng: 47.580 },  // Saudi Arabia
  ali_al_salem:  { lat: 29.347, lng: 47.521 },  // Kuwait
  incirlik:      { lat: 37.002, lng: 35.426 },  // Turkey
  diego_garcia:  { lat: -7.313, lng: 72.411 },  // Rear logistics depot (BIOT)
} as const

// ═══════════════════════════════════════════════
//  BASE SUPPLY STOCKS
//
//  Realistic prepositioned munitions per theater base.
//  Al Udeid is the major hub; Diego Garcia is the rear
//  depot with slow production (CONUS shipments simulated
//  as local production at 1/hr).
// ═══════════════════════════════════════════════

export const usaBaseSupply: Record<string, WeaponStock[]> = {
  al_udeid: [
    { weaponId: 'pac3_mse',  count: 48, maxCount: 48, productionRate: 0 },
    { weaponId: 'tomahawk',  count: 32, maxCount: 32, productionRate: 0 },
    { weaponId: 'jassm_er',  count: 16, maxCount: 16, productionRate: 0 },
  ],

  al_dhafra: [
    { weaponId: 'pac3_mse',  count: 32, maxCount: 32, productionRate: 0 },
    { weaponId: 'sm6',       count: 16, maxCount: 16, productionRate: 0 },
  ],

  prince_sultan: [
    { weaponId: 'pac3_mse',  count: 24, maxCount: 24, productionRate: 0 },
    { weaponId: 'tomahawk',  count: 16, maxCount: 16, productionRate: 0 },
  ],

  ali_al_salem: [
    { weaponId: 'pac3_mse',  count: 16, maxCount: 16, productionRate: 0 },
  ],

  incirlik: [
    { weaponId: 'pac3_mse',  count: 16, maxCount: 16, productionRate: 0 },
    { weaponId: 'tomahawk',  count: 24, maxCount: 24, productionRate: 0 },
  ],

  // Rear depot — Diego Garcia simulates CONUS resupply pipeline
  // productionRate: 1 per hour for each type (slow trickle via airlift/sealift)
  diego_garcia: [
    { weaponId: 'tomahawk',  count: 96, maxCount: 96, productionRate: 1 },
    { weaponId: 'jassm_er',  count: 32, maxCount: 32, productionRate: 1 },
    { weaponId: 'pac3_mse',  count: 48, maxCount: 48, productionRate: 1 },
  ],
}

// ═══════════════════════════════════════════════
//  SUPPLY LINES
//
//  Connections between US bases. All theater links
//  capacity 100, health 100. Diego Garcia → Al Dhafra
//  is long-range rear supply with reduced capacity.
//  Distances computed from actual base coordinates.
// ═══════════════════════════════════════════════

function makeLine(
  fromId: string,
  toId: string,
  capacity: number,
): SupplyLine {
  const from = basePositions[fromId as keyof typeof basePositions]
  const to = basePositions[toId as keyof typeof basePositions]
  return {
    id: `supply_usa_${fromId}_${toId}`,
    fromBaseId: fromId,
    toBaseId: toId,
    capacity,
    health: 100,
    distance_km: Math.round(haversine(from, to)),
  }
}

export const usaSupplyLines: SupplyLine[] = [
  // Gulf theater links
  makeLine('al_udeid', 'al_dhafra', 100),        // Qatar ↔ UAE (~350 km)
  makeLine('al_udeid', 'ali_al_salem', 100),      // Qatar ↔ Kuwait (~500 km)
  makeLine('al_dhafra', 'prince_sultan', 100),     // UAE ↔ Saudi (~600 km)
  makeLine('ali_al_salem', 'prince_sultan', 100),  // Kuwait ↔ Saudi (~300 km)

  // Long-range rear supply line
  makeLine('diego_garcia', 'al_dhafra', 50),       // BIOT → UAE (reduced capacity)
]
