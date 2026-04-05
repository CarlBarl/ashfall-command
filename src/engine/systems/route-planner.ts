import type { Position } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { haversine } from '../utils/geo'

export interface RadarThreat {
  position: Position
  range_km: number
}

// Grid constants (must match ElevationGrid theater)
const GRID_LAT_MIN = 12
const GRID_LNG_MIN = 32
const GRID_LAT_MAX = 43
const GRID_LNG_MAX = 70
const RESOLUTION = 0.05 // degrees per cell (~5.5km)

// A* tuning
const MAX_ITERATIONS = 50_000
const RADAR_COST_MULTIPLIER = 50
const CLIMB_COST_FACTOR = 0.005
const SIMPLIFY_EVERY_N = 10 // keep every Nth point (~55km spacing)

// 8-directional movement: [dRow, dCol]
const NEIGHBORS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],   // cardinal
  [-1, -1], [-1, 1], [1, -1], [1, 1],  // diagonal
]

/**
 * Convert a lat/lng Position to grid row/col indices.
 * Returns null if outside grid bounds.
 */
function posToGrid(pos: Position): { row: number; col: number } | null {
  const row = Math.round((pos.lat - GRID_LAT_MIN) / RESOLUTION)
  const col = Math.round((pos.lng - GRID_LNG_MIN) / RESOLUTION)
  const rows = Math.round((GRID_LAT_MAX - GRID_LAT_MIN) / RESOLUTION)
  const cols = Math.round((GRID_LNG_MAX - GRID_LNG_MIN) / RESOLUTION)
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null
  return { row, col }
}

/** Convert grid row/col back to a Position (cell center). */
function gridToPos(row: number, col: number): Position {
  return {
    lat: GRID_LAT_MIN + row * RESOLUTION,
    lng: GRID_LNG_MIN + col * RESOLUTION,
  }
}

/** Encode row,col into a single integer key for Map lookups. */
function encodeKey(row: number, col: number): number {
  // Max cols is 760, so shift row by 10 bits (1024) is sufficient.
  // Using 1024 to keep it a power of 2 for speed.
  return row * 1024 + col
}

/**
 * Check if a cell center is within any radar threat's range.
 * Uses pre-converted grid coordinates to avoid repeated lat/lng conversion.
 */
function isInRadarCoverage(
  cellLat: number,
  cellLng: number,
  threats: RadarThreat[],
): boolean {
  for (const t of threats) {
    const dLat = cellLat - t.position.lat
    const dLng = cellLng - t.position.lng
    // Quick rectangular pre-filter (~1 degree latitude = 111km)
    const approxDist_deg = Math.abs(dLat) + Math.abs(dLng) * Math.cos(cellLat * Math.PI / 180)
    const approxDist_km = approxDist_deg * 111
    if (approxDist_km > t.range_km * 1.5) continue

    // Precise check
    const dist = haversine({ lat: cellLat, lng: cellLng }, t.position)
    if (dist <= t.range_km) return true
  }
  return false
}

/**
 * Minimal binary heap (min-heap) for the A* open set.
 * Keyed by f-score, stores grid cell keys.
 */
class MinHeap {
  private data: { key: number; f: number }[] = []

  get size(): number { return this.data.length }

  push(key: number, f: number): void {
    this.data.push({ key, f })
    this._bubbleUp(this.data.length - 1)
  }

  pop(): number {
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = last
      this._sinkDown(0)
    }
    return top.key
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.data[i].f >= this.data[parent].f) break
      ;[this.data[i], this.data[parent]] = [this.data[parent], this.data[i]]
      i = parent
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && this.data[left].f < this.data[smallest].f) smallest = left
      if (right < n && this.data[right].f < this.data[smallest].f) smallest = right
      if (smallest === i) break
      ;[this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]]
      i = smallest
    }
  }
}

/**
 * Find a low-exposure route from start to goal using A* on the elevation grid.
 * Returns simplified waypoints (not every grid cell) — just the intermediates
 * (excluding start and goal).
 *
 * Returns null if:
 * - Start or goal is outside grid bounds
 * - No path found within MAX_ITERATIONS
 * - Total route distance exceeds maxRange_km
 */
export function findAutoRoute(
  start: Position,
  goal: Position,
  threats: RadarThreat[],
  grid: ElevationGrid,
  maxRange_km: number,
): Position[] | null {
  const startGrid = posToGrid(start)
  const goalGrid = posToGrid(goal)
  if (!startGrid || !goalGrid) return null

  const rows = Math.round((GRID_LAT_MAX - GRID_LAT_MIN) / RESOLUTION)
  const cols = Math.round((GRID_LNG_MAX - GRID_LNG_MIN) / RESOLUTION)

  const startKey = encodeKey(startGrid.row, startGrid.col)
  const goalKey = encodeKey(goalGrid.row, goalGrid.col)

  // If start === goal, no waypoints needed
  if (startKey === goalKey) return []

  // Precompute heuristic: haversine from goal position
  const goalPos = gridToPos(goalGrid.row, goalGrid.col)

  // g-scores and came-from maps
  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const closedSet = new Set<number>()

  gScore.set(startKey, 0)

  const openHeap = new MinHeap()
  const startH = haversine(gridToPos(startGrid.row, startGrid.col), goalPos)
  openHeap.push(startKey, startH)

  let iterations = 0

  while (openHeap.size > 0 && iterations < MAX_ITERATIONS) {
    iterations++

    const currentKey = openHeap.pop()
    if (currentKey === goalKey) {
      // Reconstruct path
      return reconstructAndSimplify(cameFrom, currentKey, start, goal, maxRange_km)
    }

    if (closedSet.has(currentKey)) continue
    closedSet.add(currentKey)

    const currentRow = (currentKey / 1024) | 0
    const currentCol = currentKey % 1024
    const currentG = gScore.get(currentKey)!
    const currentElev = grid.getElevation(
      GRID_LAT_MIN + currentRow * RESOLUTION,
      GRID_LNG_MIN + currentCol * RESOLUTION,
    )

    for (const [dr, dc] of NEIGHBORS) {
      const nr = currentRow + dr
      const nc = currentCol + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue

      const nKey = encodeKey(nr, nc)
      if (closedSet.has(nKey)) continue

      const neighborLat = GRID_LAT_MIN + nr * RESOLUTION
      const neighborLng = GRID_LNG_MIN + nc * RESOLUTION

      // Distance for this step in km
      const isDiagonal = dr !== 0 && dc !== 0
      const cellDist_km = isDiagonal
        ? RESOLUTION * 111 * Math.SQRT2
        : RESOLUTION * 111

      // Base cost = distance
      let stepCost = cellDist_km

      // Radar cost: heavy penalty if within radar coverage
      if (isInRadarCoverage(neighborLat, neighborLng, threats)) {
        stepCost += RADAR_COST_MULTIPLIER * cellDist_km
      }

      // Climb cost: penalty for elevation changes (water cells have elev <= 0, skip climb cost)
      const neighborElev = grid.getElevation(neighborLat, neighborLng)
      if (neighborElev > 0 && currentElev > 0) {
        stepCost += Math.abs(neighborElev - currentElev) * CLIMB_COST_FACTOR
      }

      const tentativeG = currentG + stepCost

      const existingG = gScore.get(nKey)
      if (existingG !== undefined && tentativeG >= existingG) continue

      gScore.set(nKey, tentativeG)
      cameFrom.set(nKey, currentKey)

      // Heuristic: haversine to goal (admissible — never overestimates)
      const h = haversine({ lat: neighborLat, lng: neighborLng }, goalPos)
      openHeap.push(nKey, tentativeG + h)
    }
  }

  // No path found within iteration limit
  return null
}

/**
 * Reconstruct the A* path, simplify it, and check range.
 * Returns intermediate waypoints (excluding start and goal).
 * Returns null if total distance exceeds maxRange_km.
 */
function reconstructAndSimplify(
  cameFrom: Map<number, number>,
  goalKey: number,
  start: Position,
  goal: Position,
  maxRange_km: number,
): Position[] | null {
  // Reconstruct full path (in reverse)
  const pathKeys: number[] = []
  let current = goalKey
  while (cameFrom.has(current)) {
    pathKeys.push(current)
    current = cameFrom.get(current)!
  }
  pathKeys.push(current) // start key
  pathKeys.reverse()

  // Convert to positions
  const fullPath = pathKeys.map(key => {
    const row = (key / 1024) | 0
    const col = key % 1024
    return gridToPos(row, col)
  })

  // Simplify: keep every Nth point (skip first and last which are start/goal grid cells)
  const intermediates: Position[] = []
  for (let i = SIMPLIFY_EVERY_N; i < fullPath.length - SIMPLIFY_EVERY_N; i += SIMPLIFY_EVERY_N) {
    intermediates.push(fullPath[i])
  }

  // Compute total distance: start -> waypoints -> goal
  const allPoints = [start, ...intermediates, goal]
  let totalDist = 0
  for (let i = 0; i < allPoints.length - 1; i++) {
    totalDist += haversine(allPoints[i], allPoints[i + 1])
  }

  if (totalDist > maxRange_km) return null

  return intermediates
}
