import turfCircle from '@turf/circle'
import type { ViewUnit } from '@/types/view'

export function createMinefieldGeoJSON(units: ViewUnit[]): GeoJSON.FeatureCollection {
  const minefields = units.filter(u => u.category === 'minefield' && u.status !== 'destroyed')

  return {
    type: 'FeatureCollection',
    features: minefields.map(u => {
      const radius = u.radius_km ?? 10
      const circle = turfCircle([u.position.lng, u.position.lat], radius, { steps: 32, units: 'kilometers' })
      return {
        ...circle,
        properties: {
          ...circle.properties,
          id: u.id,
          name: u.name,
          nation: u.nation,
          health: u.health,
          radius_km: radius,
        },
      }
    }),
  }
}
