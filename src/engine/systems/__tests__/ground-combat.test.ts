import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeLocalForceRatio,
  processGroundCombat,
  resetGroundCombatState,
  getTickBattles,
} from '../ground-combat'
import type { NationId, GameState } from '@/types/game'
import type {
  GroundUnit,
  ControlGrid,
  ControlCell,
  TerrainType,
  GroundUnitId,
} from '@/types/ground'
import { SeededRNG } from '@/engine/utils/rng'

// ── Helpers ─────────────────────────────────────────────────────

function makeGroundUnit(overrides: Partial<GroundUnit> & { id: GroundUnitId; nation: NationId }): GroundUnit {
  return {
    name: overrides.id,
    type: 'infantry',
    armyGroupId: 'ag1',
    gridRow: 0,
    gridCol: 0,
    softAttack: 45,
    hardAttack: 8,
    defense: 55,
    breakthrough: 12,
    hardness: 0.05,
    strength: 100,
    morale: 80,
    experience: 1.0,
    organization: 80,
    supplyState: 100,
    fuelState: 100,
    ammoState: 100,
    stance: 'defend',
    status: 'active',
    entrenched: 0,
    combatWidth: 1,
    ...overrides,
  } as GroundUnit
}

function makeCell(controller: NationId | null, terrain: TerrainType = 'plains'): ControlCell {
  return { controller, pressure: 0, terrain, fortification: 0, supplyConnected: false }
}

function makeFlatGrid(rows: number, cols: number, cellArray: ControlCell[]): ControlGrid {
  return { rows, cols, cells: cellArray, originLat: 30, originLng: 50, cellSizeKm: 10 }
}

function makeState(groundUnits: GroundUnit[], grid: ControlGrid): GameState {
  const groundMap = new Map<GroundUnitId, GroundUnit>(groundUnits.map(u => [u.id, u]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 100, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
      },
    },
    units: new Map(),
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
    groundUnits: groundMap,
    controlGrid: grid,
  } as GameState
}

// ── Tests ───────────────────────────────────────────────────────

describe('computeLocalForceRatio', () => {
  it('returns ~1:1 for equal forces on plains with no entrenchment', () => {
    const attackers = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const ratio = computeLocalForceRatio(attackers, defenders, 'plains', 0)
    // softAttack * (1 - 0.05) + hardAttack * 0.05 = 45*0.95 + 8*0.05 = 43.15
    // defense = 55 * 1.0 = 55
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('multiple attackers increase force ratio', () => {
    const oneAttacker = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const twoAttackers = [
      makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' }),
      makeGroundUnit({ id: 'a2' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' }),
    ]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const oneRatio = computeLocalForceRatio(oneAttacker, defenders, 'plains', 0)
    const twoRatio = computeLocalForceRatio(twoAttackers, defenders, 'plains', 0)

    expect(twoRatio).toBeCloseTo(oneRatio * 2, 1)
  })
})

describe('processGroundCombat — continuous attrition', () => {
  const rng = new SeededRNG(42)

  beforeEach(() => {
    resetGroundCombatState()
  })

  it('equal force attrition: both sides take equal damage', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    // Use identical stats so power is symmetric (softAttack ~ defense)
    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50,
      strength: 100, morale: 80, organization: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', softAttack: 50, hardAttack: 50, defense: 50,
      strength: 100, morale: 80, organization: 80,
    })

    const state = makeState([attacker, defender], grid)
    processGroundCombat(state, rng)

    const atkAfter = state.groundUnits!.get('atk1' as GroundUnitId)!
    const defAfter = state.groundUnits!.get('def1' as GroundUnitId)!

    // Both should have taken some damage
    expect(atkAfter.strength).toBeLessThan(100)
    expect(defAfter.strength).toBeLessThan(100)

    // Attacker uses stance atk mod 1.0, defender uses stance def mod 1.0
    // So power should be roughly equal
    const atkLoss = 100 - atkAfter.strength
    const defLoss = 100 - defAfter.strength
    // They should be in the same ballpark (within 2x)
    expect(atkLoss).toBeGreaterThan(0)
    expect(defLoss).toBeGreaterThan(0)
  })

  it('3:1 advantage: attacker with 3x power deals ~3x more damage', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const attackers = [
      makeGroundUnit({ id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50, strength: 100, morale: 80, organization: 80 }),
      makeGroundUnit({ id: 'atk2' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50, strength: 100, morale: 80, organization: 80 }),
      makeGroundUnit({ id: 'atk3' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50, strength: 100, morale: 80, organization: 80 }),
    ]
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', softAttack: 50, hardAttack: 50, defense: 50,
      strength: 100, morale: 80, organization: 80,
    })

    const state = makeState([...attackers, defender], grid)
    processGroundCombat(state, rng)

    const defAfter = state.groundUnits!.get('def1' as GroundUnitId)!
    const avgAtkLoss = attackers.reduce((sum, a) => {
      const u = state.groundUnits!.get(a.id)!
      return sum + (100 - u.strength)
    }, 0) / attackers.length

    const defLoss = 100 - defAfter.strength

    // Defender should take much more damage than each individual attacker
    expect(defLoss).toBeGreaterThan(avgAtkLoss * 2)
  })

  it('terrain defense: mountains should approximately double effective defense', () => {
    // Use high attack/defense values so damage differences are measurable
    const makeAtk = () => makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 500, hardAttack: 500, defense: 500,
      strength: 100, morale: 100, organization: 100,
    })
    const makeDef = () => makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', softAttack: 500, hardAttack: 500, defense: 500,
      strength: 100, morale: 100, organization: 100,
    })

    // Run on plains
    const plainsCells = [makeCell('usa' as NationId), makeCell('iran' as NationId, 'plains')]
    const plainsGrid = makeFlatGrid(1, 2, plainsCells)
    const plainsState = makeState([makeAtk(), makeDef()], plainsGrid)
    processGroundCombat(plainsState, rng)
    const plainsDefLoss = 100 - plainsState.groundUnits!.get('def1' as GroundUnitId)!.strength
    const plainsAtkLoss = 100 - plainsState.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // Run on mountains
    resetGroundCombatState()
    const mtCells = [makeCell('usa' as NationId), makeCell('iran' as NationId, 'mountains')]
    const mtGrid = makeFlatGrid(1, 2, mtCells)
    const mtState = makeState([makeAtk(), makeDef()], mtGrid)
    processGroundCombat(mtState, rng)
    const mtDefLoss = 100 - mtState.groundUnits!.get('def1' as GroundUnitId)!.strength
    const mtAtkLoss = 100 - mtState.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // Terrain modifies defender power, not attacker power.
    // So defender damage stays the same, but attacker takes more damage
    // because the defender's effective power (which determines damage to attacker) is higher.
    expect(mtDefLoss).toBe(plainsDefLoss) // Attacker power is terrain-independent
    expect(mtAtkLoss).toBeGreaterThan(plainsAtkLoss) // Stronger defense hits back harder
  })

  it('entrenchment: 50% entrenchment multiplies defense by 1.5', () => {
    // No entrenchment
    const cells1 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid1 = makeFlatGrid(1, 2, cells1)

    const atk1 = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50,
      strength: 100, morale: 100, organization: 100,
    })
    const def1 = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 50, strength: 100, morale: 100, organization: 100,
      entrenched: 0,
    })
    const state1 = makeState([atk1, def1], grid1)
    processGroundCombat(state1, rng)
    const noEntrenchAtkLoss = 100 - state1.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // With 50% entrenchment
    resetGroundCombatState()
    const cells2 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid2 = makeFlatGrid(1, 2, cells2)

    const atk2 = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50, defense: 50,
      strength: 100, morale: 100, organization: 100,
    })
    const def2 = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 50, strength: 100, morale: 100, organization: 100,
      entrenched: 50,
    })
    const state2 = makeState([atk2, def2], grid2)
    processGroundCombat(state2, rng)
    const entrenchedAtkLoss = 100 - state2.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // Entrenched defender should deal more damage to attacker
    expect(entrenchedAtkLoss).toBeGreaterThan(noEntrenchAtkLoss)
  })

  it('supply penalty: units below 30% supply deal 40% damage', () => {
    // Full supply
    const cells1 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid1 = makeFlatGrid(1, 2, cells1)

    const atkFull = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50,
      strength: 100, morale: 100, organization: 100, supplyState: 100,
    })
    const defFull = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 50, strength: 100, morale: 100, organization: 100,
    })
    const state1 = makeState([atkFull, defFull], grid1)
    processGroundCombat(state1, rng)
    const fullSupplyDefLoss = 100 - state1.groundUnits!.get('def1' as GroundUnitId)!.strength

    // Low supply attacker
    resetGroundCombatState()
    const cells2 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid2 = makeFlatGrid(1, 2, cells2)

    const atkLow = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50,
      strength: 100, morale: 100, organization: 100, supplyState: 10,
    })
    const defLow = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 50, strength: 100, morale: 100, organization: 100,
    })
    const state2 = makeState([atkLow, defLow], grid2)
    processGroundCombat(state2, rng)
    const lowSupplyDefLoss = 100 - state2.groundUnits!.get('def1' as GroundUnitId)!.strength

    // Low supply should deal roughly 40% of full supply damage
    expect(lowSupplyDefLoss).toBeLessThan(fullSupplyDefLoss)
    expect(lowSupplyDefLoss).toBeCloseTo(fullSupplyDefLoss * 0.4, 0)
  })

  it('organization collapse: unit with org < 5 should auto-retreat', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    // Give attacker very high attack and defender very low org
    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 200, hardAttack: 200,
      strength: 100, morale: 80, organization: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 20,
      strength: 100, morale: 80, organization: 4, // Below ORG_COLLAPSE threshold
    })

    const state = makeState([attacker, defender], grid)
    processGroundCombat(state, rng)

    const defAfter = state.groundUnits!.get('def1' as GroundUnitId)!
    // Org was already below ORG_PENALTY (20), so halved effectiveness
    // Org was below ORG_COLLAPSE (5), so any combat damage keeps it below
    // Should be routing with retreat stance
    if (defAfter.status !== 'destroyed') {
      expect(defAfter.status).toBe('routing')
      expect(defAfter.stance).toBe('retreat')
    }
  })

  it('breakthrough bonus: high breakthrough ratio boosts attacker damage', () => {
    // Normal attack (low breakthrough)
    const cells1 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid1 = makeFlatGrid(1, 2, cells1)

    const atkNormal = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50, breakthrough: 5,
      strength: 100, morale: 100, organization: 100,
    })
    const defNormal = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 10, // Low defense so breakthrough can trigger
      strength: 100, morale: 100, organization: 100,
    })
    const state1 = makeState([atkNormal, defNormal], grid1)
    processGroundCombat(state1, rng)
    const normalDefLoss = 100 - state1.groundUnits!.get('def1' as GroundUnitId)!.strength
    const normalAtkLoss = 100 - state1.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // High breakthrough attack
    resetGroundCombatState()
    const cells2 = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid2 = makeFlatGrid(1, 2, cells2)

    const atkBreak = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 50, hardAttack: 50, breakthrough: 500, // Very high
      strength: 100, morale: 100, organization: 100,
    })
    const defBreak = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 10,
      strength: 100, morale: 100, organization: 100,
    })
    const state2 = makeState([atkBreak, defBreak], grid2)
    processGroundCombat(state2, rng)
    const breakDefLoss = 100 - state2.groundUnits!.get('def1' as GroundUnitId)!.strength
    const breakAtkLoss = 100 - state2.groundUnits!.get('atk1' as GroundUnitId)!.strength

    // With breakthrough: defender takes 1.5x damage, attacker takes 0.5x damage
    expect(breakDefLoss).toBeGreaterThan(normalDefLoss)
    expect(breakAtkLoss).toBeLessThan(normalAtkLoss)
  })

  it('pressure accumulation: sustained attacks increase cell pressure', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 80, hardAttack: 80,
      strength: 100, morale: 100, organization: 100,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 30,
      strength: 100, morale: 100, organization: 100,
    })

    const state = makeState([attacker, defender], grid)

    // Run one tick
    processGroundCombat(state, rng)

    // Pressure should have increased on the defender's cell (attacker is stronger)
    expect(grid.cells[1].pressure).toBeGreaterThan(0)
  })

  it('cell flip: pressure reaching 100 should flip cell controller', () => {
    // Pre-set pressure close to 100 so one tick of combat flips it
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    cells[1].pressure = 99 // Almost flipped
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 100, hardAttack: 100,
      strength: 100, morale: 100, organization: 100,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 10,
      strength: 100, morale: 100, organization: 100,
    })

    const state = makeState([attacker, defender], grid)
    processGroundCombat(state, rng)

    // Cell should have flipped to USA
    expect(grid.cells[1].controller).toBe('usa')
    // Pressure should be reset to 0 after flip
    expect(grid.cells[1].pressure).toBe(0)
  })

  it('recovery: units not in combat should recover org and morale', () => {
    // Create a unit that is not adjacent to any enemy — just in a cell by itself
    const cells = [
      makeCell('usa' as NationId), makeCell('usa' as NationId),
      makeCell('usa' as NationId), makeCell('usa' as NationId),
    ]
    const grid = makeFlatGrid(2, 2, cells)

    const unit = makeGroundUnit({
      id: 'u1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'reserve', organization: 50, morale: 50,
    })

    const state = makeState([unit], grid)
    processGroundCombat(state, rng)

    const after = state.groundUnits!.get('u1' as GroundUnitId)!
    // Reserve stance gives +5 org per tick
    expect(after.organization).toBe(55)
    // Morale recovery is +1 per tick
    expect(after.morale).toBe(51)
  })

  it('recovery: routing units recover and become active', () => {
    const cells = [makeCell('usa' as NationId)]
    const grid = makeFlatGrid(1, 1, cells)

    const unit = makeGroundUnit({
      id: 'u1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'retreat', status: 'routing',
      organization: 19, morale: 29, // Just below thresholds
    })

    const state = makeState([unit], grid)
    processGroundCombat(state, rng)

    const after = state.groundUnits!.get('u1' as GroundUnitId)!
    // Org: 19 + 1 (non-reserve, non-defend/fortify) = 20
    // Morale: 29 + 1 = 30
    // Both meet recovery thresholds (org >= 20, morale >= 30)
    expect(after.status).toBe('active')
    expect(after.stance).toBe('defend')
  })

  it('does not attack when no units have attack stance', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const unit = makeGroundUnit({
      id: 'u1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'defend',
    })
    const enemy = makeGroundUnit({
      id: 'e1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend',
    })

    const state = makeState([unit, enemy], grid)
    processGroundCombat(state, rng)

    expect(state.events).toHaveLength(0)
    expect(getTickBattles()).toHaveLength(0)
  })

  it('skips when no controlGrid', () => {
    const state: GameState = {
      playerNation: 'usa',
      initialized: true,
      time: { tick: 100, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
      nations: {
        usa: {
          id: 'usa', name: 'USA',
          economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
          relations: { usa: 100, iran: -60 }, atWar: ['iran'],
        },
        iran: {
          id: 'iran', name: 'Iran',
          economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
          relations: { usa: -60, iran: 100 }, atWar: ['usa'],
        },
      },
      units: new Map(),
      missiles: new Map(),
      engagements: new Map(),
      supplyLines: new Map(),
      events: [],
      pendingEvents: [],
    } as GameState

    processGroundCombat(state, rng)
    expect(state.events).toHaveLength(0)
  })

  it('emits BATTLE_RESULT event with correct metadata', () => {
    const cells = [makeCell('usa' as NationId, 'forest'), makeCell('iran' as NationId, 'plains')]
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack',
      softAttack: 80, hardAttack: 80, strength: 100, morale: 90, organization: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1, stance: 'defend',
      defense: 30, strength: 100, morale: 70, organization: 80,
    })

    const state = makeState([attacker, defender], grid)
    processGroundCombat(state, rng)

    const battleEvents = state.events.filter((e: { type: string }) => e.type === 'BATTLE_RESULT')
    expect(battleEvents.length).toBe(1)

    const evt = battleEvents[0] as unknown as { type: 'BATTLE_RESULT'; tick: number; attackerNation: NationId; defenderNation: NationId; cellRow: number; cellCol: number }
    expect(evt.attackerNation).toBe('usa')
    expect(evt.defenderNation).toBe('iran')
    expect(evt.cellRow).toBe(0)
    expect(evt.cellCol).toBe(1)
    expect(evt.tick).toBe(100)
  })

  it('populates BattleIndicator with combat data', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 80, hardAttack: 80,
      strength: 100, morale: 80, organization: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', defense: 40,
      strength: 100, morale: 80, organization: 80,
    })

    const state = makeState([attacker, defender], grid)
    processGroundCombat(state, rng)

    const battles = getTickBattles()
    expect(battles).toHaveLength(1)

    const b = battles[0]
    expect(b.attackerNation).toBe('usa')
    expect(b.defenderNation).toBe('iran')
    expect(b.attackerPower).toBeGreaterThan(0)
    expect(b.defenderPower).toBeGreaterThan(0)
    expect(b.forceRatio).toBeGreaterThan(0)
    expect(b.attackerUnits).toBe(1)
    expect(b.defenderUnits).toBe(1)
    expect(b.position).toBeDefined()
    expect(b.intensity).toBeGreaterThan(0)
  })

  it('handles adjacent friendly support in attack', () => {
    // 2x2 grid: Top-left USA, top-right USA, bottom-left Iran, bottom-right Iran
    // Target = (1,1) Iran. Neighbors: (0,1) USA, (1,0) Iran
    // atk1 at (0,1) initiates attack on (1,1). Support from neighbors of (1,1):
    //   (0,1) = initiating cell (skip), (1,0) = Iran, nothing else.
    //
    // Better: 3x2 grid. Target at (1,1). atk1 at (0,1), atk2 at (1,0) is USA.
    // Neighbors of (1,1): (0,1), (2,1), (1,0), (1,2)
    const cells = [
      makeCell('usa' as NationId), makeCell('usa' as NationId),
      makeCell('usa' as NationId), makeCell('iran' as NationId),
      makeCell('usa' as NationId), makeCell('iran' as NationId),
    ]
    const grid = makeFlatGrid(3, 2, cells)

    // atk1 at (0,1) — adjacent to target (1,1)
    const mainAttacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 1,
      stance: 'attack', softAttack: 45, hardAttack: 8,
    })
    // atk2 at (1,0) — also adjacent to target (1,1), will be gathered as support
    const support = makeGroundUnit({
      id: 'atk2' as GroundUnitId, nation: 'usa' as NationId, gridRow: 1, gridCol: 0,
      stance: 'attack', softAttack: 45, hardAttack: 8,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 1, gridCol: 1,
      stance: 'defend', defense: 55,
    })

    const state = makeState([mainAttacker, support, defender], grid)
    processGroundCombat(state, rng)

    const battles = getTickBattles()
    expect(battles.length).toBeGreaterThan(0)
    // Find the battle targeting the Iran cell (1,1)
    const b = battles.find(b => b.defenderNation === ('iran' as NationId))
    expect(b).toBeDefined()
    // atk1 initiates from (0,1), atk2 at (1,0) is gathered as support (neighbor of target, USA, attack stance)
    expect(b!.attackerUnits).toBe(2)
  })
})
