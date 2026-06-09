import { describe, it, expect, beforeEach } from 'vitest'
import { processAI, resetAIState } from '../ai'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Unit, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'missile_battery',
    position: { lat: 27, lng: 52 },
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
    roe: 'weapons_tight' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[], opts: { atWar?: boolean } = {}): GameState {
  const atWar = opts.atWar ?? false
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 100, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: atWar ? ['iran'] : [],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: atWar ? ['usa'] : [],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
    attackCounters: {},
  }
}

function makeIranLauncher(): Unit {
  return makeUnit({
    id: 'ir_launcher',
    nation: 'iran',
    weapons: [{ weaponId: 'zolfaghar', count: 30, maxCount: 30, reloadTimeSec: 0 }],
  })
}

function makeUsTarget(): Unit {
  return makeUnit({
    id: 'us_base',
    nation: 'usa',
    category: 'airbase',
    position: { lat: 26, lng: 52 },
  })
}

const launches = (cmds: ReturnType<typeof processAI>) =>
  cmds.filter(c => c.type === 'LAUNCH_MISSILE')

// ── Tests ───────────────────────────────────────────────────────

describe('processAI', () => {
  beforeEach(() => {
    resetAIState()
  })

  it('counts attacks once via the attack counter — stale pendingEvents never retrigger retaliation', () => {
    const rng = new SeededRNG(42)
    const state = makeState([makeIranLauncher(), makeUsTarget()], { atWar: true })

    // Stale undrained UI event (simulates hidden tab / fast-forward); must be ignored
    state.pendingEvents.push({ type: 'MISSILE_IMPACT', missileId: 'm_1', targetId: 'ir_launcher', damage: 10, tick: 90 })

    // First pass establishes AI state at war (ALERT window)
    state.time.tick = 100
    processAI(state, rng)

    // An attack lands: combat bumped the counter
    state.attackCounters = { iran: 1 }
    state.time.tick = 200
    const retaliation = launches(processAI(state, rng))
    expect(retaliation.length).toBeGreaterThanOrEqual(1)
    expect(retaliation.every(c => c.type === 'LAUNCH_MISSILE' && c.launcherId === 'ir_launcher')).toBe(true)

    // Cooldown elapsed, counter unchanged, stale event still in pendingEvents → NO new salvo
    state.time.tick = 501
    expect(launches(processAI(state, rng))).toHaveLength(0)
    state.time.tick = 801
    expect(launches(processAI(state, rng))).toHaveLength(0)

    // A genuinely new attack (counter delta) retaliates again
    state.attackCounters = { iran: 2 }
    state.time.tick = 1102
    expect(launches(processAI(state, rng)).length).toBeGreaterThanOrEqual(1)
  })

  it('auto-declares war when attacked', () => {
    const rng = new SeededRNG(42)
    const state = makeState([makeIranLauncher(), makeUsTarget()])

    state.time.tick = 100
    processAI(state, rng)
    expect(state.nations.iran.atWar).toHaveLength(0)

    state.attackCounters = { iran: 1 }
    state.time.tick = 150
    processAI(state, rng)
    expect(state.nations.iran.atWar).toContain('usa')
    expect(state.nations.usa.atWar).toContain('iran')
    expect(state.pendingEvents.some(e => e.type === 'WAR_DECLARED' && e.attacker === 'iran')).toBe(true)
  })

  it('sets enemy units weapons_free when war starts (ALERT)', () => {
    const rng = new SeededRNG(42)
    const state = makeState([makeIranLauncher(), makeUsTarget()], { atWar: true })

    state.time.tick = 100
    const cmds = processAI(state, rng)
    expect(cmds.some(c => c.type === 'SET_ROE' && c.unitId === 'ir_launcher' && c.roe === 'weapons_free')).toBe(true)
  })

  it('initiates offensive salvos after sustained war even without being attacked', () => {
    const rng = new SeededRNG(42)
    const state = makeState([makeIranLauncher(), makeUsTarget()], { atWar: true })

    state.time.tick = 100
    expect(launches(processAI(state, rng))).toHaveLength(0)

    // Still inside the defensive window, never attacked → quiet
    state.time.tick = 1000
    expect(launches(processAI(state, rng))).toHaveLength(0)

    // Past the escalation threshold → OFFENSIVE initiates without provocation
    state.time.tick = 2000
    const offensive = launches(processAI(state, rng))
    expect(offensive.length).toBeGreaterThanOrEqual(1)
  })
})
