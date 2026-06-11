import type { LayerSpecification, RasterDEMSourceSpecification, StyleSpecification } from 'maplibre-gl'

export type MapMode = 'dark' | 'satellite'

// ESRI World Imagery (free for development)
const ESRI_SAT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TERRAIN_DEM_SOURCE_ID = 'terrain-dem'
export const HILLSHADE_LAYER_ID = 'terrain-hillshade'

// ── Terrain relief (roadmap A.1) ────────────────────────────────────
// Mapterhorn DEM — terrarium-encoded webp, template verified against
// https://tiles.mapterhorn.com/tilejson.json 2026-06-11.
// Fallback if Mapterhorn dies: AWS Terrain Tiles
// https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
// (encoding 'terrarium', tileSize 256).

function buildTerrainDemSource(): RasterDEMSourceSpecification {
  return {
    type: 'raster-dem',
    tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: 12, // native SRTM detail ceiling
    attribution: 'Terrain: Mapzen/Tilezen, NASA SRTM',
  }
}

// Low-contrast ops-room tuning: near-black shadows, faint blue-gray highlights —
// relief depth without fighting unit icons. Default visible; the ELV toggle
// flips visibility at runtime (GameMap).
function buildHillshadeLayer(): LayerSpecification {
  return {
    id: HILLSHADE_LAYER_ID,
    type: 'hillshade',
    source: TERRAIN_DEM_SOURCE_ID,
    paint: {
      'hillshade-exaggeration': 0.4,
      'hillshade-shadow-color': '#04060a',
      'hillshade-highlight-color': '#3d4c61',
      'hillshade-accent-color': '#0a0e14',
      // 'map' keeps shading fixed to the NW sun regardless of bearing
      'hillshade-illumination-anchor': 'map',
    },
  }
}

export function getMapStyle(mode: MapMode): StyleSpecification {
  return mode === 'dark' ? buildDarkStyle() : buildSatelliteStyle()
}

// ── Dark CIC military command-center style ──────────────────────────
// OpenFreeMap vector tiles (OpenMapTiles schema, no API key)

function buildDarkStyle(): StyleSpecification {
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
      [TERRAIN_DEM_SOURCE_ID]: buildTerrainDemSource(),
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
      },

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

      // Hillshade relief — last in-style layer; GameMap anchors the country
      // fills below it (beforeId) so shading reads over the political tint
      buildHillshadeLayer(),
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
        attribution: '&copy; Esri · Terrain: Mapzen/Tilezen, NASA SRTM',
      },
      [TERRAIN_DEM_SOURCE_ID]: buildTerrainDemSource(),
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
      buildHillshadeLayer(),
    ],
  }
}
