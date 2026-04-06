import type { Nation } from '@/types/game'
import type { FrontlineSegment } from '@/types/ground'
import type { ViewTerritory } from '@/types/view'
import {
  calculatePolylineAnchor,
  calculatePolylineLengthKm,
  getFrontlineSegmentId,
  getNationLabel,
} from '../frontline-utils'

const NATION_COLORS: Record<string, string> = {
  germany: '#d5e0eb',
  poland: '#efbe91',
  usa: '#4488cc',
  iran: '#cc4444',
}

const NATION_HIGHLIGHT_COLORS: Record<string, string> = {
  germany: '#f3f7fb',
  poland: '#ffe4c8',
  usa: '#66aaee',
  iran: '#ee6666',
}

const TERRITORY_FILLS: Record<string, string> = {
  usa: 'rgba(102, 170, 238, 0.34)',
  iran: 'rgba(238, 102, 102, 0.34)',
  germany: 'rgba(213, 224, 235, 0.4)',
  poland: 'rgba(239, 190, 145, 0.38)',
}

const TERRITORY_OUTLINES: Record<string, string> = {
  usa: '#66aaee',
  iran: '#ee6666',
  germany: '#d5e0eb',
  poland: '#efbe91',
}

export const OCCUPATION_PATTERN_IDS: Record<string, string> = {
  usa: 'occupation-pattern-usa',
  iran: 'occupation-pattern-iran',
  germany: 'occupation-pattern-germany',
  poland: 'occupation-pattern-poland',
}

export const OCCUPATION_PATTERN_COLORS: Record<string, string> = {
  usa: '#66aaee',
  iran: '#ee6666',
  germany: '#d5e0eb',
  poland: '#efbe91',
}

/**
 * Convert FrontlineSegment[] to GeoJSON LineString features.
 * Each segment's coordinates are already [lng, lat][] from the engine.
 */
export function createFrontlineGeoJSON(
  segments: FrontlineSegment[],
  options?: {
    nations?: Nation[]
    hoveredId?: string | null
    selectedId?: string | null
  },
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = segments.map((seg, i) => {
    const segmentId = getFrontlineSegmentId(seg, i)
    const anchor = calculatePolylineAnchor(seg.coordinates)
    return {
      type: 'Feature' as const,
      properties: {
        id: segmentId,
        segmentId,
        sideA: seg.sideA,
        sideB: seg.sideB,
        sideALabel: options?.nations ? getNationLabel(seg.sideA, options.nations) : seg.sideA,
        sideBLabel: options?.nations ? getNationLabel(seg.sideB, options.nations) : seg.sideB,
        color: NATION_COLORS[seg.sideA] ?? '#bbbbbb',
        highlightColor: NATION_HIGHLIGHT_COLORS[seg.sideA] ?? '#ffffff',
        lengthKm: Math.round(calculatePolylineLengthKm(seg.coordinates)),
        anchorLng: anchor.lng,
        anchorLat: anchor.lat,
        hovered: segmentId === options?.hoveredId ? 1 : 0,
        selected: segmentId === options?.selectedId ? 1 : 0,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: seg.coordinates,
      },
    }
  })

  return { type: 'FeatureCollection', features }
}

/**
 * Convert territory data to GeoJSON Polygon features.
 */
export function createTerritoryGeoJSON(
  territories: ViewTerritory[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = territories.map((zone, i) => ({
    type: 'Feature' as const,
    properties: {
      id: `territory-${i}`,
      nation: zone.nation,
      owner: zone.owner ?? null,
      occupied: zone.occupied ? 1 : 0,
      fill: TERRITORY_FILLS[zone.nation] ?? 'rgba(136, 136, 136, 0.18)',
      outline: TERRITORY_OUTLINES[zone.nation] ?? '#bbbbbb',
      patternId: OCCUPATION_PATTERN_IDS[zone.nation] ?? '',
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
  // Outer glow — wide haze
  {
    id: 'frontline-glow',
    type: 'line' as const,
    source: 'frontline-source',
    paint: {
      'line-color': ['get', 'color'] as unknown as string,
      'line-width': 14,
      'line-blur': 7,
      'line-opacity': 0.22,
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
      'line-width': 4,
      'line-blur': 0.5,
      'line-opacity': 0.9,
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
      'line-width': 1.5,
      'line-blur': 0,
      'line-opacity': 0.5,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
  {
    id: 'frontline-hovered',
    type: 'line' as const,
    source: 'frontline-source',
    filter: ['==', ['get', 'hovered'], 1],
    paint: {
      'line-color': '#ffffff',
      'line-width': 7,
      'line-blur': 2,
      'line-opacity': 0.25,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
  {
    id: 'frontline-selected',
    type: 'line' as const,
    source: 'frontline-source',
    filter: ['==', ['get', 'selected'], 1],
    paint: {
      'line-color': '#f2dbab',
      'line-width': 8,
      'line-blur': 2,
      'line-opacity': 0.32,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
  {
    id: 'frontline-selected-core',
    type: 'line' as const,
    source: 'frontline-source',
    filter: ['==', ['get', 'selected'], 1],
    paint: {
      'line-color': '#f8e8c7',
      'line-width': 2.25,
      'line-blur': 0,
      'line-opacity': 0.8,
    },
    layout: {
      'line-cap': 'round' as const,
      'line-join': 'round' as const,
    },
  },
]

/** @deprecated Use FRONTLINE_LAYER_STYLES array instead */
export const FRONTLINE_LAYER_STYLE = FRONTLINE_LAYER_STYLES[1]

export const TERRITORY_FILL_STYLE = {
  id: 'territory-fill',
  type: 'fill' as const,
  source: 'territory-source',
  filter: ['==', ['get', 'occupied'], 1],
  paint: {
    'fill-color': ['get', 'fill'] as unknown as string,
    'fill-opacity': 0.68,
  },
}

export const TERRITORY_PATTERN_STYLE = {
  id: 'territory-pattern',
  type: 'fill' as const,
  source: 'territory-source',
  filter: ['==', ['get', 'occupied'], 1],
  paint: {
    'fill-pattern': ['get', 'patternId'] as unknown as string,
    'fill-opacity': 1,
  },
}

export const TERRITORY_OUTLINE_STYLE = {
  id: 'territory-outline',
  type: 'line' as const,
  source: 'territory-source',
  filter: ['==', ['get', 'occupied'], 1],
  paint: {
    'line-color': ['get', 'outline'] as unknown as string,
    'line-width': 1.5,
    'line-opacity': 0.85,
    'line-dasharray': [2, 2],
  },
}

export const TERRITORY_LAYER_STYLES = [
  TERRITORY_FILL_STYLE,
  TERRITORY_PATTERN_STYLE,
  TERRITORY_OUTLINE_STYLE,
]
