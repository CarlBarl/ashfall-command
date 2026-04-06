import { describe, it, expect, beforeEach } from 'vitest'
import { processGeneralAI, resetGeneralAIState } from '../general-ai'
import type { GameState } from '@/types/game'
import type { GroundUnit, General, ArmyGroup, ControlGrid, ControlCell } from '@/types/ground'
import { SeededRNG } from '@/engine/utils/rng'

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

function makeGeneral(overrides: Partial<General> & { id: string; nation: 'usa' | 'iran' }): General {
  return {
    name: overrides.id,
    armyGroupId: 'ag1',
    traits: {
      aggression: 5,
      caution: 5,
      logistics: 5,
      innovation: 5,
      morale: 5,
      ...(overrides as Record<string, unknown>).traits as Record<string, number> | undefined,
    },
    currentOrder: null,
    pendingReports: [],
    lastReportTick: 0,
    ...overrides,
  } as General
}

function makeArmyGroup(overrides: Partial<ArmyGroup> & { id: string; nation: 'usa' | 'iran' }): ArmyGroup {
  return {
    name: overrides.id,
    divisionIds: [],
    generalId: 'gen1',
    sectorStartCol: 0,
    sectorEndCol: 4,
    ...overrides,
  } as ArmyGroup
}

function makeFlatGrid(rows: number, cols: number, controller: 'usa' | 'iran' | null = null): ControlGrid {
  const cells: ControlCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        controller,
        pressure: 0,
        terrain: 'plains',
        fortification: 0,
        supplyConnected: true,
      })
    }
  }
  return { rows, cols, cells, originLat: 30, originLng: 50, cellSizeKm: 10 }
}

function makeGroundState(options: {
  groundUnits?: GroundUnit[]
  generals?: General[]
  armyGroups?: ArmyGroup[]
  controlGrid?: ControlGrid
  tick?: number
}): GameState {
  const unitMap = new Map((options.groundUnits ?? []).map(u => [u.id, u]))
  const generalMap = new Map((options.generals ?? []).map(g => [g.id, g]))
  const armyGroupMap = new Map((options.armyGroups ?? []).map(ag => [ag.id, ag]))

  const state: GameState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: options.tick ?? 12, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
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
    generals: generalMap,
    armyGroups: armyGroupMap,
    controlGrid: options.controlGrid ?? makeFlatGrid(10, 10),
  } as GameState

  return state
}

// ── Tests ───────────────────────────────────────────────────────

describe('processGeneralAI', () => {
  const rng = new SeededRNG(42)

  beforeEach(() => {
    resetGeneralAIState()
  })

  describe('ADVANCE order', () => {
    it('concentrates forces at weakest enemy sector', () => {
      // Set up: 4 strong friendly divisions vs 2 weaker enemy — clear 2:1+ advantage
      const friendlyDivs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, strength: 100, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 3, gridCol: 1, strength: 100, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div3', nation: 'usa', gridRow: 3, gridCol: 2, strength: 100, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div4', nation: 'usa', gridRow: 3, gridCol: 3, strength: 100, armyGroupId: 'ag1' }),
      ]
      const enemyDivs = [
        makeGroundUnit({ id: 'ediv1', nation: 'iran', gridRow: 5, gridCol: 0, strength: 60, armyGroupId: 'eag1' }),
        makeGroundUnit({ id: 'ediv2', nation: 'iran', gridRow: 5, gridCol: 2, strength: 20, armyGroupId: 'eag1' }), // weak
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'ADVANCE', objectiveCol: 2, objectiveRow: 5 },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2', 'div3', 'div4'],
        generalId: 'gen1',
        sectorStartCol: 0,
        sectorEndCol: 4,
      })

      const state = makeGroundState({
        groundUnits: [...friendlyDivs, ...enemyDivs],
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      // At least one division should be set to 'attack' stance (400 vs 80 = 5:1 ratio)
      const allUnits = Array.from(state.groundUnits!.values())
      const attackingDivs = allUnits.filter(u => u.nation === 'usa' && u.stance === 'attack')
      expect(attackingDivs.length).toBeGreaterThan(0)
    })
  })

  describe('HOLD_LINE order', () => {
    it('distributes divisions evenly and builds entrenchment', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, entrenched: 10, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 3, gridCol: 1, entrenched: 20, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'HOLD_LINE' },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2'],
        generalId: 'gen1',
        sectorStartCol: 0,
        sectorEndCol: 4,
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      // All divisions should be set to 'defend'
      const defendingDivs = allUnits.filter(u => u.nation === 'usa' && u.stance === 'defend')
      expect(defendingDivs.length).toBe(2)

      // Entrenchment should increase (by 5 per tick, capped at 100)
      expect(allUnits[0].entrenched).toBe(15)
      expect(allUnits[1].entrenched).toBe(25)
    })

    it('caps entrenchment at 100', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, entrenched: 98, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'HOLD_LINE' },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1'],
        generalId: 'gen1',
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      expect(allUnits[0].entrenched).toBe(100)
    })
  })

  describe('WITHDRAW order', () => {
    it('moves divisions back one grid row', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 5, gridCol: 0, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 5, gridCol: 1, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div3', nation: 'usa', gridRow: 4, gridCol: 0, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'WITHDRAW', fallbackCol: 0, fallbackRow: 0 },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2', 'div3'],
        generalId: 'gen1',
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      // Front-most units (row 5) should have moved back to row 4
      const div1 = allUnits.find(u => u.id === 'div1')!
      const div2 = allUnits.find(u => u.id === 'div2')!
      expect(div1.gridRow).toBe(4)
      expect(div2.gridRow).toBe(4)

      // Rear unit (row 4) is rearguard — set to defend
      const div3 = allUnits.find(u => u.id === 'div3')!
      expect(div3.stance).toBe('defend')
    })

    it('does not move units below row 0', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 0, gridCol: 0, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'WITHDRAW', fallbackCol: 0, fallbackRow: 0 },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1'],
        generalId: 'gen1',
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      expect(allUnits[0].gridRow).toBe(0)
    })
  })

  describe('RESERVE order', () => {
    it('sets all divisions to reserve stance', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, stance: 'attack', armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 3, gridCol: 1, stance: 'defend', armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'RESERVE' },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2'],
        generalId: 'gen1',
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      expect(allUnits.every(u => u.stance === 'reserve')).toBe(true)
    })
  })

  describe('Reporting', () => {
    it('generates a report every 24 ticks', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'HOLD_LINE' },
        lastReportTick: 0,
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1'],
        generalId: 'gen1',
      })

      // Tick 24 — should generate report
      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 24,
      })

      processGeneralAI(state, rng)

      const allGenerals = Array.from(state.generals!.values())
      expect(allGenerals[0].pendingReports.length).toBe(1)
      expect(allGenerals[0].lastReportTick).toBe(24)

      // Check that a GENERAL_REPORT event was emitted
      const reportEvents = state.pendingEvents.filter(e => e.type === 'GENERAL_REPORT')
      expect(reportEvents.length).toBe(1)
    })

    it('does not generate report before 24 ticks since last', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'HOLD_LINE' },
        lastReportTick: 10,
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1'],
        generalId: 'gen1',
      })

      // Tick 24 — only 14 ticks since last report (< 24)
      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 24,
      })

      processGeneralAI(state, rng)

      const allGenerals = Array.from(state.generals!.values())
      expect(allGenerals[0].pendingReports.length).toBe(0)
    })
  })

  describe('Aggressive vs cautious generals', () => {
    it('aggressive general attacks at lower ratio', () => {
      // Enemy has moderate defense — aggressive general should still attack
      const friendlyDivs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 2, strength: 60, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 3, gridCol: 2, strength: 60, armyGroupId: 'ag1' }),
      ]
      const enemyDivs = [
        makeGroundUnit({ id: 'ediv1', nation: 'iran', gridRow: 5, gridCol: 2, strength: 60, armyGroupId: 'eag1' }),
      ]

      const aggressiveGeneral = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        traits: { aggression: 9, caution: 2, logistics: 5, innovation: 5, morale: 5 },
        currentOrder: { type: 'ADVANCE', objectiveCol: 2, objectiveRow: 5 },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2'],
        generalId: 'gen1',
        sectorStartCol: 0,
        sectorEndCol: 4,
      })

      const state = makeGroundState({
        groundUnits: [...friendlyDivs, ...enemyDivs],
        generals: [aggressiveGeneral],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      const attackers = allUnits.filter(u => u.nation === 'usa' && u.stance === 'attack')
      // Aggressive general should order attack at ~2:1 ratio
      expect(attackers.length).toBeGreaterThan(0)
    })

    it('cautious general holds when ratio is insufficient', () => {
      // Same setup but cautious general — should NOT attack at 2:1
      const friendlyDivs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 2, strength: 60, armyGroupId: 'ag1' }),
        makeGroundUnit({ id: 'div2', nation: 'usa', gridRow: 3, gridCol: 2, strength: 60, armyGroupId: 'ag1' }),
      ]
      const enemyDivs = [
        makeGroundUnit({ id: 'ediv1', nation: 'iran', gridRow: 5, gridCol: 2, strength: 60, armyGroupId: 'eag1' }),
      ]

      const cautiousGeneral = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        traits: { aggression: 2, caution: 9, logistics: 5, innovation: 5, morale: 5 },
        currentOrder: { type: 'ADVANCE', objectiveCol: 2, objectiveRow: 5 },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1', 'div2'],
        generalId: 'gen1',
        sectorStartCol: 0,
        sectorEndCol: 4,
      })

      const state = makeGroundState({
        groundUnits: [...friendlyDivs, ...enemyDivs],
        generals: [cautiousGeneral],
        armyGroups: [armyGroup],
        tick: 12,
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      const attackers = allUnits.filter(u => u.nation === 'usa' && u.stance === 'attack')
      // Cautious general needs 3:1 — at 2:1 should NOT attack
      expect(attackers.length).toBe(0)
    })
  })

  describe('does not run on wrong tick', () => {
    it('skips processing when tick is not divisible by 12', () => {
      const divs = [
        makeGroundUnit({ id: 'div1', nation: 'usa', gridRow: 3, gridCol: 0, stance: 'defend', armyGroupId: 'ag1' }),
      ]

      const general = makeGeneral({
        id: 'gen1',
        nation: 'usa',
        armyGroupId: 'ag1',
        currentOrder: { type: 'RESERVE' },
      })

      const armyGroup = makeArmyGroup({
        id: 'ag1',
        nation: 'usa',
        divisionIds: ['div1'],
        generalId: 'gen1',
      })

      const state = makeGroundState({
        groundUnits: divs,
        generals: [general],
        armyGroups: [armyGroup],
        tick: 7, // Not divisible by 12
      })

      processGeneralAI(state, rng)

      const allUnits = Array.from(state.groundUnits!.values())
      // Should still be 'defend' because processing was skipped
      expect(allUnits[0].stance).toBe('defend')
    })
  })
})
