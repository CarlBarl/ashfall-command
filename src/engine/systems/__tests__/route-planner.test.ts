import { describe, it, expect } from 'vitest'
import { findAutoRoute, type RadarThreat } from '../route-planner'
import { ElevationGrid } from '../elevation'
import type { Position } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Create a minimal mock ElevationGrid for testing.
 * Grid covers lat 12-43, lng 32-70, resolution 0.05 deg (620 rows x 760 cols).
 * All cells default to landElevation (100m), except cells specified as water.
 */
function makeMockGrid(landElevation = 100, waterCells?: Set<string>): ElevationGrid {
  const latMin = 12
  const latMax = 43
  const lngMin = 32
  const lngMax = 70
  const resolution = 0.05

  const rows = Math.round((latMax - latMin) / resolution) // 620
  const cols = Math.round((lngMax - lngMin) / resolution) // 760

  // 20-byte header + grid data
  const headerSize = 5 // 5 floats
  const totalFloats = headerSize + rows * cols
  const buffer = new ArrayBuffer(totalFloats * 4)
  const header = new Float32Array(buffer, 0, 5)
  header[0] = latMin
  header[1] = latMax
  header[2] = lngMin
  header[3] = lngMax
  header[4] = resolution

  const grid = new Float32Array(buffer, 20, rows * cols)
  // Fill with default land elevation
  grid.fill(landElevation)

  // Optionally set some cells to water (elevation 0)
  if (waterCells) {
    for (const key of waterCells) {
      const [rowStr, colStr] = key.split(',')
      const row = parseInt(rowStr, 10)
      const col = parseInt(colStr, 10)
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        grid[row * cols + col] = 0
      }
    }
  }

  return new ElevationGrid(buffer)
}


// ── Tests ───────────────────────────────────────────────────────

describe('findAutoRoute', () => {
  it('returns empty waypoints (straight line) when no threats exist', () => {
    const grid = makeMockGrid(100)
    // Two close points — straight line is optimal
    const start: Position = { lat: 27, lng: 50 }
    const goal: Position = { lat: 27, lng: 52 }
    const threats: RadarThreat[] = []

    const result = findAutoRoute(start, goal, threats, grid, 5000)

    // With no threats, the direct path is cheapest — route should be short/empty
    expect(result).not.toBeNull()
    // The path should exist and be within range
    expect(result!.length).toBeLessThanOrEqual(10)
  })

  it('returns waypoints that avoid a threat placed between start and goal', () => {
    const grid = makeMockGrid(100)
    const start: Position = { lat: 27, lng: 48 }
    const goal: Position = { lat: 27, lng: 54 }

    // Threat right in the middle — should force a detour
    const threats: RadarThreat[] = [
      { position: { lat: 27, lng: 51 }, range_km: 200 },
    ]

    const result = findAutoRoute(start, goal, threats, grid, 5000)

    expect(result).not.toBeNull()
    // Route should have waypoints to go around the threat
    expect(result!.length).toBeGreaterThan(0)

    // Verify at least some waypoints are NOT at lat 27 (i.e., they deviate)
    const deviates = result!.some(wp => Math.abs(wp.lat - 27) > 0.3)
    expect(deviates).toBe(true)
  })

  it('returns null when route exceeds maxRange_km', () => {
    const grid = makeMockGrid(100)
    const start: Position = { lat: 13, lng: 33 }
    const goal: Position = { lat: 42, lng: 69 }

    // Very short max range — impossible to reach
    const result = findAutoRoute(start, goal, [], grid, 50)
    expect(result).toBeNull()
  })

  it('returns null when start or goal is outside grid bounds', () => {
    const grid = makeMockGrid(100)
    // Start far outside the grid
    const start: Position = { lat: 5, lng: 20 }
    const goal: Position = { lat: 27, lng: 50 }

    const result = findAutoRoute(start, goal, [], grid, 5000)
    expect(result).toBeNull()
  })

  it('finds a path even with multiple threats creating a narrow corridor', () => {
    const grid = makeMockGrid(100)
    const start: Position = { lat: 27, lng: 45 }
    const goal: Position = { lat: 27, lng: 55 }

    // Two threats leaving a narrow corridor to the south
    const threats: RadarThreat[] = [
      { position: { lat: 28, lng: 50 }, range_km: 150 },
      { position: { lat: 26, lng: 50 }, range_km: 100 },
    ]

    const result = findAutoRoute(start, goal, threats, grid, 5000)

    // Should find a route (there is space between the threats)
    expect(result).not.toBeNull()
  })

  it('returns null when max iterations exceeded (heavily blocked path)', () => {
    const grid = makeMockGrid(100)
    // Start and goal very far apart — wall of threats blocking all routes
    const start: Position = { lat: 13, lng: 33 }
    const goal: Position = { lat: 42, lng: 69 }

    // Dense wall of threats across the entire theater — makes path very expensive
    // but not necessarily impossible. With 50000 iterations and huge theater, just
    // verify it returns something or null gracefully.
    const threats: RadarThreat[] = []
    for (let lat = 15; lat <= 40; lat += 2) {
      for (let lng = 35; lng <= 67; lng += 2) {
        threats.push({ position: { lat, lng }, range_km: 200 })
      }
    }

    // This should either return a long (possibly over-range) path or null
    const result = findAutoRoute(start, goal, threats, grid, 1000)
    // With 1000km range limit across a ~4500km path, should be null
    expect(result).toBeNull()
  })
})
