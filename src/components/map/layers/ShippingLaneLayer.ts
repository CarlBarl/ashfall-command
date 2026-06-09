import type { ShippingLane } from '@/types/game'

export function createShippingLaneGeoJSON(lanes: ShippingLane[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lanes.map(lane => ({
      type: 'Feature' as const,
      properties: {
        id: lane.id,
        name: lane.name,
        status: lane.status,
        suppressionFactor: lane.suppressionFactor,
        currentThroughput_mbd: lane.currentThroughput_mbd,
        baseThroughput_mbd: lane.baseThroughput_mbd,
        label: `${lane.name}: ${lane.currentThroughput_mbd.toFixed(1)} Mbd`,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: lane.path,
      },
    })),
  }
}
