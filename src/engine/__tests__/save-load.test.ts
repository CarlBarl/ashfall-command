import { describe, it, expect } from 'vitest'
import { GameEngine, SAVE_SCHEMA_VERSION } from '../game-engine'
import type { Nation, Unit, NationId } from '@/types/game'

// ── Scenario helpers ────────────────────────────────────────────

function makeNation(id: NationId, name: string): Nation {
  return {
    id,
    name,
    economy: { gdp_billions: 1000, military_budget_billions: 100, military_budget_pct_gdp: 3, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 100 },
    relations: { usa: 0, iran: 0 },
    atWar: [],
  }
}

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId; category: Unit['category'] }): Unit {
  return {
    name: overrides.id,
    position: { lat: 26, lng: 52 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 200,
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

function initEngine(): GameEngine {
  const engine = new GameEngine()
  const nations = { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }
  const units = [
    makeUnit({
      id: 'us_tlam', nation: 'usa', category: 'missile_battery',
      weapons: [{ weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 }],
    }),
    makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27.6, lng: 52.3 } }),
  ]
  engine.initFromData('usa', nations, units, [], {})
  return engine
}

const launchCmd = { type: 'LAUNCH_MISSILE', launcherId: 'us_tlam', weaponId: 'tomahawk', targetId: 'ir_base' } as const

// ── Tests ───────────────────────────────────────────────────────

describe('save/load', () => {
  it('stamps saves with the schema version', () => {
    const engine = initEngine()
    const raw = JSON.parse(engine.getFullStateJson())
    expect(raw.version).toBe(SAVE_SCHEMA_VERSION)
  })

  it('round-trips in-flight missiles and keeps their ids safe from new launches', () => {
    const engine = initEngine()
    engine.executeCommand(launchCmd)
    engine.executeCommand(launchCmd)
    expect([...engine.state.missiles.keys()]).toEqual(['m_1', 'm_2'])
    const savedLaunchTime = engine.state.missiles.get('m_1')!.launchTime

    const json = engine.getFullStateJson()
    const loaded = new GameEngine()
    loaded.loadState(json)
    expect([...loaded.state.missiles.keys()]).toEqual(['m_1', 'm_2'])

    // New launch after load must NOT overwrite a loaded in-flight missile
    loaded.executeCommand(launchCmd)
    expect(loaded.state.missiles.size).toBe(3)
    expect(loaded.state.missiles.has('m_3')).toBe(true)
    expect(loaded.state.missiles.get('m_1')!.launchTime).toBe(savedLaunchTime)
  })

  it('rejects unversioned and mismatched saves with a clear error', () => {
    const engine = initEngine()
    const raw = JSON.parse(engine.getFullStateJson())

    delete raw.version
    expect(() => new GameEngine().loadState(JSON.stringify(raw))).toThrow(/Incompatible save/)

    raw.version = SAVE_SCHEMA_VERSION + 999
    expect(() => new GameEngine().loadState(JSON.stringify(raw))).toThrow(/Incompatible save/)
  })

  it('backfills satellites and intel budget for saves that lack them', () => {
    const engine = initEngine()
    const raw = JSON.parse(engine.getFullStateJson())
    delete raw.nations.usa.satellites
    delete raw.nations.iran.satellites
    delete raw.nations.usa.intelBudget

    const loaded = new GameEngine()
    loaded.loadState(JSON.stringify(raw))
    expect(loaded.state.nations.usa.satellites?.length).toBeGreaterThan(0)
    expect(loaded.state.nations.iran.satellites?.length).toBeGreaterThan(0)
    expect(loaded.state.nations.usa.intelBudget).toBeDefined()
  })

  it('starting a new game resets module-level combat state (missile ids restart)', () => {
    const engine = initEngine()
    engine.executeCommand(launchCmd)
    expect(engine.state.missiles.has('m_1')).toBe(true)

    const nations = { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }
    const units = [
      makeUnit({
        id: 'us_tlam', nation: 'usa', category: 'missile_battery',
        weapons: [{ weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 }],
      }),
      makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27.6, lng: 52.3 } }),
    ]
    engine.initFromData('usa', nations, units, [], {})
    expect(engine.state.missiles.size).toBe(0)

    engine.executeCommand(launchCmd)
    expect([...engine.state.missiles.keys()]).toEqual(['m_1'])
  })
})
