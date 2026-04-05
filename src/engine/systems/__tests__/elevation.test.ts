import { describe, it, expect } from 'vitest'
import { ElevationGrid } from '../elevation'

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a minimal ElevationGrid from known parameters.
 * Binary format: 20-byte header (5 x Float32) + row-major Float32 grid.
 */
function makeGrid(
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number,
  resolution: number,
  elevations: number[][],
): ElevationGrid {
  const rows = elevations.length
  const cols = elevations[0].length

  // 5 header floats + rows*cols data floats
  const buffer = new ArrayBuffer(20 + rows * cols * 4)
  const header = new Float32Array(buffer, 0, 5)
  header[0] = latMin
  header[1] = latMax
  header[2] = lngMin
  header[3] = lngMax
  header[4] = resolution

  const data = new Float32Array(buffer, 20, rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      data[r * cols + c] = elevations[r][c]
    }
  }

  return new ElevationGrid(buffer)
}

// ── Tests ───────────────────────────────────────────────────────

describe('ElevationGrid.getElevation', () => {
  it('returns correct elevation for in-bounds query', () => {
    // 3x3 grid: lat 10-13, lng 20-23, resolution 1.0
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    // Row 0, Col 0 => lat=10, lng=20 => 100
    expect(grid.getElevation(10, 20)).toBe(100)
    // Row 1, Col 1 => lat=11, lng=21 => 500
    expect(grid.getElevation(11, 21)).toBe(500)
    // Row 2, Col 2 => lat=12, lng=22 => 900
    expect(grid.getElevation(12, 22)).toBe(900)
  })

  it('returns 0 for out-of-bounds latitude (too low)', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    expect(grid.getElevation(5, 21)).toBe(0)
  })

  it('returns 0 for out-of-bounds latitude (too high)', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    expect(grid.getElevation(50, 21)).toBe(0)
  })

  it('returns 0 for out-of-bounds longitude (too low)', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    expect(grid.getElevation(11, 10)).toBe(0)
  })

  it('returns 0 for out-of-bounds longitude (too high)', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    expect(grid.getElevation(11, 50)).toBe(0)
  })
})

describe('ElevationGrid.isWater', () => {
  it('returns true for elevation <= 0 (water)', () => {
    const grid = makeGrid(10, 12, 20, 22, 1.0, [
      [-10, 0],
      [100, -5],
    ])
    expect(grid.isWater(10, 20)).toBe(true)  // -10 => water
    expect(grid.isWater(10, 21)).toBe(true)  // 0 => water (at sea level)
    expect(grid.isWater(11, 21)).toBe(true)  // -5 => water
  })

  it('returns false for elevation > 0 (land)', () => {
    const grid = makeGrid(10, 12, 20, 22, 1.0, [
      [-10, 0],
      [100, -5],
    ])
    expect(grid.isWater(11, 20)).toBe(false)  // 100 => land
  })

  it('returns true for out-of-bounds (treated as sea level = 0)', () => {
    const grid = makeGrid(10, 12, 20, 22, 1.0, [
      [500, 500],
      [500, 500],
    ])
    // Out of bounds returns 0, which is <= 0
    expect(grid.isWater(0, 0)).toBe(true)
  })
})

describe('ElevationGrid.sampleLine', () => {
  it('returns correct number of samples', () => {
    const grid = makeGrid(10, 14, 20, 24, 1.0, [
      [100, 200, 300, 400],
      [150, 250, 350, 450],
      [200, 300, 400, 500],
      [250, 350, 450, 550],
    ])
    const from = { lat: 10, lng: 20 }
    const to = { lat: 13, lng: 23 }

    const samples5 = grid.sampleLine(from, to, 5)
    expect(samples5).toHaveLength(5)

    const samples10 = grid.sampleLine(from, to, 10)
    expect(samples10).toHaveLength(10)
  })

  it('returns single sample when samples < 2', () => {
    const grid = makeGrid(10, 12, 20, 22, 1.0, [
      [100, 200],
      [300, 400],
    ])
    const from = { lat: 10, lng: 20 }
    const to = { lat: 11, lng: 21 }

    const result = grid.sampleLine(from, to, 1)
    expect(result).toHaveLength(1)
    // Should return elevation at `from` position
    expect(result[0]).toBe(100)
  })

  it('first and last samples match from/to positions', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    const from = { lat: 10, lng: 20 }
    const to = { lat: 12, lng: 22 }

    const samples = grid.sampleLine(from, to, 3)
    expect(samples[0]).toBe(grid.getElevation(from.lat, from.lng))
    expect(samples[samples.length - 1]).toBe(grid.getElevation(to.lat, to.lng))
  })
})

describe('ElevationGrid.bounds', () => {
  it('returns correct bounding box', () => {
    const grid = makeGrid(10, 13, 20, 23, 1.0, [
      [100, 200, 300],
      [400, 500, 600],
      [700, 800, 900],
    ])
    const bounds = grid.bounds
    expect(bounds.latMin).toBe(10)
    expect(bounds.lngMin).toBe(20)
    // latMax = latMin + rows * resolution = 10 + 3*1 = 13
    expect(bounds.latMax).toBe(13)
    // lngMax = lngMin + cols * resolution = 20 + 3*1 = 23
    expect(bounds.lngMax).toBe(23)
  })
})

describe('ElevationGrid metadata', () => {
  it('returns correct numRows and numCols', () => {
    const grid = makeGrid(10, 14, 20, 25, 1.0, [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
      [16, 17, 18, 19, 20],
    ])
    expect(grid.numRows).toBe(4)
    expect(grid.numCols).toBe(5)
  })

  it('exposes raw data as Float32Array', () => {
    const grid = makeGrid(10, 12, 20, 22, 1.0, [
      [100, 200],
      [300, 400],
    ])
    const data = grid.data
    expect(data).toBeInstanceOf(Float32Array)
    expect(data.length).toBe(4)
  })
})
