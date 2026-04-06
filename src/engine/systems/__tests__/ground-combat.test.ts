import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeLocalForceRatio,
  resolveCombat,
  processGroundCombat,
  resetGroundCombatState,
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

// ── computeLocalForceRatio ──────────────────────────────────────

describe('computeLocalForceRatio', () => {
  it('returns ~1:1 for equal forces on plains with no entrenchment', () => {
    const attackers = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const ratio = computeLocalForceRatio(attackers, defenders, 'plains', 0)
    // attackerPower = softAttack * (1 - 0.05) + hardAttack * 0.05 = 45*0.95 + 8*0.05 = 43.15
    // defenderPower = defense * 1.0 * (1 + 0/100) = 55 * 1.0 = 55
    // ratio = 43.15 / 55 ~ 0.785
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('terrain defense modifier increases defender power', () => {
    const attackers = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const plainsRatio = computeLocalForceRatio(attackers, defenders, 'plains', 0)
    const mountainRatio = computeLocalForceRatio(attackers, defenders, 'mountains', 0)

    // Mountains have 2.0x defense modifier vs plains 1.0x
    expect(mountainRatio).toBeLessThan(plainsRatio)
    expect(mountainRatio).toBeCloseTo(plainsRatio / 2, 1)
  })

  it('entrenchment increases defender power', () => {
    const attackers = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const noEntrench = computeLocalForceRatio(attackers, defenders, 'plains', 0)
    const fullEntrench = computeLocalForceRatio(attackers, defenders, 'plains', 100)

    // entrenchment 100 -> (1 + 100/100) = 2x defense
    expect(fullEntrench).toBeCloseTo(noEntrench / 2, 1)
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

  it('damaged units contribute proportionally less', () => {
    const fullStrength = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', strength: 100 })]
    const halfStrength = [makeGroundUnit({ id: 'a2' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', strength: 50 })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const fullRatio = computeLocalForceRatio(fullStrength, defenders, 'plains', 0)
    const halfRatio = computeLocalForceRatio(halfStrength, defenders, 'plains', 0)

    expect(halfRatio).toBeCloseTo(fullRatio / 2, 1)
  })

  it('hardness affects attacker power calculation', () => {
    // High hardness defenders = hardAttack matters more
    const attackers = [makeGroundUnit({
      id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack',
      softAttack: 10, hardAttack: 50,
    })]
    const softDefenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, hardness: 0.0, defense: 50 })]
    const hardDefenders = [makeGroundUnit({ id: 'd2' as GroundUnitId, nation: 'iran' as NationId, hardness: 1.0, defense: 50 })]

    const vsSoft = computeLocalForceRatio(attackers, softDefenders, 'plains', 0)
    const vsHard = computeLocalForceRatio(attackers, hardDefenders, 'plains', 0)

    // Against soft: power = 10*(1-0) + 50*0 = 10
    // Against hard: power = 10*(1-1) + 50*1 = 50
    expect(vsHard).toBeGreaterThan(vsSoft)
  })

  it('returns ratio against min 1 when no defenders', () => {
    const attackers = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack' })]
    const ratio = computeLocalForceRatio(attackers, [], 'plains', 0)
    expect(ratio).toBeGreaterThan(0)
  })
})

// ── Supply modifier ─────────────────────────────────────────────

describe('supply modifier', () => {
  it('low supply (< 30) severely degrades combat power', () => {
    const fullSupply = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 100 })]
    const noSupply = [makeGroundUnit({ id: 'a2' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 10 })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const fullRatio = computeLocalForceRatio(fullSupply, defenders, 'plains', 0)
    const lowRatio = computeLocalForceRatio(noSupply, defenders, 'plains', 0)

    // supplyState < 30 -> 0.4 modifier
    expect(lowRatio).toBeCloseTo(fullRatio * 0.4, 1)
  })

  it('medium supply (30-59) moderately degrades combat power', () => {
    const fullSupply = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 100 })]
    const medSupply = [makeGroundUnit({ id: 'a2' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 45 })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const fullRatio = computeLocalForceRatio(fullSupply, defenders, 'plains', 0)
    const medRatio = computeLocalForceRatio(medSupply, defenders, 'plains', 0)

    expect(medRatio).toBeCloseTo(fullRatio * 0.7, 1)
  })

  it('full supply (>=60) has no penalty', () => {
    const supply60 = [makeGroundUnit({ id: 'a1' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 60 })]
    const supply100 = [makeGroundUnit({ id: 'a2' as GroundUnitId, nation: 'usa' as NationId, stance: 'attack', supplyState: 100 })]
    const defenders = [makeGroundUnit({ id: 'd1' as GroundUnitId, nation: 'iran' as NationId, stance: 'defend' })]

    const r60 = computeLocalForceRatio(supply60, defenders, 'plains', 0)
    const r100 = computeLocalForceRatio(supply100, defenders, 'plains', 0)

    expect(r60).toBeCloseTo(r100, 5)
  })
})

// ── CRT resolution ──────────────────────────────────────────────

describe('resolveCombat', () => {
  it('returns valid CombatResult strings', () => {
    const rng = new SeededRNG(42)
    const validResults = ['attacker_eliminated', 'attacker_retreat', 'exchange', 'defender_retreat', 'defender_eliminated']

    for (let i = 0; i < 50; i++) {
      const result = resolveCombat(1.0, rng)
      expect(validResults).toContain(result)
    }
  })

  it('very low ratio (1:2) heavily favors defender', () => {
    // At 1:2 ratio, even best roll (5) is EX, most are AE or AR
    const rng = new SeededRNG(123)
    let defWins = 0
    const trials = 1000
    for (let i = 0; i < trials; i++) {
      const result = resolveCombat(0.3, rng) // 1:2 column
      if (result === 'attacker_eliminated' || result === 'attacker_retreat') defWins++
    }
    // At 1:2: 2 AE, 3 AR, 1 EX out of 6 -> ~83% attacker losses
    expect(defWins / trials).toBeGreaterThan(0.7)
  })

  it('very high ratio (4:1+) heavily favors attacker', () => {
    const rng = new SeededRNG(456)
    let atkWins = 0
    const trials = 1000
    for (let i = 0; i < trials; i++) {
      const result = resolveCombat(5.0, rng) // 4:1+ column
      if (result === 'defender_eliminated' || result === 'defender_retreat') atkWins++
    }
    // At 4:1+: all 6 results are DE -> 100%
    expect(atkWins / trials).toBe(1.0)
  })

  it('moderate ratio (2:1) has mixed outcomes', () => {
    const rng = new SeededRNG(789)
    let de = 0; let dr = 0; let ex = 0
    const trials = 1000
    for (let i = 0; i < trials; i++) {
      const result = resolveCombat(1.8, rng) // 2:1 column
      if (result === 'defender_eliminated') de++
      else if (result === 'defender_retreat') dr++
      else if (result === 'exchange') ex++
    }
    // 2:1 column: DR, EX, EX, DR, DE, DE -> expect DR, EX, and DE all appear
    expect(dr).toBeGreaterThan(0)
    expect(ex).toBeGreaterThan(0)
    expect(de).toBeGreaterThan(0)
  })

  it('3:2 ratio column works correctly', () => {
    const rng = new SeededRNG(111)
    const results = new Set<string>()
    for (let i = 0; i < 600; i++) {
      results.add(resolveCombat(1.3, rng)) // 3:2 column
    }
    // 3:2 column: AR, EX, EX, DR, DR, DE -> should see AR, EX, DR, DE
    expect(results.has('attacker_retreat')).toBe(true)
    expect(results.has('exchange')).toBe(true)
    expect(results.has('defender_retreat')).toBe(true)
    expect(results.has('defender_eliminated')).toBe(true)
  })
})

// ── processGroundCombat ─────────────────────────────────────────

describe('processGroundCombat', () => {
  beforeEach(() => {
    resetGroundCombatState()
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

    const rng = new SeededRNG(42)
    // Should not throw
    processGroundCombat(state, rng)
    expect(state.events).toHaveLength(0)
  })

  it('skips when no ground units', () => {
    // 2x2 flat grid: row-major [usa, iran, usa, iran]
    const cells = [
      makeCell('usa' as NationId), makeCell('iran' as NationId),
      makeCell('usa' as NationId), makeCell('iran' as NationId),
    ]
    const grid = makeFlatGrid(2, 2, cells)
    const state = makeState([], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)
    expect(state.events).toHaveLength(0)
  })

  it('flips cell controller when defender retreats', () => {
    // 1x2 flat grid: [usa, iran]
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const attackers = [
      makeGroundUnit({ id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 200, hardAttack: 200, strength: 100, morale: 100 }),
      makeGroundUnit({ id: 'atk2' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 200, hardAttack: 200, strength: 100, morale: 100 }),
      makeGroundUnit({ id: 'atk3' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack', softAttack: 200, hardAttack: 200, strength: 100, morale: 100 }),
    ]
    const defenders = [
      makeGroundUnit({ id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1, stance: 'defend', defense: 10, strength: 50, morale: 30 }),
    ]

    const state = makeState([...attackers, ...defenders], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)

    // With massive attacker advantage (ratio > 4:1), all CRT results are DE
    // Cell should flip to USA
    expect(grid.cells[1].controller).toBe('usa')

    // Check that a BATTLE_RESULT event was emitted
    const battleEvents = state.events.filter((e: { type: string }) => e.type === 'BATTLE_RESULT')
    expect(battleEvents.length).toBeGreaterThan(0)
  })

  it('applies strength damage to combatants', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', strength: 100, morale: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', strength: 100, morale: 80,
    })

    const state = makeState([attacker, defender], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)

    const atkAfter = state.groundUnits!.get('atk1' as GroundUnitId)!
    const defAfter = state.groundUnits!.get('def1' as GroundUnitId)!

    // At least one side should have taken damage
    const someoneTookDamage = atkAfter.strength < 100 || defAfter.strength < 100
    expect(someoneTookDamage).toBe(true)
  })

  it('morale below 15 causes routing', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    // Defender starts with very low morale -- combat morale damage should push below 15
    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 100, hardAttack: 100, strength: 100, morale: 80,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend', strength: 100, morale: 10, defense: 20,
    })

    const state = makeState([attacker, defender], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)

    const defAfter = state.groundUnits!.get('def1' as GroundUnitId)!
    // Morale started at 10, any combat morale damage should push it further down
    // The routing check: morale < 15 -> status = 'routing'
    if (defAfter.morale < 15) {
      expect(defAfter.status).toBe('routing')
    }
    // Either defender is routing or was eliminated -- both are valid
  })

  it('does not attack when no units have attack stance', () => {
    const cells = [makeCell('usa' as NationId), makeCell('iran' as NationId)]
    const grid = makeFlatGrid(1, 2, cells)

    const unit = makeGroundUnit({
      id: 'u1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'defend', // NOT attacking
    })
    const enemy = makeGroundUnit({
      id: 'e1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1,
      stance: 'defend',
    })

    const state = makeState([unit, enemy], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)

    // No battles should occur
    expect(state.events).toHaveLength(0)
  })

  it('emits BATTLE_RESULT event with correct metadata', () => {
    const cells = [makeCell('usa' as NationId, 'forest'), makeCell('iran' as NationId, 'plains')]
    const grid = makeFlatGrid(1, 2, cells)

    const attacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0, stance: 'attack',
      softAttack: 80, hardAttack: 80, strength: 100, morale: 90,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 0, gridCol: 1, stance: 'defend',
      defense: 30, strength: 100, morale: 70,
    })

    const state = makeState([attacker, defender], grid)
    const rng = new SeededRNG(42)

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

  it('handles adjacent friendly support in attack', () => {
    // 2x2 grid: USA controls top row, Iran controls bottom row
    // row-major: [usa, usa, iran, iran]
    const cells = [
      makeCell('usa' as NationId), makeCell('usa' as NationId),
      makeCell('iran' as NationId), makeCell('iran' as NationId),
    ]
    const grid = makeFlatGrid(2, 2, cells)

    const mainAttacker = makeGroundUnit({
      id: 'atk1' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 0,
      stance: 'attack', softAttack: 45, hardAttack: 8,
    })
    const support = makeGroundUnit({
      id: 'atk2' as GroundUnitId, nation: 'usa' as NationId, gridRow: 0, gridCol: 1,
      stance: 'attack', softAttack: 45, hardAttack: 8,
    })
    const defender = makeGroundUnit({
      id: 'def1' as GroundUnitId, nation: 'iran' as NationId, gridRow: 1, gridCol: 0,
      stance: 'defend', defense: 55,
    })

    const state = makeState([mainAttacker, support, defender], grid)
    const rng = new SeededRNG(42)

    processGroundCombat(state, rng)

    // Both attackers should contribute to the battle
    const battleEvents = state.events.filter((e: { type: string }) => e.type === 'BATTLE_RESULT')
    expect(battleEvents.length).toBeGreaterThan(0)
  })
})
