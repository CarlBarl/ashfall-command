import { describe, it, expect, beforeEach } from 'vitest'
import {
  initControlGrid,
  cellToLatLng,
  latLngToCell,
  extractFrontlines,
  extractTerritories,
  processFrontline,
  resetFrontlineState,
} from '../frontline'
import type { ControlGrid, GroundUnit, TerrainType } from '@/types/ground'
import type { GameState, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeGroundUnit(overrides: Partial<GroundUnit> & { id: string; nation: NationId }): GroundUnit {
  return {
    name: overrides.id,
    type: 'infantry',
    armyGroupId: 'ag1',
    gridRow: 0,
    gridCol: 0,
    strength: 100,
    morale: 80,
    experience: 0.5,
    organization: 80,
    softAttack: 45,
    hardAttack: 8,
    defense: 55,
    breakthrough: 12,
    hardness: 0.05,
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    stance: 'attack',
    entrenched: 0,
    combatWidth: 1,
    status: 'active',
    ...overrides,
  } as GroundUnit
}

function makeState(
  grid: ControlGrid | undefined,
  groundUnits: GroundUnit[] = [],
): GameState {
  const unitMap = new Map(groundUnits.map(u => [u.id, u]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
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
    controlGrid: grid,
    groundUnits: unitMap,
  } as GameState
}

function makeSimpleGrid(rows: number, cols: number): ControlGrid {
  const terrain: TerrainType[] = new Array(rows * cols).fill('plains')
  return initControlGrid(rows, cols, 30.0, 50.0, 10, terrain)
}

// ── Tests ───────────────────────────────────────────────────────

describe('initControlGrid', () => {
  it('creates a grid with correct dimensions', () => {
    const terrain: TerrainType[] = new Array(4 * 6).fill('desert')
    const grid = initControlGrid(4, 6, 30.0, 50.0, 10, terrain)

    expect(grid.rows).toBe(4)
    expect(grid.cols).toBe(6)
    expect(grid.cells.length).toBe(24)
    expect(grid.originLat).toBe(30.0)
    expect(grid.originLng).toBe(50.0)
    expect(grid.cellSizeKm).toBe(10)
  })

  it('assigns terrain to each cell', () => {
    const terrain: TerrainType[] = ['plains', 'mountains', 'urban', 'desert']
    const grid = initControlGrid(2, 2, 30.0, 50.0, 10, terrain)

    expect(grid.cells[0].terrain).toBe('plains')
    expect(grid.cells[1].terrain).toBe('mountains')
    expect(grid.cells[2].terrain).toBe('urban')
    expect(grid.cells[3].terrain).toBe('desert')
  })

  it('initializes cells as neutral with zero fortification', () => {
    const terrain: TerrainType[] = new Array(4).fill('plains')
    const grid = initControlGrid(2, 2, 30.0, 50.0, 10, terrain)

    for (const cell of grid.cells) {
      expect(cell.controller).toBeNull()
      expect(cell.fortification).toBe(0)
    }
  })

  it('initializes cells with pressure=0 and supplyConnected=false', () => {
    const terrain: TerrainType[] = new Array(4).fill('plains')
    const grid = initControlGrid(2, 2, 30.0, 50.0, 10, terrain)

    for (const cell of grid.cells) {
      expect(cell.pressure).toBe(0)
      expect(cell.supplyConnected).toBe(false)
    }
  })
})

describe('cellToLatLng', () => {
  it('returns origin for cell (0,0)', () => {
    const grid = makeSimpleGrid(5, 5)
    const { lat, lng } = cellToLatLng(0, 0, grid)

    expect(lat).toBeCloseTo(30.0, 4)
    expect(lng).toBeCloseTo(50.0, 4)
  })

  it('increases latitude with row', () => {
    const grid = makeSimpleGrid(5, 5)
    const { lat: lat0 } = cellToLatLng(0, 0, grid)
    const { lat: lat1 } = cellToLatLng(1, 0, grid)

    expect(lat1).toBeGreaterThan(lat0)
    // 10km / 111 km/deg ~ 0.09009 degrees
    expect(lat1 - lat0).toBeCloseTo(10 / 111.0, 3)
  })

  it('increases longitude with column', () => {
    const grid = makeSimpleGrid(5, 5)
    const { lng: lng0 } = cellToLatLng(0, 0, grid)
    const { lng: lng1 } = cellToLatLng(0, 1, grid)

    expect(lng1).toBeGreaterThan(lng0)
  })
})

describe('latLngToCell', () => {
  it('returns (0,0) for origin coordinates', () => {
    const grid = makeSimpleGrid(5, 5)
    const { row, col } = latLngToCell(30.0, 50.0, grid)

    expect(row).toBe(0)
    expect(col).toBe(0)
  })

  it('roundtrips with cellToLatLng', () => {
    const grid = makeSimpleGrid(10, 10)
    const testRow = 3
    const testCol = 5
    const { lat, lng } = cellToLatLng(testRow, testCol, grid)
    const { row, col } = latLngToCell(lat, lng, grid)

    expect(row).toBe(testRow)
    expect(col).toBe(testCol)
  })

  it('roundtrips for multiple cells', () => {
    const grid = makeSimpleGrid(10, 10)
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const { lat, lng } = cellToLatLng(r, c, grid)
        const { row, col } = latLngToCell(lat, lng, grid)
        expect(row).toBe(r)
        expect(col).toBe(c)
      }
    }
  })

  it('clamps out-of-bounds coordinates', () => {
    const grid = makeSimpleGrid(5, 5)
    // Far south of origin (negative row)
    const { row: r1, col: c1 } = latLngToCell(29.0, 50.0, grid)
    expect(r1).toBe(0)
    expect(c1).toBe(0)

    // Far northeast (beyond grid)
    const { row: r2, col: c2 } = latLngToCell(35.0, 55.0, grid)
    expect(r2).toBe(4) // max row = rows - 1
    expect(c2).toBe(4) // max col = cols - 1
  })
})

describe('extractFrontlines', () => {
  it('returns empty array for uniform grid (all same controller)', () => {
    const grid = makeSimpleGrid(4, 4)
    for (const cell of grid.cells) {
      cell.controller = 'usa' as NationId
    }

    const frontlines = extractFrontlines(grid)
    expect(frontlines).toEqual([])
  })

  it('returns empty array for all-neutral grid', () => {
    const grid = makeSimpleGrid(4, 4)
    const frontlines = extractFrontlines(grid)
    expect(frontlines).toEqual([])
  })

  it('finds boundary between two controlled regions', () => {
    const grid = makeSimpleGrid(4, 6)
    // Left half USA, right half Iran
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        grid.cells[r * 6 + c].controller = (c < 3 ? 'usa' : 'iran') as NationId
      }
    }

    const frontlines = extractFrontlines(grid)
    expect(frontlines.length).toBeGreaterThan(0)

    // All segments should be between usa and iran
    for (const seg of frontlines) {
      expect(
        (seg.sideA === 'usa' && seg.sideB === 'iran') ||
        (seg.sideA === 'iran' && seg.sideB === 'usa')
      ).toBe(true)
      expect(seg.coordinates.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('finds boundary between controlled and neutral territory', () => {
    const grid = makeSimpleGrid(4, 4)
    // Top half USA, bottom half neutral
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        grid.cells[r * 4 + c].controller = 'usa' as NationId
      }
    }

    const frontlines = extractFrontlines(grid)
    // Should find frontline between USA and neutral
    expect(frontlines.length).toBeGreaterThan(0)
  })

  it('Douglas-Peucker simplifies a straight line to 2 points', () => {
    // Create a grid with a perfectly straight vertical boundary
    const grid = makeSimpleGrid(10, 4)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 4; c++) {
        grid.cells[r * 4 + c].controller = (c < 2 ? 'usa' : 'iran') as NationId
      }
    }

    const frontlines = extractFrontlines(grid)
    expect(frontlines.length).toBeGreaterThan(0)

    // A perfectly straight vertical boundary should be simplified to just 2 points
    const totalPoints = frontlines.reduce((sum, seg) => sum + seg.coordinates.length, 0)
    // With D-P simplification, a straight line should collapse to 2 endpoints
    expect(totalPoints).toBe(2)
  })
})

describe('extractTerritories', () => {
  it('keeps disconnected regions separate instead of bridging across gaps', () => {
    const grid = makeSimpleGrid(1, 3)
    grid.cells[0].controller = 'germany' as NationId
    grid.cells[0].owner = 'germany' as NationId
    grid.cells[1].controller = 'germany' as NationId
    grid.cells[1].owner = 'poland' as NationId
    grid.cells[2].controller = 'germany' as NationId
    grid.cells[2].owner = 'germany' as NationId

    const territories = extractTerritories(grid)

    const germanHome = territories.filter((territory) => territory.nation === 'germany' && territory.owner === 'germany')
    const occupiedPoland = territories.find((territory) => territory.nation === 'germany' && territory.owner === 'poland')

    expect(germanHome).toHaveLength(2)
    expect(occupiedPoland?.occupied).toBe(true)
    expect(occupiedPoland?.polygon[0][0]).toEqual(occupiedPoland?.polygon[0][occupiedPoland.polygon[0].length - 1])
  })
})

describe('processFrontline', () => {
  beforeEach(() => {
    resetFrontlineState()
  })

  it('is a no-op when controlGrid is missing', () => {
    const state = makeState(undefined, [])
    processFrontline(state)
    // Should not throw
  })

  it('is a no-op when groundUnits is empty', () => {
    const grid = makeSimpleGrid(4, 4)
    const state = makeState(grid, [])
    processFrontline(state)
    // Should not throw, grid should be unchanged
  })

  it('flips cells when attacker pressure exceeds defense', () => {
    const grid = makeSimpleGrid(4, 6)
    // Left half USA, right half Iran
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        grid.cells[r * 6 + c].controller = (c < 3 ? 'usa' : 'iran') as NationId
      }
    }

    // Strong USA attackers at the border (col 2, the last USA column)
    const attackers = [
      makeGroundUnit({ id: 'usa-1', nation: 'usa' as NationId, gridRow: 1, gridCol: 2, strength: 100, stance: 'attack', experience: 0.8 }),
      makeGroundUnit({ id: 'usa-2', nation: 'usa' as NationId, gridRow: 2, gridCol: 2, strength: 100, stance: 'attack', experience: 0.8 }),
    ]

    const state = makeState(grid, attackers)
    processFrontline(state)

    // Some Iranian border cells should have flipped to USA
    const iranBorderCells = [1, 2].map(r => grid.cells[r * 6 + 3])
    const anyFlipped = iranBorderCells.some(c => c.controller === 'usa')
    expect(anyFlipped).toBe(true)
  })

  it('does not flip when defenders are entrenched', () => {
    const grid = makeSimpleGrid(4, 6)
    // Left half USA, right half Iran
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        grid.cells[r * 6 + c].controller = (c < 3 ? 'usa' : 'iran') as NationId
      }
    }

    // Add mountains and fortification on the Iranian side
    for (let r = 0; r < 4; r++) {
      const cell = grid.cells[r * 6 + 3]
      cell.terrain = 'mountains'
      cell.fortification = 1.0
    }

    // Weak USA attackers
    const attackers = [
      makeGroundUnit({ id: 'usa-1', nation: 'usa' as NationId, gridRow: 1, gridCol: 2, strength: 30, stance: 'attack', experience: 0.3 }),
    ]

    // Strong Iranian defenders
    const defenders = [
      makeGroundUnit({ id: 'iran-1', nation: 'iran' as NationId, gridRow: 1, gridCol: 3, strength: 100, stance: 'fortify', experience: 0.9 }),
      makeGroundUnit({ id: 'iran-2', nation: 'iran' as NationId, gridRow: 2, gridCol: 3, strength: 100, stance: 'defend', experience: 0.9 }),
    ]

    const state = makeState(grid, [...attackers, ...defenders])
    processFrontline(state)

    // Iranian border cells should NOT have flipped
    for (let r = 0; r < 4; r++) {
      expect(grid.cells[r * 6 + 3].controller).toBe('iran')
    }
  })

  it('stance modifiers affect pressure correctly', () => {
    // Test that 'reserve' and 'retreat' stances contribute no offensive pressure
    const grid = makeSimpleGrid(4, 6)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        grid.cells[r * 6 + c].controller = (c < 3 ? 'usa' : 'iran') as NationId
      }
    }

    // USA units in reserve/retreat — should not flip cells
    const passiveUnits = [
      makeGroundUnit({ id: 'usa-1', nation: 'usa' as NationId, gridRow: 1, gridCol: 2, strength: 100, stance: 'reserve', experience: 1.0 }),
      makeGroundUnit({ id: 'usa-2', nation: 'usa' as NationId, gridRow: 2, gridCol: 2, strength: 100, stance: 'retreat', experience: 1.0 }),
    ]

    const state = makeState(grid, passiveUnits)
    processFrontline(state)

    // No cells should flip — reserve/retreat have 0 attack pressure
    for (let r = 0; r < 4; r++) {
      expect(grid.cells[r * 6 + 3].controller).toBe('iran')
    }
  })
})
