import type { StyleSpecification } from 'maplibre-gl'

export type MapMode = 'dark' | 'satellite'

// ESRI World Imagery (free for development)
const ESRI_SAT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export function getMapStyle(mode: MapMode, hideModernBorders = false): StyleSpecification {
  return mode === 'dark' ? buildDarkStyle(hideModernBorders) : buildSatelliteStyle()
}

// ── Dark CIC military command-center style ──────────────────────────
// OpenFreeMap vector tiles (OpenMapTiles schema, no API key)

function buildDarkStyle(hideModernBorders: boolean): StyleSpecification {
  if (hideModernBorders) {
    return {
      version: 8,
      name: 'realpolitik-historical',
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#0c121a',
          },
        },
      ],
    }
  }

  return {
    version: 8,
    name: 'realpolitik-dark',
    // Glyphs needed even if we don't show text — MapLibre warns without them
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
    },
    layers: [
      // Background — very dark, CIC operations room
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#0a0e14',
        },
      },

      // Landcover — subtle dark charcoal tint for forests/grass
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-color': '#111820',
          'fill-opacity': 0.4,
        },
      },

      // Water bodies — dark navy
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#0d1b2a',
        },
      },

      // Waterway lines — subtle rivers/canals
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#0f1f30',
          'line-width': 0.5,
          'line-opacity': 0.6,
        },
      },

      // Country boundaries — dim green (military map aesthetic)
      // Hidden when using historical borders (1939 GeoJSON provides its own)
      ...(!hideModernBorders ? [
        {
          id: 'boundary-country',
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'boundary',
          filter: ['==', ['get', 'admin_level'], 2],
          paint: {
            'line-color': '#1a3a1a',
            'line-width': 1,
            'line-opacity': 0.7,
          },
        } as StyleSpecification['layers'][number],
      ] : []),

      // Coastline effect — slightly brighter edge where land meets water
      {
        id: 'water-outline',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'line-color': '#1e3828',
          'line-width': 0.5,
          'line-opacity': 0.4,
        },
      },

      // Capital cities — tiny dim dots at zoom 6+
      {
        id: 'place-capital',
        type: 'circle',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['==', ['get', 'capital'], 2],
        minzoom: 6,
        paint: {
          'circle-radius': 2,
          'circle-color': '#2a4a2a',
          'circle-opacity': 0.5,
        },
      },
    ],
  }
}

// ── Satellite style ─────────────────────────────────────────────────
// ESRI World Imagery with muted tint for military aesthetic

function buildSatelliteStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'realpolitik-satellite',
    sources: {
      'esri-sat': {
        type: 'raster',
        tiles: [ESRI_SAT],
        tileSize: 256,
        attribution: '&copy; Esri',
      },
    },
    layers: [
      {
        id: 'satellite',
        type: 'raster',
        source: 'esri-sat',
        paint: {
          'raster-saturation': -0.3,
          'raster-brightness-max': 0.8,
        },
      },
    ],
  }
}
