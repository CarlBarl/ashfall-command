import { describe, it, expect, vi } from 'vitest'
import { GameEngine } from '../../game-engine'
import { GameLoop } from '../../game-loop'
import { processScheduledLaunches } from '../strike-scheduler'
import type { Nation, NationId, ScheduledLaunch, Unit } from '@/types/game'

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

function makeScenarioUnits(): Unit[] {
  return [
    makeUnit({
      id: 'us_tlam', nation: 'usa', category: 'missile_battery',
      weapons: [{ weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 }],
    }),
    makeUnit({ id: 'ir_base', nation: 'iran', category: 'airbase', position: { lat: 27.6, lng: 52.3 } }),
  ]
}

function initEngine(): GameEngine {
  const engine = new GameEngine()
  const nations = { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }
  engine.initFromData('usa', nations, makeScenarioUnits(), [], {})
  return engine
}

function salvo(count: number, spacingTicks?: number) {
  return { type: 'LAUNCH_SALVO', launcherId: 'us_tlam', weaponId: 'tomahawk', targetId: 'ir_base', count, spacingTicks } as const
}

function ammo(engine: GameEngine): number {
  return engine.state.units.get('us_tlam')!.weapons[0].count
}

// ── Tests ───────────────────────────────────────────────────────

describe('processScheduledLaunches', () => {
  it('fires entries whose dueTick has arrived, keeps future ones, preserves order', () => {
    const engine = initEngine()
    const entry = (dueTick: number): ScheduledLaunch =>
      ({ dueTick, launcherId: 'us_tlam', weaponId: 'tomahawk', targetId: 'ir_base' })
    engine.state.time.tick = 5
    engine.state.scheduledLaunches = [entry(3), entry(7), entry(5)]

    const fired: number[] = []
    processScheduledLaunches(engine.state, (e) => fired.push(e.dueTick))

    expect(fired).toEqual([3, 5])
    expect(engine.state.scheduledLaunches).toEqual([entry(7)])
  })

  it('no-ops when the queue is empty or absent', () => {
    const engine = initEngine()
    const launchFn = vi.fn()
    processScheduledLaunches(engine.state, launchFn)
    engine.state.scheduledLaunches = []
    processScheduledLaunches(engine.state, launchFn)
    expect(launchFn).not.toHaveBeenCalled()
  })
})

describe('LAUNCH_SALVO spacingTicks', () => {
  it('fires the first round immediately and schedules the rest at i*spacing', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 2))

    expect(engine.state.missiles.size).toBe(1)
    expect(engine.state.scheduledLaunches?.map((e) => e.dueTick)).toEqual([2, 4])
    expect(ammo(engine)).toBe(19)

    engine.tick() // tick 1 — nothing due
    expect(engine.state.missiles.size).toBe(1)
    engine.tick() // tick 2 — second round
    expect(engine.state.missiles.size).toBe(2)
    engine.tick() // tick 3
    expect(engine.state.missiles.size).toBe(2)
    engine.tick() // tick 4 — third round
    expect(engine.state.missiles.size).toBe(3)
    expect(engine.state.scheduledLaunches).toEqual([])
    expect(ammo(engine)).toBe(17)
  })

  it('spacing 0 or undefined launches the whole salvo immediately (previous behavior)', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(4))
    expect(engine.state.missiles.size).toBe(4)
    expect(engine.state.scheduledLaunches ?? []).toEqual([])

    engine.executeCommand(salvo(2, 0))
    expect(engine.state.missiles.size).toBe(6)
    expect(engine.state.scheduledLaunches ?? []).toEqual([])
  })

  it('declares war once on the immediate round, not per scheduled round', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 2))
    expect(engine.state.nations.usa.atWar).toContain('iran')
    expect(engine.state.events.filter((e) => e.type === 'WAR_DECLARED').length).toBe(1)

    for (let i = 0; i < 5; i++) engine.tick()
    expect(engine.state.missiles.size).toBe(3)
    expect(engine.state.events.filter((e) => e.type === 'WAR_DECLARED').length).toBe(1)
  })

  it('scheduled rounds never fire while paused — only ticks advance the schedule', () => {
    vi.useFakeTimers()
    try {
      const engine = initEngine()
      const loop = new GameLoop(engine)
      loop.start()

      engine.executeCommand(salvo(2, 2))
      expect(engine.state.missiles.size).toBe(1)

      engine.state.time.speed = 0
      vi.advanceTimersByTime(60_000) // a wall-clock minute while paused
      expect(engine.state.missiles.size).toBe(1)
      expect(engine.state.scheduledLaunches?.length).toBe(1)

      engine.state.time.speed = 1
      vi.advanceTimersByTime(300) // 3 loop steps = 3 ticks ≥ dueTick 2
      expect(engine.state.missiles.size).toBe(2)
      expect(engine.state.scheduledLaunches).toEqual([])

      loop.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('save/load round-trips pending scheduled rounds and they still fire', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 5)) // remaining rounds due at ticks 5 and 10
    engine.tick()

    const loaded = new GameEngine()
    loaded.loadState(engine.getFullStateJson())
    expect(loaded.state.scheduledLaunches?.map((e) => e.dueTick)).toEqual([5, 10])
    expect(loaded.state.missiles.size).toBe(1)

    for (let i = 0; i < 9; i++) loaded.tick() // ticks 2..10
    expect(loaded.state.missiles.size).toBe(3)
    expect(loaded.state.scheduledLaunches).toEqual([])
  })

  it('rolls the leak once per salvo and carries compromised onto scheduled rounds', () => {
    const engine = initEngine()
    engine.state.intel!.leakLevel = 100
    const chance = vi.spyOn(engine.rng, 'chance').mockReturnValue(true)
    engine.executeCommand(salvo(3, 2))
    expect(chance).toHaveBeenCalledTimes(1)
    chance.mockRestore()

    expect(engine.state.scheduledLaunches?.every((e) => e.compromised === true)).toBe(true)

    for (let i = 0; i < 4; i++) engine.tick()
    const missiles = [...engine.state.missiles.values()]
    expect(missiles.length).toBe(3)
    expect(missiles.every((m) => m.compromised === true)).toBe(true)
  })

  it('entries whose launcher is destroyed drain as no-ops without spending ammo', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 2))
    engine.state.units.get('us_tlam')!.status = 'destroyed'

    for (let i = 0; i < 5; i++) engine.tick()
    expect(engine.state.missiles.size).toBe(1)
    expect(engine.state.scheduledLaunches).toEqual([])
    expect(ammo(engine)).toBe(19)
  })

  it('entries whose launcher ran out of ammo drain as no-ops', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 2))
    engine.state.units.get('us_tlam')!.weapons[0].count = 0

    for (let i = 0; i < 5; i++) engine.tick()
    expect(engine.state.missiles.size).toBe(1)
    expect(engine.state.scheduledLaunches).toEqual([])
  })

  it('starting a new scenario clears stale scheduled rounds', () => {
    const engine = initEngine()
    engine.executeCommand(salvo(3, 1000))
    expect(engine.state.scheduledLaunches?.length).toBe(2)

    const nations = { usa: makeNation('usa', 'USA'), iran: makeNation('iran', 'Iran') }
    engine.initFromData('usa', nations, makeScenarioUnits(), [], {})
    expect(engine.state.scheduledLaunches ?? []).toEqual([])
    engine.tick()
    expect(engine.state.missiles.size).toBe(0)
  })
})
