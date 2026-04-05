import { describe, it, expect } from 'vitest'
import { processEspionage } from '../espionage'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, NationId, IntelBudget } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 32, lng: 53 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_free' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[], budgets: { usa?: IntelBudget; iran?: IntelBudget } = {}, tick = 3600): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
        intelBudget: budgets.usa,
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
        intelBudget: budgets.iran,
      },
    },
    units: unitMap,
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('processEspionage', () => {
  it('HUMINT reveals enemy units with probability based on budget', () => {
    // Use a fixed seed and high HUMINT budget to guarantee reveals
    const rng = new SeededRNG(42)
    const iranUnits = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `iran_unit_${i}`, nation: 'iran' }),
    )
    const state = makeState(iranUnits, {
      usa: { total_pct: 30, humint_pct: 100, sigint_pct: 0, satellite_pct: 0 },
    }, 3600) // tick divisible by 3600

    const result = processEspionage(state, rng)
    const revealed = result.humintRevealed.get('usa') ?? []

    // With total_pct=30 and humint_pct=100, chance = 0.005 * (100/10) * (30/10) = 0.15
    // With 20 units, expected ~3 reveals. With seed 42, we just check > 0.
    expect(revealed.length).toBeGreaterThan(0)
    // All revealed must be iranian units
    for (const uid of revealed) {
      expect(uid).toMatch(/^iran_unit_/)
    }
  })

  it('zero budget means no HUMINT reveals', () => {
    const rng = new SeededRNG(42)
    const iranUnits = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `iran_unit_${i}`, nation: 'iran' }),
    )
    const state = makeState(iranUnits, {
      usa: { total_pct: 0, humint_pct: 50, sigint_pct: 25, satellite_pct: 25 },
    }, 3600)

    const result = processEspionage(state, rng)
    // total_pct=0 means the budget branch should set default multiplier and skip HUMINT
    const revealed = result.humintRevealed.get('usa')
    expect(revealed).toBeUndefined()
  })

  it('SIGINT multiplier scales with budget (default 1.5, max 2.0)', () => {
    const rng = new SeededRNG(42)

    // No budget → default 1.5
    const stateNoBudget = makeState([], {}, 0)
    const resultNone = processEspionage(stateNoBudget, rng)
    expect(resultNone.sigintMultiplier.get('usa')).toBe(1.5)
    expect(resultNone.sigintMultiplier.get('iran')).toBe(1.5)

    // Full SIGINT budget → 2.0
    const stateFull = makeState([], {
      usa: { total_pct: 15, humint_pct: 0, sigint_pct: 100, satellite_pct: 0 },
    }, 0)
    const resultFull = processEspionage(stateFull, rng)
    expect(resultFull.sigintMultiplier.get('usa')).toBe(2.0)

    // Half SIGINT budget → 1.75
    const stateHalf = makeState([], {
      usa: { total_pct: 15, humint_pct: 0, sigint_pct: 50, satellite_pct: 50 },
    }, 0)
    const resultHalf = processEspionage(stateHalf, rng)
    expect(resultHalf.sigintMultiplier.get('usa')).toBe(1.75)
  })

  it('HUMINT only checks once per 3600 ticks (game-hour)', () => {
    const rng = new SeededRNG(42)
    const iranUnits = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `iran_unit_${i}`, nation: 'iran' }),
    )

    // tick NOT divisible by 3600 → no HUMINT check
    const state = makeState(iranUnits, {
      usa: { total_pct: 30, humint_pct: 100, sigint_pct: 0, satellite_pct: 0 },
    }, 1800) // mid-hour

    const result = processEspionage(state, rng)
    const revealed = result.humintRevealed.get('usa')
    expect(revealed).toBeUndefined()
  })

  it('HUMINT does not reveal own-nation units', () => {
    const rng = new SeededRNG(42)
    const usaUnits = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `usa_unit_${i}`, nation: 'usa' }),
    )
    const state = makeState(usaUnits, {
      usa: { total_pct: 30, humint_pct: 100, sigint_pct: 0, satellite_pct: 0 },
    }, 3600)

    const result = processEspionage(state, rng)
    const revealed = result.humintRevealed.get('usa') ?? []
    // No USA units should be in the revealed list — USA HUMINT targets enemy nation only
    expect(revealed.length).toBe(0)
  })

  it('HUMINT does not reveal destroyed units', () => {
    const rng = new SeededRNG(42)
    const iranUnits = Array.from({ length: 20 }, (_, i) =>
      makeUnit({ id: `iran_unit_${i}`, nation: 'iran', status: 'destroyed' }),
    )
    const state = makeState(iranUnits, {
      usa: { total_pct: 30, humint_pct: 100, sigint_pct: 0, satellite_pct: 0 },
    }, 3600)

    const result = processEspionage(state, rng)
    const revealed = result.humintRevealed.get('usa') ?? []
    expect(revealed.length).toBe(0)
  })

  it('absent intelBudget gives default 1.5 SIGINT multiplier', () => {
    const rng = new SeededRNG(99)
    const state = makeState([], {}, 3600)
    // Neither nation has intelBudget set
    const result = processEspionage(state, rng)
    expect(result.sigintMultiplier.get('usa')).toBe(1.5)
    expect(result.sigintMultiplier.get('iran')).toBe(1.5)
  })
})
