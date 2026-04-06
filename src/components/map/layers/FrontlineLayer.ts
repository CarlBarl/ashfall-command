import type { FrontlineSegment } from '@/types/ground'

const NATION_COLORS: Record<string, string> = {
  germany: '#556666',
  poland: '#996644',
  usa: '#4488cc',
  iran: '#cc4444',
}

const NATION_HIGHLIGHT_COLORS: Record<string, string> = {
  germany: '#778888',
  poland: '#bb8866',
  usa: '#66aaee',
  iran: '#ee6666',
}

const TERRITORY_FILLS: Record<string, string> = {
  usa: 'rgba(68, 136, 204, 0.12)',
  iran: 'rgba(204, 68, 68, 0.12)',
  germany: 'rgba(136, 136, 136, 0.12)',
  poland: 'rgba(221, 119, 68, 0.12)',
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
      highlightColor: NATION_HIGHLIGHT_COLORS[seg.sideA] ?? '#bbbbbb',
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

/**
 * Multi-layer HoI-style painted frontline stack.
 * Spread these as individual <Layer> elements in GameMap.
 * Render order: glow (bottom) → main → highlight (top).
 */
export const FRONTLINE_LAYER_STYLES = [
  // Outer glow — subtle haze
  {
    id: 'frontline-glow',
    type: 'line' as const,
    source: 'frontline-source',
    paint: {
      'line-color': ['get', 'color'] as unknown as string,
      'line-width': 8,
      'line-blur': 4,
      'line-opacity': 0.1,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
  // Main line — the painted stroke
  {
    id: 'frontline-main',
    type: 'line' as const,
    source: 'frontline-source',
    paint: {
      'line-color': ['get', 'color'] as unknown as string,
      'line-width': 2.5,
      'line-blur': 0.5,
      'line-opacity': 0.7,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
  // Inner highlight — lighter tint center
  {
    id: 'frontline-highlight',
    type: 'line' as const,
    source: 'frontline-source',
    paint: {
      'line-color': ['get', 'highlightColor'] as unknown as string,
      'line-width': 1,
      'line-blur': 0,
      'line-opacity': 0.4,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
] as const

/** @deprecated Use FRONTLINE_LAYER_STYLES array instead */
export const FRONTLINE_LAYER_STYLE = FRONTLINE_LAYER_STYLES[1]

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
