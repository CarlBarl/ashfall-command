import type { FrontlineSegment } from '@/types/ground'

const NATION_COLORS: Record<string, string> = {
  usa: '#4488cc',
  iran: '#cc4444',
  germany: '#666666',
  poland: '#cc6633',
}

const TERRITORY_FILLS: Record<string, string> = {
  usa: 'rgba(68, 136, 204, 0.12)',
  iran: 'rgba(204, 68, 68, 0.12)',
  germany: 'rgba(102, 102, 102, 0.12)',
  poland: 'rgba(204, 102, 51, 0.12)',
}

/**
 * Convert FrontlineSegment[] to GeoJSON LineString features.
 * Each segment's coordinates are already [lng, lat][] from the engine.
 */
export function createFrontlineGeoJSON(
  segments: FrontlineSegment[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = segments.map((seg, i) => ({
    type: 'Feature' as const,
    properties: {
      id: `frontline-${i}`,
      sideA: seg.sideA,
      sideB: seg.sideB,
      color: NATION_COLORS[seg.sideA] ?? '#888888',
    },
    geometry: {
      type: 'LineString' as const,
      coordinates: seg.coordinates,
    },
  }))

  return { type: 'FeatureCollection', features }
}

/**
 * Convert territory data to GeoJSON Polygon features.
 */
export function createTerritoryGeoJSON(
  territories: { nation: string; polygon: [number, number][][] }[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = territories.map((zone, i) => ({
    type: 'Feature' as const,
    properties: {
      id: `territory-${i}`,
      nation: zone.nation,
      fill: TERRITORY_FILLS[zone.nation] ?? 'rgba(136, 136, 136, 0.1)',
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: zone.polygon,
    },
  }))

  return { type: 'FeatureCollection', features }
}

export const FRONTLINE_LAYER_STYLE = {
  id: 'frontline-line',
  type: 'line' as const,
  source: 'frontline-source',
  paint: {
    'line-color': ['get', 'color'] as unknown as string,
    'line-width': 5,
    'line-blur': 2,
    'line-opacity': 0.8,
  },
  layout: {
    'line-cap': 'round' as const,
    'line-join': 'round' as const,
  },
}

export const TERRITORY_FILL_STYLE = {
  id: 'territory-fill',
  type: 'fill' as const,
  source: 'territory-source',
  paint: {
    'fill-color': ['get', 'fill'] as unknown as string,
    'fill-opacity': 1,
  },
}

export const TERRITORY_OUTLINE_STYLE = {
  id: 'territory-outline',
  type: 'line' as const,
  source: 'territory-source',
  paint: {
    'line-color': ['get', 'fill'] as unknown as string,
    'line-width': 1,
    'line-opacity': 0.4,
  },
}
