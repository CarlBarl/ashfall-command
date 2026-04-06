import type { GameState, NationId } from '@/types/game'
import type {
  ControlGrid,
  ControlCell,
  FrontlineSegment,
  GroundUnit,
  GroundUnitId,
  DivisionStance,
  TerrainType,
} from '@/types/ground'

// ── Module-level state (must be reset on save/load) ─────────────

let cachedFrontlines: FrontlineSegment[] = []
interface TerritoryPolygon {
  nation: string
  owner?: string | null
  occupied?: boolean
  polygon: [number, number][][]
}

let cachedTerritories: TerritoryPolygon[] = []
let gridDirty = true

export function resetFrontlineState(): void {
  cachedFrontlines = []
  cachedTerritories = []
  gridDirty = true
}

/** Get the cached frontlines (computed by processFrontline) */
export function getCachedFrontlines(): FrontlineSegment[] {
  return cachedFrontlines
}

/** Get the cached territory polygons (computed by processFrontline) */
export function getCachedTerritories(): TerritoryPolygon[] {
  return cachedTerritories
}

// ── Coordinate conversion ───────────────────────────────────────

const KM_PER_DEG_LAT = 111.0

export function cellToLatLng(
  row: number,
  col: number,
  grid: ControlGrid,
): { lat: number; lng: number } {
  const lat = grid.originLat + row * (grid.cellSizeKm / KM_PER_DEG_LAT)
  const cosLat = Math.cos(lat * Math.PI / 180)
  const lng = grid.originLng + col * (grid.cellSizeKm / (KM_PER_DEG_LAT * cosLat))
  return { lat, lng }
}

export function latLngToCell(
  lat: number,
  lng: number,
  grid: ControlGrid,
): { row: number; col: number } {
  const row = Math.round((lat - grid.originLat) / (grid.cellSizeKm / KM_PER_DEG_LAT))
  const cosLat = Math.cos(lat * Math.PI / 180)
  const col = Math.round((lng - grid.originLng) / (grid.cellSizeKm / (KM_PER_DEG_LAT * cosLat)))

  return {
    row: Math.max(0, Math.min(grid.rows - 1, row)),
    col: Math.max(0, Math.min(grid.cols - 1, col)),
  }
}

// ── Grid initialization ─────────────────────────────────────────

export function initControlGrid(
  rows: number,
  cols: number,
  originLat: number,
  originLng: number,
  cellSizeKm: number,
  terrainData: TerrainType[],
): ControlGrid {
  const cells: ControlCell[] = []
  for (let i = 0; i < rows * cols; i++) {
    cells.push({
      controller: null,
      owner: null,
      pressure: 0,
      terrain: terrainData[i] ?? 'plains',
      fortification: 0,
      supplyConnected: false,
    })
  }
  return {
    rows,
    cols,
    originLat,
    originLng,
    cellSizeKm,
    cells,
  }
}

// ── Terrain defense multipliers ─────────────────────────────────

const TERRAIN_DEFENSE: Record<TerrainType, number> = {
  plains: 1.0,
  desert: 1.0,
  hills: 1.5,
  forest: 1.3,
  urban: 2.0,
  mountains: 2.5,
  marsh: 1.4,
  river: 0.5,
}

// ── Stance modifiers ────────────────────────────────────────────

const STANCE_ATTACK_MODIFIER: Record<DivisionStance, number> = {
  attack: 1.0,
  defend: 0.5,
  fortify: 0.3,
  reserve: 0,
  retreat: 0,
}

const STANCE_DEFENSE_MODIFIER: Record<DivisionStance, number> = {
  attack: 0.3,
  defend: 1.0,
  fortify: 1.5,
  reserve: 0.2,
  retreat: 0,
}

// ── Frontline processing ────────────────────────────────────────

/** Pressure threshold: attacker pressure must exceed this ratio of defender pressure to flip */
const FLIP_THRESHOLD = 1.5

/** 4-directional neighbor offsets */
const NEIGHBORS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
]

function getCell(grid: ControlGrid, row: number, col: number): ControlCell | null {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return null
  return grid.cells[row * grid.cols + col]
}

function buildSpatialIndex(
  groundUnits: Map<GroundUnitId, GroundUnit>,
): Map<string, GroundUnitId[]> {
  const index = new Map<string, GroundUnitId[]>()
  for (const [id, unit] of groundUnits) {
    const key = `${unit.gridRow}_${unit.gridCol}`
    const list = index.get(key)
    if (list) {
      list.push(id)
    } else {
      index.set(key, [id])
    }
  }
  return index
}

function computePressure(
  units: GroundUnit[],
  modifierMap: Record<DivisionStance, number>,
): number {
  let pressure = 0
  for (const unit of units) {
    const stanceMod = modifierMap[unit.stance]
    pressure += unit.strength * stanceMod * (0.5 + unit.experience * 0.5)
  }
  return pressure
}

function getUnitsInCell(
  row: number,
  col: number,
  nation: NationId,
  spatialIndex: Map<string, GroundUnitId[]>,
  groundUnits: Map<GroundUnitId, GroundUnit>,
): GroundUnit[] {
  const key = `${row}_${col}`
  const ids = spatialIndex.get(key)
  if (!ids) return []
  const result: GroundUnit[] = []
  for (const id of ids) {
    const unit = groundUnits.get(id)
    if (unit && unit.nation === nation) {
      result.push(unit)
    }
  }
  return result
}

function getUnitsInCellAndNeighbors(
  row: number,
  col: number,
  grid: ControlGrid,
  nation: NationId,
  spatialIndex: Map<string, GroundUnitId[]>,
  groundUnits: Map<GroundUnitId, GroundUnit>,
): GroundUnit[] {
  const units: GroundUnit[] = []
  units.push(...getUnitsInCell(row, col, nation, spatialIndex, groundUnits))
  for (const [dr, dc] of NEIGHBORS) {
    const nr = row + dr
    const nc = col + dc
    if (nr >= 0 && nr < grid.rows && nc >= 0 && nc < grid.cols) {
      units.push(...getUnitsInCell(nr, nc, nation, spatialIndex, groundUnits))
    }
  }
  return units
}

export function processFrontline(state: GameState): void {
  // Access extended state fields
  const extState = state as GameState & {
    controlGrid?: ControlGrid
    groundUnits?: Map<GroundUnitId, GroundUnit>
  }

  if (!extState.controlGrid || !extState.groundUnits?.size) {
    // If grid exists but no units, still compute frontlines on first call
    if (extState.controlGrid && gridDirty) {
      cachedFrontlines = extractFrontlines(extState.controlGrid)
      cachedTerritories = extractTerritories(extState.controlGrid)
      gridDirty = false
    }
    return
  }

  const grid = extState.controlGrid
  const groundUnits = extState.groundUnits

  // Build spatial index
  const spatialIndex = buildSpatialIndex(groundUnits)

  let cellFlipped = false

  // Iterate all cells, looking for frontline cells
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell = grid.cells[row * grid.cols + col]
      const controller = cell.controller

      // Check if this is a frontline cell (adjacent to different controller)
      let hasEnemyNeighbor = false
      const attackingNations = new Set<NationId>()

      for (const [dr, dc] of NEIGHBORS) {
        const neighbor = getCell(grid, row + dr, col + dc)
        if (neighbor && neighbor.controller !== controller) {
          hasEnemyNeighbor = true
          if (neighbor.controller !== null) {
            attackingNations.add(neighbor.controller)
          }
        }
      }

      if (!hasEnemyNeighbor) continue

      // For each attacking nation, compute pressure
      for (const attackerNation of attackingNations) {
        // Attacker: units from attackerNation in adjacent cells
        const attackerUnits = getUnitsInCellAndNeighbors(
          row, col, grid, attackerNation, spatialIndex, groundUnits,
        )
        const attackPressure = computePressure(attackerUnits, STANCE_ATTACK_MODIFIER)

        if (attackPressure <= 0) continue

        // Defender: units of the current controller in this cell and neighbors
        let defenderUnits: GroundUnit[] = []
        if (controller !== null) {
          defenderUnits = getUnitsInCellAndNeighbors(
            row, col, grid, controller, spatialIndex, groundUnits,
          )
        }
        const defenderPressure = computePressure(defenderUnits, STANCE_DEFENSE_MODIFIER)

        // Defense bonus from terrain and fortification
        const terrainMod = TERRAIN_DEFENSE[cell.terrain]
        const fortMod = 1 + cell.fortification // 1.0 to 2.0
        const totalDefense = (defenderPressure + 10) * terrainMod * fortMod
        // Base defense of 10 means even undefended cells resist somewhat

        if (attackPressure > totalDefense * FLIP_THRESHOLD) {
          cell.controller = attackerNation
          cellFlipped = true
          // Reduce fortification when cell is captured
          cell.fortification = Math.max(0, cell.fortification - 0.5)
        }
      }
    }
  }

  if (cellFlipped) {
    gridDirty = true
  }

  // Recompute frontlines and territories if dirty
  if (gridDirty) {
    cachedFrontlines = extractFrontlines(grid)
    cachedTerritories = extractTerritories(grid)
    gridDirty = false
  }
}

// ── Frontline extraction (marching squares) ─────────────────────

interface EdgeSegment {
  p1: [number, number] // [lng, lat]
  p2: [number, number] // [lng, lat]
  nationA: NationId | null
  nationB: NationId | null
}

export function extractFrontlines(grid: ControlGrid): FrontlineSegment[] {
  const edges: EdgeSegment[] = []

  // Find boundary edges between cells with different controllers
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell = grid.cells[row * grid.cols + col]

      // Check right neighbor
      if (col + 1 < grid.cols) {
        const right = grid.cells[row * grid.cols + col + 1]
        if (cell.controller !== right.controller) {
          // Boundary between (row, col) and (row, col+1)
          // Edge runs vertically between them
          const top = cellToLatLng(row, col + 1, grid)
          const bottom = cellToLatLng(row + 1, col + 1, grid)
          edges.push({
            p1: [top.lng, top.lat],
            p2: [bottom.lng, bottom.lat],
            nationA: cell.controller,
            nationB: right.controller,
          })
        }
      }

      // Check bottom neighbor
      if (row + 1 < grid.rows) {
        const below = grid.cells[(row + 1) * grid.cols + col]
        if (cell.controller !== below.controller) {
          // Boundary between (row, col) and (row+1, col)
          // Edge runs horizontally between them
          const left = cellToLatLng(row + 1, col, grid)
          const right = cellToLatLng(row + 1, col + 1, grid)
          edges.push({
            p1: [left.lng, left.lat],
            p2: [right.lng, right.lat],
            nationA: cell.controller,
            nationB: below.controller,
          })
        }
      }
    }
  }

  if (edges.length === 0) return []

  // Group edges by nation pair
  const grouped = new Map<string, EdgeSegment[]>()
  for (const edge of edges) {
    const [a, b] = [edge.nationA ?? '_null', edge.nationB ?? '_null'].sort()
    const key = `${a}:${b}`
    const list = grouped.get(key)
    if (list) {
      list.push(edge)
    } else {
      grouped.set(key, [edge])
    }
  }

  const result: FrontlineSegment[] = []

  for (const [, groupEdges] of grouped) {
    // Connect edges into polylines by matching endpoints
    const polylines = connectEdges(groupEdges)

    for (const polyline of polylines) {
      // Apply Douglas-Peucker simplification
      const simplified = douglasPeucker(polyline, 0.015) // keep frontlines visually aligned to control edges

      if (simplified.length < 2) continue

      const nationA = groupEdges[0].nationA
      const nationB = groupEdges[0].nationB

      result.push({
        sideA: nationA ?? ('neutral' as NationId),
        sideB: nationB ?? ('neutral' as NationId),
        coordinates: simplified,
      })
    }
  }

  return result
}

// ── Edge connection ─────────────────────────────────────────────

const EPSILON = 1e-8

function ptKey(p: [number, number]): string {
  return `${p[0].toFixed(8)}_${p[1].toFixed(8)}`
}

function ptsEqual(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON
}

function connectEdges<T extends { p1: [number, number]; p2: [number, number] }>(edges: T[]): [number, number][][] {
  if (edges.length === 0) return []

  // Build adjacency: each point -> list of edges that touch it
  const adjacency = new Map<string, number[]>()

  for (let i = 0; i < edges.length; i++) {
    const k1 = ptKey(edges[i].p1)
    const k2 = ptKey(edges[i].p2)
    if (!adjacency.has(k1)) adjacency.set(k1, [])
    if (!adjacency.has(k2)) adjacency.set(k2, [])
    adjacency.get(k1)!.push(i)
    adjacency.get(k2)!.push(i)
  }

  const used = new Set<number>()
  const polylines: [number, number][][] = []

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (used.has(startIdx)) continue

    const polyline: [number, number][] = []
    used.add(startIdx)
    polyline.push(edges[startIdx].p1, edges[startIdx].p2)

    // Extend forward from the last point
    let extended = true
    while (extended) {
      extended = false
      const lastPt = polyline[polyline.length - 1]
      const key = ptKey(lastPt)
      const neighbors = adjacency.get(key)
      if (neighbors) {
        for (const ni of neighbors) {
          if (used.has(ni)) continue
          const edge = edges[ni]
          if (ptsEqual(edge.p1, lastPt)) {
            polyline.push(edge.p2)
            used.add(ni)
            extended = true
            break
          } else if (ptsEqual(edge.p2, lastPt)) {
            polyline.push(edge.p1)
            used.add(ni)
            extended = true
            break
          }
        }
      }
    }

    // Extend backward from the first point
    extended = true
    while (extended) {
      extended = false
      const firstPt = polyline[0]
      const key = ptKey(firstPt)
      const neighbors = adjacency.get(key)
      if (neighbors) {
        for (const ni of neighbors) {
          if (used.has(ni)) continue
          const edge = edges[ni]
          if (ptsEqual(edge.p1, firstPt)) {
            polyline.unshift(edge.p2)
            used.add(ni)
            extended = true
            break
          } else if (ptsEqual(edge.p2, firstPt)) {
            polyline.unshift(edge.p1)
            used.add(ni)
            extended = true
            break
          }
        }
      }
    }

    polylines.push(polyline)
  }

  return polylines
}

// ── Douglas-Peucker simplification ──────────────────────────────

function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  const len2 = dx * dx + dy * dy

  if (len2 < EPSILON) {
    // Line start and end are the same point
    const ex = point[0] - lineStart[0]
    const ey = point[1] - lineStart[1]
    return Math.sqrt(ex * ex + ey * ey)
  }

  const t = Math.max(0, Math.min(1,
    ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / len2,
  ))

  const projX = lineStart[0] + t * dx
  const projY = lineStart[1] + t * dy
  const ex = point[0] - projX
  const ey = point[1] - projY
  return Math.sqrt(ex * ex + ey * ey)
}

function douglasPeucker(
  points: [number, number][],
  epsilon: number,
): [number, number][] {
  if (points.length <= 2) return points

  // Find the point with maximum distance from the line between first and last
  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1])
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    // Recurse on both halves
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  // All intermediate points are within epsilon — return just endpoints
  return [points[0], points[points.length - 1]]
}

// ── Territory polygon extraction ───────────────────────────────

/**
 * Extracts territory fill polygons from the control grid.
 */
function getTerritoryOwner(cell: ControlCell): NationId | null {
  return cell.owner ?? cell.controller
}

function getTerritoryGroupKey(cell: ControlCell | null): string | null {
  if (!cell?.controller) return null
  return `${cell.controller}:${getTerritoryOwner(cell) ?? '_null'}`
}

function polygonArea(points: [number, number][]): number {
  let area = 0
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1]
  }
  return area / 2
}

function simplifyClosedRing(points: [number, number][], epsilon: number): [number, number][] {
  const openRing = ptsEqual(points[0], points[points.length - 1]) ? points.slice(0, -1) : [...points]
  const simplified = douglasPeucker(openRing, epsilon)
  if (simplified.length < 3) return []
  if (!ptsEqual(simplified[0], simplified[simplified.length - 1])) {
    simplified.push(simplified[0])
  }
  return simplified
}

function collectTerritoryComponent(
  startRow: number,
  startCol: number,
  grid: ControlGrid,
  visited: Set<number>,
): number[] {
  const startIndex = startRow * grid.cols + startCol
  const startCell = grid.cells[startIndex]
  const targetKey = getTerritoryGroupKey(startCell)
  if (!targetKey) return []

  const queue = [startIndex]
  const component: number[] = []
  visited.add(startIndex)

  while (queue.length > 0) {
    const index = queue.shift()!
    component.push(index)

    const row = Math.floor(index / grid.cols)
    const col = index % grid.cols

    for (const [dr, dc] of NEIGHBORS) {
      const nextRow = row + dr
      const nextCol = col + dc
      if (nextRow < 0 || nextRow >= grid.rows || nextCol < 0 || nextCol >= grid.cols) continue

      const nextIndex = nextRow * grid.cols + nextCol
      if (visited.has(nextIndex)) continue
      if (getTerritoryGroupKey(grid.cells[nextIndex]) !== targetKey) continue

      visited.add(nextIndex)
      queue.push(nextIndex)
    }
  }

  return component
}

function buildTerritoryBoundaryEdges(
  component: number[],
  grid: ControlGrid,
): Array<{ p1: [number, number]; p2: [number, number] }> {
  const componentSet = new Set(component)
  const edges: Array<{ p1: [number, number]; p2: [number, number] }> = []

  for (const index of component) {
    const row = Math.floor(index / grid.cols)
    const col = index % grid.cols

    const topLeft = cellToLatLng(row, col, grid)
    const topRight = cellToLatLng(row, col + 1, grid)
    const bottomRight = cellToLatLng(row + 1, col + 1, grid)
    const bottomLeft = cellToLatLng(row + 1, col, grid)

    const topIndex = row > 0 ? (row - 1) * grid.cols + col : -1
    const rightIndex = col + 1 < grid.cols ? row * grid.cols + col + 1 : -1
    const bottomIndex = row + 1 < grid.rows ? (row + 1) * grid.cols + col : -1
    const leftIndex = col > 0 ? row * grid.cols + col - 1 : -1

    if (topIndex < 0 || !componentSet.has(topIndex)) {
      edges.push({ p1: [topLeft.lng, topLeft.lat], p2: [topRight.lng, topRight.lat] })
    }
    if (rightIndex < 0 || !componentSet.has(rightIndex)) {
      edges.push({ p1: [topRight.lng, topRight.lat], p2: [bottomRight.lng, bottomRight.lat] })
    }
    if (bottomIndex < 0 || !componentSet.has(bottomIndex)) {
      edges.push({ p1: [bottomRight.lng, bottomRight.lat], p2: [bottomLeft.lng, bottomLeft.lat] })
    }
    if (leftIndex < 0 || !componentSet.has(leftIndex)) {
      edges.push({ p1: [bottomLeft.lng, bottomLeft.lat], p2: [topLeft.lng, topLeft.lat] })
    }
  }

  return edges
}

export function extractTerritories(grid: ControlGrid): TerritoryPolygon[] {
  const visited = new Set<number>()
  const territories: TerritoryPolygon[] = []

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const index = row * grid.cols + col
      if (visited.has(index)) continue

      const cell = grid.cells[index]
      if (!cell.controller) continue

      const component = collectTerritoryComponent(row, col, grid, visited)
      if (component.length === 0) continue

      const rings = connectEdges(buildTerritoryBoundaryEdges(component, grid))
        .map((ring) => simplifyClosedRing(ring, 0.01))
        .filter((ring) => ring.length >= 4)
        .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))

      if (rings.length === 0) continue

      const owner = getTerritoryOwner(cell)
      territories.push({
        nation: cell.controller,
        owner,
        occupied: owner !== null && owner !== cell.controller,
        polygon: rings,
      })
    }
  }

  return territories
}
