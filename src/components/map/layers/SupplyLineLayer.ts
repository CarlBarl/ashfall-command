import type { SupplyLine } from '@/types/game'
import type { ViewUnit } from '@/types/view'

/** Generate GeoJSON FeatureCollection for supply lines between bases */
export function createSupplyLineGeoJSON(
  supplyLines: SupplyLine[],
  units: ViewUnit[],
): GeoJSON.FeatureCollection {
  const unitPos = new Map<string, [number, number]>()
  for (const u of units) {
    unitPos.set(u.id, [u.position.lng, u.position.lat])
  }

  const features: GeoJSON.Feature[] = []
  for (const line of supplyLines) {
    const from = unitPos.get(line.fromBaseId)
    const to = unitPos.get(line.toBaseId)
    if (!from || !to) continue

    features.push({
      type: 'Feature',
      properties: {
        id: line.id,
        health: line.health,
        capacity: line.capacity,
        status: line.health <= 0 ? 'cut' : line.health < 50 ? 'damaged' : 'healthy',
      },
      geometry: {
        type: 'LineString',
        coordinates: [from, to],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
