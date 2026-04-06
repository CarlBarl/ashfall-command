/**
 * Ground supply system — BFS supply connectivity and encirclement detection.
 * Runs every 6 ticks (= 6 hours in WW2 mode).
 *
 * Supply flows from depot cells via BFS through friendly-controlled territory.
 * Units in supplied cells recover; units in unsupplied cells degrade.
 * Units surrounded by enemy are marked encircled.
 */

import type { GameState, GameEvent, NationId } from '@/types/game'
import type {
  GroundUnit,
  ControlGrid,
} from '@/types/ground'

const TICKS_PER_CYCLE = 6

// Supply degradation rates per cycle (unsupplied)
const SUPPLY_DEGRADE = 8
const FUEL_DEGRADE = 5
const AMMO_DEGRADE = 10

// Supply recovery rates per cycle (supplied)
const SUPPLY_RECOVER = 3
const FUEL_RECOVER = 2
const AMMO_RECOVER = 4

// ── Module state ──────────────────────────────────────────────

// No persistent module state needed. Keeping reset for consistency.

/** Reset module-level state — must be called on save/load */
export function resetGroundSupplyState(): void {
  // Reserved for future caches
}

// ── Extended state accessors ──────────────────────────────────

function getGroundUnits(state: GameState): GroundUnit[] {
  const map = state.groundUnits
  return map ? Array.from(map.values()) : []
}

function getControlGrid(state: GameState): ControlGrid | undefined {
  return state.controlGrid
}

// ── Flat row-major cell access helper ────────────────────────

function getCell(grid: ControlGrid, r: number, c: number) {
  return grid.cells[r * grid.cols + c]
}

// ── BFS supply connectivity ───────────────────────────────────

/**
 * BFS flood fill from depot cells through same-nation controlled territory.
 * Marks reachable cells as supplyConnected=true, unreachable as false.
 *
 * A cell is traversable if it is controlled by the SAME nation as the depot cell.
 * This means each nation's depots only supply through that nation's territory.
 */
export function computeSupplyConnectivity(
  grid: ControlGrid,
  depotCells: { row: number; col: number }[],
): void {
  // Reset all supply connectivity
  for (let i = 0; i < grid.cells.length; i++) {
    grid.cells[i].supplyConnected = false
  }

  // BFS from each depot
  for (const depot of depotCells) {
    if (depot.row < 0 || depot.row >= grid.rows || depot.col < 0 || depot.col >= grid.cols) continue

    const depotCell = getCell(grid, depot.row, depot.col)
    const depotNation = depotCell.controller
    if (!depotNation) continue // Neutral depot — no supply

    const visited = new Set<string>()
    const queue: { row: number; col: number }[] = []

    const key = (r: number, c: number) => `${r},${c}`

    queue.push({ row: depot.row, col: depot.col })
    visited.add(key(depot.row, depot.col))

    while (queue.length > 0) {
      const current = queue.shift()!
      getCell(grid, current.row, current.col).supplyConnected = true

      // Check 4 cardinal neighbors
      const neighbors = [
        { row: current.row - 1, col: current.col },
        { row: current.row + 1, col: current.col },
        { row: current.row, col: current.col - 1 },
        { row: current.row, col: current.col + 1 },
      ]

      for (const n of neighbors) {
        if (n.row < 0 || n.row >= grid.rows || n.col < 0 || n.col >= grid.cols) continue
        const nKey = key(n.row, n.col)
        if (visited.has(nKey)) continue

        const cell = getCell(grid, n.row, n.col)
        if (cell.controller !== depotNation) continue // Can't traverse enemy territory

        visited.add(nKey)
        queue.push(n)
      }
    }
  }
}

// ── Main processing ───────────────────────────────────────────

export function processGroundSupply(state: GameState): void {
  if (state.time.tick % TICKS_PER_CYCLE !== 0) return

  const grid = getControlGrid(state)
  const units = getGroundUnits(state)
  if (!grid || units.length === 0) return

  // Step 1: Identify depot cells (cells at grid edges for each nation)
  const depotCells = identifyDepots(grid)

  // Step 2: BFS supply connectivity
  computeSupplyConnectivity(grid, depotCells)

  // Step 3: Apply supply effects to units
  for (const unit of units) {
    if (unit.status === 'destroyed') continue
    if (unit.gridRow < 0 || unit.gridRow >= grid.rows || unit.gridCol < 0 || unit.gridCol >= grid.cols) continue

    const cell = getCell(grid, unit.gridRow, unit.gridCol)

    // Cell must be controlled by the unit's nation AND supply-connected
    const isSupplied = cell.controller === unit.nation && cell.supplyConnected

    if (isSupplied) {
      // Recovery
      unit.supplyState = Math.min(100, unit.supplyState + SUPPLY_RECOVER)
      unit.fuelState = Math.min(100, unit.fuelState + FUEL_RECOVER)
      unit.ammoState = Math.min(100, unit.ammoState + AMMO_RECOVER)
    } else {
      // Degradation
      unit.supplyState = Math.max(0, unit.supplyState - SUPPLY_DEGRADE)
      unit.fuelState = Math.max(0, unit.fuelState - FUEL_DEGRADE)
      unit.ammoState = Math.max(0, unit.ammoState - AMMO_DEGRADE)
    }
  }

  // Step 4: Encirclement detection
  detectEncirclement(state, grid, units)
}

// ── Depot identification ──────────────────────────────────────

function identifyDepots(grid: ControlGrid): { row: number; col: number }[] {
  const depots: { row: number; col: number }[] = []

  // Depot cells are on the home-base rows (row 0 and last row).
  // Row 0 = near-rear for one side, last row = near-rear for the other.
  // This models supply coming from behind the front lines, not from flanks.
  for (let c = 0; c < grid.cols; c++) {
    if (getCell(grid, 0, c).controller) {
      depots.push({ row: 0, col: c })
    }
    const lastRow = grid.rows - 1
    if (getCell(grid, lastRow, c).controller) {
      depots.push({ row: lastRow, col: c })
    }
  }

  return depots
}

// ── Encirclement detection ────────────────────────────────────

function detectEncirclement(state: GameState, grid: ControlGrid, units: GroundUnit[]): void {
  // Group units by nation and check if they're surrounded
  const nationUnits = new Map<NationId, GroundUnit[]>()
  for (const unit of units) {
    if (unit.status === 'destroyed' || unit.status === 'encircled') continue
    const list = nationUnits.get(unit.nation) ?? []
    list.push(unit)
    nationUnits.set(unit.nation, list)
  }

  for (const [nation, natUnits] of nationUnits) {
    // Check each unit individually
    const encircledCount: number[] = []

    for (const unit of natUnits) {
      if (isEncircled(unit, nation, grid)) {
        unit.status = 'encircled'
        encircledCount.push(1)
      }
    }

    if (encircledCount.length > 0) {
      const event: GameEvent = {
        type: 'ENCIRCLEMENT',
        nation,
        divisionCount: encircledCount.length,
        tick: state.time.tick,
      }
      state.pendingEvents.push(event)
    }
  }
}

/**
 * A unit is encircled if:
 * 1. It is in an unsupplied cell
 * 2. ALL adjacent cells are controlled by enemy (not friendly, not neutral)
 */
function isEncircled(unit: GroundUnit, nation: NationId, grid: ControlGrid): boolean {
  const { gridRow: r, gridCol: c } = unit

  // Must be in an unsupplied cell
  if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) return false
  const cell = getCell(grid, r, c)
  if (cell.supplyConnected && cell.controller === nation) return false

  // Check all adjacent cells (4 cardinal directions)
  const neighbors = [
    { row: r - 1, col: c },
    { row: r + 1, col: c },
    { row: r, col: c - 1 },
    { row: r, col: c + 1 },
  ]

  for (const n of neighbors) {
    // Edge of map — not surrounded in this direction
    if (n.row < 0 || n.row >= grid.rows || n.col < 0 || n.col >= grid.cols) continue

    const nCell = getCell(grid, n.row, n.col)
    // If any adjacent cell is friendly or neutral, not encircled
    if (nCell.controller === nation || nCell.controller === null) {
      return false
    }
  }

  return true
}
