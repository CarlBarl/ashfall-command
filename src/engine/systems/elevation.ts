import type { Position } from '@/types/game'

/**
 * ElevationGrid — loads a binary theater elevation file and provides
 * O(1) elevation lookups for terrain-aware gameplay.
 *
 * Binary format:
 *   20-byte header: 5 x Float32 = [latMin, latMax, lngMin, lngMax, resolution]
 *   Remainder: row-major Float32 grid (south-to-north, west-to-east)
 *
 * Theater: lat 12-43, lng 32-70, resolution 0.05 deg
 * Grid: 620 rows x 760 cols
 */
export class ElevationGrid {
  private grid: Float32Array
  private latMin: number
  private lngMin: number
  private rows: number
  private cols: number
  private resolution: number

  constructor(buffer: ArrayBuffer) {
    // Parse 20-byte header: 5 x Float32
    const header = new Float32Array(buffer, 0, 5)
    const latMin = header[0]
    const latMax = header[1]
    const lngMin = header[2]
    const lngMax = header[3]
    const resolution = header[4]

    this.latMin = latMin
    this.lngMin = lngMin
    this.resolution = resolution

    // IMPORTANT: use Math.round() because Float32 representation of 0.05
    // is 0.050000000745... which causes off-by-one without rounding
    this.rows = Math.round((latMax - latMin) / resolution)
    this.cols = Math.round((lngMax - lngMin) / resolution)

    // Grid data starts after the 20-byte header
    const expectedFloats = this.rows * this.cols
    this.grid = new Float32Array(buffer, 20, expectedFloats)
  }

  /**
   * O(1) elevation lookup. Returns meters above sea level.
   * Returns 0 for out-of-bounds queries (treated as sea level).
   */
  getElevation(lat: number, lng: number): number {
    const row = Math.round((lat - this.latMin) / this.resolution)
    const col = Math.round((lng - this.lngMin) / this.resolution)

    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return 0
    }

    return this.grid[row * this.cols + col]
  }

  /** True if position is water (elevation <= 0) */
  isWater(lat: number, lng: number): boolean {
    return this.getElevation(lat, lng) <= 0
  }

  /** Sample N elevation points along a line between two positions */
  sampleLine(from: Position, to: Position, samples: number): number[] {
    if (samples < 2) return [this.getElevation(from.lat, from.lng)]

    const result: number[] = []
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1)
      const lat = from.lat + t * (to.lat - from.lat)
      const lng = from.lng + t * (to.lng - from.lng)
      result.push(this.getElevation(lat, lng))
    }
    return result
  }
}
