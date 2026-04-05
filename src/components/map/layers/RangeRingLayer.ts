import turfCircle from '@turf/circle'
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import { adSystems } from '@/data/weapons/air-defense'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { ViewUnit } from '@/types/view'

// Build a reverse map: interceptorId → engagement_range_km
const interceptorRangeMap: Record<string, number> = {}
for (const sys of Object.values(adSystems)) {
  interceptorRangeMap[sys.interceptorId] = sys.engagement_range_km
}

const NATION_STYLES = {
  usa: { fill: 'rgba(68, 136, 204, 0.08)', stroke: 'rgba(68, 136, 204, 0.3)' },
  iran: { fill: 'rgba(204, 68, 68, 0.08)', stroke: 'rgba(204, 68, 68, 0.3)' },
} as const

const SAM_STYLE = { fill: 'rgba(50, 200, 100, 0.12)', stroke: 'rgba(50, 200, 100, 0.5)' }

export function createRangeRingGeoJSON(units: ViewUnit[]): FeatureCollection {
  const features: Feature<Polygon>[] = []

  for (const unit of units) {
    if (unit.status === 'destroyed') continue

    for (const loadout of unit.weapons) {
      const spec = weaponSpecs[loadout.weaponId]
      if (!spec) continue

      if (spec.type === 'sam') {
        // Use adSystem engagement range keyed by interceptorId
        const range = interceptorRangeMap[loadout.weaponId]
        if (!range) continue

        const circle = turfCircle(
          [unit.position.lng, unit.position.lat],
          range,
          { steps: 64, units: 'kilometers' },
        )
        features.push({
          ...circle,
          properties: {
            nation: unit.nation,
            ringType: 'sam' as const,
            unitName: unit.name,
            weaponName: spec.name,
            range_km: range,
            fill: SAM_STYLE.fill,
            stroke: SAM_STYLE.stroke,
            strokeDash: false,
          },
        })
      } else {
        // Offensive missile — use weapon spec range_km
        const range = spec.range_km
        if (!range) continue

        const circle = turfCircle(
          [unit.position.lng, unit.position.lat],
          range,
          { steps: 64, units: 'kilometers' },
        )
        features.push({
          ...circle,
          properties: {
            nation: unit.nation,
            ringType: 'missile' as const,
            unitName: unit.name,
            weaponName: spec.name,
            range_km: range,
            fill: NATION_STYLES[unit.nation]?.fill ?? 'rgba(200,200,200,0.08)',
            stroke: NATION_STYLES[unit.nation]?.stroke ?? 'rgba(200,200,200,0.3)',
            strokeDash: true,
          },
        })
      }
    }
  }

  return { type: 'FeatureCollection', features }
}
