import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, polygon } from '@turf/helpers'
import type { UnitCategory } from '@/types/game'

// ═══════════════════════════════════════════════
//  SIMPLIFIED WATER ZONE POLYGONS
//  Covers the game theater: Persian Gulf, Gulf of
//  Oman, Arabian Sea, Red Sea, Caspian Sea.
//  Coordinates are [lng, lat] per GeoJSON spec.
// ═══════════════════════════════════════════════

const PERSIAN_GULF = polygon([[
  [48.0, 30.5],
  [48.5, 29.5],
  [49.0, 28.8],
  [49.5, 27.5],
  [50.0, 26.5],
  [50.5, 26.0],
  [51.0, 25.5],
  [51.5, 25.2],
  [52.0, 24.8],
  [53.0, 24.5],
  [54.0, 24.3],
  [55.0, 24.8],
  [55.5, 25.3],
  [56.0, 26.0],
  [56.3, 26.5],
  [56.3, 27.0],
  [56.0, 27.2],
  [55.5, 27.0],
  [55.0, 26.8],
  [54.5, 26.7],
  [54.0, 26.6],
  [53.0, 26.7],
  [52.0, 27.0],
  [51.0, 27.5],
  [50.5, 28.0],
  [50.0, 28.8],
  [49.5, 29.5],
  [49.0, 30.0],
  [48.5, 30.3],
  [48.0, 30.5],
]])

const GULF_OF_OMAN = polygon([[
  [56.3, 27.0],
  [56.5, 26.5],
  [57.0, 25.5],
  [57.5, 25.0],
  [58.0, 24.5],
  [58.5, 24.0],
  [59.0, 23.5],
  [59.5, 23.0],
  [60.0, 22.5],
  [61.0, 22.5],
  [61.5, 23.0],
  [61.0, 24.0],
  [60.0, 25.0],
  [59.0, 25.5],
  [58.0, 26.0],
  [57.5, 26.5],
  [57.0, 27.0],
  [56.3, 27.0],
]])

const ARABIAN_SEA = polygon([[
  [57.0, 25.0],
  [58.0, 24.0],
  [59.0, 23.0],
  [60.0, 22.0],
  [61.0, 21.0],
  [62.0, 20.0],
  [65.0, 18.0],
  [68.0, 18.0],
  [70.0, 20.0],
  [70.0, 22.0],
  [68.0, 23.5],
  [66.0, 24.5],
  [64.0, 25.0],
  [62.0, 25.5],
  [61.0, 25.0],
  [60.0, 25.0],
  [59.0, 25.5],
  [58.0, 25.5],
  [57.0, 25.0],
]])

const RED_SEA = polygon([[
  [32.5, 28.0],
  [33.0, 27.5],
  [33.5, 27.0],
  [34.0, 26.0],
  [35.0, 24.0],
  [36.0, 22.0],
  [37.0, 20.0],
  [38.5, 18.0],
  [40.0, 16.0],
  [42.0, 14.0],
  [43.5, 12.5],
  [44.0, 12.5],
  [43.0, 14.0],
  [41.5, 16.0],
  [40.0, 18.0],
  [39.0, 20.0],
  [38.0, 22.0],
  [37.0, 24.0],
  [36.0, 26.0],
  [35.0, 27.0],
  [34.5, 27.5],
  [34.0, 28.0],
  [33.5, 28.5],
  [33.0, 28.5],
  [32.5, 28.0],
]])

const CASPIAN_SEA = polygon([[
  [48.5, 42.5],
  [49.0, 41.5],
  [49.5, 40.5],
  [50.0, 39.5],
  [50.5, 39.0],
  [51.0, 38.0],
  [51.5, 37.5],
  [52.0, 37.0],
  [52.5, 37.0],
  [53.0, 37.0],
  [53.5, 37.5],
  [54.0, 38.5],
  [53.5, 39.5],
  [53.0, 40.5],
  [52.0, 41.5],
  [51.0, 42.0],
  [50.0, 42.5],
  [49.0, 42.5],
  [48.5, 42.5],
]])

const WATER_ZONES = [PERSIAN_GULF, GULF_OF_OMAN, ARABIAN_SEA, RED_SEA, CASPIAN_SEA]

/** Check if a coordinate is over water */
export function isWater(lat: number, lng: number): boolean {
  const pt = point([lng, lat])
  return WATER_ZONES.some(zone => booleanPointInPolygon(pt, zone))
}

/** Land-only unit categories */
const LAND_CATEGORIES: Set<UnitCategory> = new Set([
  'sam_site',
  'airbase',
  'missile_battery',
  'naval_base',
])

/** Water-only unit categories */
const WATER_CATEGORIES: Set<UnitCategory> = new Set([
  'ship',
  'submarine',
  'carrier_group',
])

/** Check if placing a unit category at this position is valid */
export function isValidPlacement(category: UnitCategory, lat: number, lng: number): boolean {
  const water = isWater(lat, lng)

  if (LAND_CATEGORIES.has(category) && water) return false
  if (WATER_CATEGORIES.has(category) && !water) return false

  return true
}
