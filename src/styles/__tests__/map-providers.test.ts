import { describe, it, expect } from 'vitest'
import { getMapStyle, HILLSHADE_LAYER_ID, TERRAIN_DEM_SOURCE_ID } from '../map-providers'

const MODES = ['dark', 'satellite'] as const

describe.each(MODES)('getMapStyle(%s) — terrain relief contract', (mode) => {
  const style = getMapStyle(mode)

  it('carries the terrarium raster-dem source capped at z12', () => {
    const src = style.sources[TERRAIN_DEM_SOURCE_ID] as {
      type?: string
      tiles?: string[]
      encoding?: string
      tileSize?: number
      maxzoom?: number
      attribution?: string
    }
    expect(src).toBeDefined()
    expect(src.type).toBe('raster-dem')
    expect(src.encoding).toBe('terrarium')
    expect(src.tileSize).toBe(512)
    expect(src.maxzoom).toBe(12)
    expect(src.tiles).toEqual(['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'])
    expect(src.attribution).toContain('Mapzen/Tilezen, NASA SRTM')
  })

  it('carries a hillshade layer on that source, visible by default', () => {
    const layer = style.layers.find((l) => l.id === HILLSHADE_LAYER_ID) as
      | { type: string; source?: string; layout?: { visibility?: string }; paint?: Record<string, unknown> }
      | undefined
    expect(layer).toBeDefined()
    expect(layer?.type).toBe('hillshade')
    expect(layer?.source).toBe(TERRAIN_DEM_SOURCE_ID)
    expect(layer?.layout?.visibility).not.toBe('none')
    expect(layer?.paint?.['hillshade-exaggeration']).toBe(0.4)
  })

  it('is a plain JSON style object (serializable, version 8, unique layer ids)', () => {
    expect(style.version).toBe(8)
    expect(JSON.parse(JSON.stringify(style))).toEqual(style)
    const ids = style.layers.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
