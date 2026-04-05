import turfCircle from '@turf/circle'
import turfUnion from '@turf/union'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import { adSystems } from '@/data/weapons/air-defense'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { ViewUnit } from '@/types/view'

// Build a reverse map: interceptorId → engagement_range_km
const interceptorRangeMap: Record<string, number> = {}
for (const sys of Object.values(adSystems)) {
  interceptorRangeMap[sys.interceptorId] = sys.engagement_range_km
}

/**
 * Group key for merging overlapping rings.
 * Rings with the same weapon + nation get merged into one polygon.
 */
function ringKey(weaponId: string, nation: string, ringType: string): string {
  return `${weaponId}_${nation}_${ringType}`
}

export function createRangeRingGeoJSON(units: ViewUnit[]): FeatureCollection {
  // Collect circles grouped by weapon+nation for merging
  const groups = new Map<string, {
    circles: Feature<Polygon>[]
    weaponName: string
    range_km: number
    nation: string
    ringType: 'sam' | 'missile'
  }>()

  for (const unit of units) {
    if (unit.status === 'destroyed') continue

    for (const loadout of unit.weapons) {
      const spec = weaponSpecs[loadout.weaponId]
      if (!spec) continue

      let range: number
      let ringType: 'sam' | 'missile'

      if (spec.type === 'sam') {
        range = interceptorRangeMap[loadout.weaponId]
        if (!range) continue
        ringType = 'sam'
      } else {
        range = spec.range_km
        if (!range) continue
        ringType = 'missile'
      }

      const circle = turfCircle(
        [unit.position.lng, unit.position.lat],
        range,
        { steps: 64, units: 'kilometers' },
      )

      const key = ringKey(loadout.weaponId, unit.nation, ringType)
      if (!groups.has(key)) {
        groups.set(key, {
          circles: [],
          weaponName: spec.name,
          range_km: range,
          nation: unit.nation,
          ringType,
        })
      }
      groups.get(key)!.circles.push(circle)
    }
  }

  // Merge overlapping circles within each group
  const features: Feature<Polygon | MultiPolygon>[] = []

  for (const [, group] of groups) {
    let merged: Feature<Polygon | MultiPolygon> | null = null

    for (const circle of group.circles) {
      if (!merged) {
        merged = circle as Feature<Polygon | MultiPolygon>
      } else {
        try {
          const result: Feature<Polygon | MultiPolygon> | null = turfUnion(
            { type: 'FeatureCollection', features: [merged, circle] } as FeatureCollection<Polygon | MultiPolygon>,
          )
          if (result) merged = result
        } catch {
          // Union failed (rare edge case) — keep last merged
        }
      }
    }

    if (merged) {
      const isSam = group.ringType === 'sam'
      merged.properties = {
        nation: group.nation,
        ringType: group.ringType,
        weaponName: group.weaponName,
        range_km: group.range_km,
        label: `${group.weaponName} ${group.range_km}km`,
        // SAM: green, no fill (outline only)
        // Offensive: nation color, light fill, dashed
        fill: isSam ? 'rgba(50, 220, 100, 0.04)' : group.nation === 'usa' ? 'rgba(68, 136, 204, 0.05)' : 'rgba(204, 68, 68, 0.05)',
        stroke: isSam ? 'rgba(50, 220, 100, 0.6)' : group.nation === 'usa' ? 'rgba(68, 136, 204, 0.3)' : 'rgba(204, 68, 68, 0.3)',
      }
      features.push(merged)
    }
  }

  return { type: 'FeatureCollection', features } as FeatureCollection
}
