import { describe, it, expect, beforeEach } from 'vitest'
import { processGroundSupply, computeSupplyConnectivity, resetGroundSupplyState } from '../ground-supply'
import type { GameState, NationId } from '@/types/game'
import type { GroundUnit, ControlGrid, ControlCell } from '@/types/ground'

// ── Helpers ─────────────────────────────────────────────────────

function makeGroundUnit(overrides: Partial<GroundUnit> & { id: string; nation: 'usa' | 'iran' }): GroundUnit {
  return {
    name: overrides.id,
    type: 'infantry',
    gridRow: 0,
    gridCol: 0,
    strength: 80,
    morale: 70,
    entrenched: 0,
    stance: 'defend',
    status: 'active',
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    armyGroupId: 'ag1',
    softAttack: 45,
    hardAttack: 8,
    defense: 55,
    breakthrough: 12,
    hardness: 0.05,
    experience: 1.0,
    organization: 80,
    combatWidth: 1,
    ...overrides,
  } as GroundUnit
}

function makeGrid(rows: number, cols: number, controller: 'usa' | 'iran' | null = null): ControlGrid {
  const cells: ControlCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        controller: controller as NationId | null,
        pressure: 0,
        terrain: 'plains',
        fortification: 0,
        supplyConnected: false,
      })
    }
  }
  return { rows, cols, cells, originLat: 30, originLng: 50, cellSizeKm: 10 }
}

/** Helper to access flat row-major cell */
function getCell(grid: ControlGrid, r: number, c: number): ControlCell {
  return grid.cells[r * grid.cols + c]
}

/** Helper to set a cell's controller */
function setCellController(grid: ControlGrid, r: number, c: number, ctrl: NationId | null) {
  grid.cells[r * grid.cols + c].controller = ctrl
}

function makeGroundState(options: {
  groundUnits?: GroundUnit[]
  controlGrid?: ControlGrid
  tick?: number
}): GameState {
  const unitMap = new Map((options.groundUnits ?? []).map(u => [u.id, u]))

  const state: GameState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: options.tick ?? 6, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: new Map(),
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
    groundUnits: unitMap,
    controlGrid: options.controlGrid ?? makeGrid(5, 5, 'usa'),
  } as GameState

  return state
}

// ── Tests ───────────────────────────────────────────────────────

describe('computeSupplyConnectivity', () => {
  it('BFS marks connected cells as supplied', () => {
    // 5x5 grid all controlled by USA, depot at (0,0)
    const grid = makeGrid(5, 5, 'usa')
    const depots = [{ row: 0, col: 0 }]

    computeSupplyConnectivity(grid, depots)

    // All cells should be supply-connected (all controlled by same nation)
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(getCell(grid, r, c).supplyConnected).toBe(true)
      }
    }
  })

  it('marks isolated cells as unsupplied', () => {
    // USA controls most of grid, but row 2 is enemy-controlled — breaks connectivity
    const grid = makeGrid(5, 5, 'usa')
    // Create an enemy pocket that blocks supply to rows 3-4
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 2, c, 'iran' as NationId)
    }

    const depots = [{ row: 0, col: 0 }]
    computeSupplyConnectivity(grid, depots)

    // Rows 0-1 should be connected
    expect(getCell(grid, 0, 0).supplyConnected).toBe(true)
    expect(getCell(grid, 1, 0).supplyConnected).toBe(true)

    // Row 2 is iran — not connected to USA depots
    expect(getCell(grid, 2, 0).supplyConnected).toBe(false)

    // Rows 3-4 are USA but cut off from depot
    expect(getCell(grid, 3, 0).supplyConnected).toBe(false)
    expect(getCell(grid, 4, 0).supplyConnected).toBe(false)
  })

  it('handles multiple depots', () => {
    const grid = makeGrid(5, 5, 'usa')
    // Block row 2
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 2, c, 'iran' as NationId)
    }
    // Depots at both (0,0) and (4,0) — both sides of the block
    const depots = [{ row: 0, col: 0 }, { row: 4, col: 0 }]

    computeSupplyConnectivity(grid, depots)

    // Both sides should be connected
    expect(getCell(grid, 0, 0).supplyConnected).toBe(true)
    expect(getCell(grid, 1, 0).supplyConnected).toBe(true)
    expect(getCell(grid, 3, 0).supplyConnected).toBe(true)
    expect(getCell(grid, 4, 0).supplyConnected).toBe(true)

    // Enemy row still not connected
    expect(getCell(grid, 2, 0).supplyConnected).toBe(false)
  })
})

describe('processGroundSupply', () => {
  beforeEach(() => {
    resetGroundSupplyState()
  })

  it('degrades supply for unsupplied units', () => {
    // 7-row grid: USA depot at row 0, enemy blocks rows 2 and 5, unit at row 3
    // Row 6 (last row) is Iran, so no USA depot at bottom either
    const grid = makeGrid(7, 5, 'usa')
    // Block row 2 with Iran
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 2, c, 'iran' as NationId)
    }
    // Make last row Iran-controlled too so no depot there
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 6, c, 'iran' as NationId)
    }

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 3,
      gridCol: 0,
      supplyState: 100,
      fuelState: 100,
      ammoState: 100,
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    // Supply should degrade: -8, -5, -10
    expect(allUnits[0].supplyState).toBe(92)
    expect(allUnits[0].fuelState).toBe(95)
    expect(allUnits[0].ammoState).toBe(90)
  })

  it('recovers supply for supplied units', () => {
    const grid = makeGrid(5, 5, 'usa')

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 1,
      gridCol: 0,
      supplyState: 50,
      fuelState: 50,
      ammoState: 50,
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    // Supply should recover: +3, +2, +4
    expect(allUnits[0].supplyState).toBe(53)
    expect(allUnits[0].fuelState).toBe(52)
    expect(allUnits[0].ammoState).toBe(54)
  })

  it('caps supply recovery at 100', () => {
    const grid = makeGrid(5, 5, 'usa')

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 1,
      gridCol: 0,
      supplyState: 99,
      fuelState: 99,
      ammoState: 99,
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    expect(allUnits[0].supplyState).toBe(100)
    expect(allUnits[0].fuelState).toBe(100)
    expect(allUnits[0].ammoState).toBe(100)
  })

  it('clamps supply degradation at 0', () => {
    // 7-row grid: Block row 2 and make last row Iran too
    const grid = makeGrid(7, 5, 'usa')
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 2, c, 'iran' as NationId)
    }
    for (let c = 0; c < 5; c++) {
      setCellController(grid, 6, c, 'iran' as NationId)
    }

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 3,
      gridCol: 0,
      supplyState: 3,
      fuelState: 2,
      ammoState: 5,
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    expect(allUnits[0].supplyState).toBe(0)
    expect(allUnits[0].fuelState).toBe(0)
    expect(allUnits[0].ammoState).toBe(0)
  })

  it('detects encirclement when unit is surrounded by enemy', () => {
    // 5x5 grid, mostly iran-controlled. USA unit at (2,2) surrounded on all sides by Iran
    const grid = makeGrid(5, 5, 'iran')
    setCellController(grid, 2, 2, 'usa' as NationId) // The encircled cell

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 2,
      gridCol: 2,
      status: 'active',
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    expect(allUnits[0].status).toBe('encircled')

    // Check ENCIRCLEMENT event
    const encirclementEvents = state.pendingEvents.filter(e => e.type === 'ENCIRCLEMENT')
    expect(encirclementEvents.length).toBe(1)
  })

  it('does not mark encircled if any adjacent cell is friendly', () => {
    const grid = makeGrid(5, 5, 'iran')
    setCellController(grid, 2, 2, 'usa' as NationId)
    setCellController(grid, 2, 3, 'usa' as NationId) // Adjacent friendly cell

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 2,
      gridCol: 2,
      status: 'active',
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 6,
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    // Should NOT be encircled — has adjacent friendly cell
    expect(allUnits[0].status).not.toBe('encircled')
  })

  it('skips processing when tick is not divisible by 6', () => {
    const grid = makeGrid(5, 5, 'usa')

    const unit = makeGroundUnit({
      id: 'div1',
      nation: 'usa',
      gridRow: 1,
      gridCol: 0,
      supplyState: 50,
      fuelState: 50,
      ammoState: 50,
    })

    const state = makeGroundState({
      groundUnits: [unit],
      controlGrid: grid,
      tick: 7, // Not divisible by 6
    })

    processGroundSupply(state)

    const allUnits = Array.from(state.groundUnits!.values())
    // No change — processing was skipped
    expect(allUnits[0].supplyState).toBe(50)
    expect(allUnits[0].fuelState).toBe(50)
    expect(allUnits[0].ammoState).toBe(50)
  })
})
