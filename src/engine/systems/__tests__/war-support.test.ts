import { describe, it, expect, beforeEach } from 'vitest'
import {
  processWarSupport,
  resetWarSupportState,
  offerCeasefire,
  acceptCeasefire,
  resign,
  getWarSupport,
  getObjectives,
} from '../war-support'
import type { GameEvent, GameState, NationId, ShippingLane, Unit, UnitCategory } from '@/types/game'

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
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

function hormuz(status: ShippingLane['status']): ShippingLane {
  return {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    path: [[56, 26], [57, 26.5]],
    baseThroughput_mbd: 21,
    currentThroughput_mbd: status === 'open' ? 21 : status === 'reduced' ? 10 : 0,
    suppressionFactor: status === 'open' ? 0 : status === 'reduced' ? 0.5 : 1,
    status,
  }
}

function makeState(units: Unit[], opts: { atWar?: boolean; tick?: number } = {}): GameState {
  const atWar = opts.atWar ?? true
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: opts.tick ?? 0, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 300, reserves_billions: 800, oilPrice_per_barrel: 80 },
        relations: { usa: 100, iran: -60 }, atWar: atWar ? ['iran'] : [],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 50, reserves_billions: 120, oilPrice_per_barrel: 80 },
        relations: { usa: -60, iran: 100 }, atWar: atWar ? ['usa'] : [],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map([['hormuz', hormuz('open')]]),
    events: [],
    pendingEvents: [],
  }
}

function destroyUnit(state: GameState, unitId: string): void {
  const unit = state.units.get(unitId)!
  unit.status = 'destroyed'
  const event: GameEvent = { type: 'UNIT_DESTROYED', unitId, tick: state.time.tick }
  state.events.push(event)
  state.pendingEvents.push(event)
}

/** Advance to the next minute boundary and evaluate */
function evalAt(state: GameState, tick: number): void {
  state.time.tick = tick
  processWarSupport(state)
}

function lossUnit(category: UnitCategory, id: string, nation: NationId): Unit {
  return makeUnit({ id, nation, category })
}

beforeEach(() => {
  resetWarSupportState()
})

describe('war support drains', () => {
  it('drains the victim by category weight when a unit is destroyed', () => {
    const state = makeState([lossUnit('carrier_group', 'cvn', 'usa'), lossUnit('ship', 'boat', 'iran')])
    evalAt(state, 0)
    destroyUnit(state, 'cvn')
    evalAt(state, 60)
    const support = getWarSupport(state)
    expect(support.usa).toBeLessThanOrEqual(88)
    expect(support.iran).toBeGreaterThan(support.usa)
  })

  it('caps kill gains at +10 total', () => {
    const units: Unit[] = [lossUnit('ship', 'us1', 'usa')]
    for (let i = 0; i < 30; i++) units.push(lossUnit('missile_battery', `tel${i}`, 'iran'))
    const state = makeState(units)
    evalAt(state, 0)
    for (let i = 0; i < 30; i++) destroyUnit(state, `tel${i}`)
    evalAt(state, 60)
    expect(getWarSupport(state).usa).toBeGreaterThan(99.9)
    expect(getWarSupport(state).iran).toBeLessThan(60)
  })

  it('drains slowly from war duration alone', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    for (let t = 60; t <= 3600 * 10; t += 60) evalAt(state, t)
    const support = getWarSupport(state)
    expect(support.usa).toBeLessThan(100)
    expect(support.usa).toBeGreaterThan(95)
  })

  it('does not drain at peace', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')], { atWar: false })
    evalAt(state, 0)
    for (let t = 60; t <= 3600; t += 60) evalAt(state, t)
    expect(getWarSupport(state).usa).toBe(100)
  })
})

describe('war termination', () => {
  it('emits WAR_SUPPORT_CRITICAL once when crossing the threshold', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 34
    state.warStatus!.iran.warStartTick = 0
    evalAt(state, 60)
    state.time.tick = 120
    evalAt(state, 120)
    const criticals = state.events.filter(e => e.type === 'WAR_SUPPORT_CRITICAL' && e.nation === 'iran')
    expect(criticals).toHaveLength(1)
  })

  it('capitulation at 0 ends the war, sets gameOver victory for the player, holds fire', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa'), lossUnit('ship', 'ir1', 'iran')])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 0.001
    evalAt(state, 60)
    expect(state.gameOver).toBeTruthy()
    expect(state.gameOver!.outcome).toBe('victory')
    expect(state.gameOver!.loser).toBe('iran')
    expect(state.nations.usa.atWar).toHaveLength(0)
    expect(state.nations.iran.atWar).toHaveLength(0)
    expect(state.units.get('us1')!.roe).toBe('hold_fire')
    expect(state.units.get('ir1')!.roe).toBe('hold_fire')
    expect(state.events.some(e => e.type === 'WAR_ENDED' && e.outcome === 'capitulation')).toBe(true)
  })

  it('freezes war support after the war ends', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 0.001
    evalAt(state, 60)
    const after = getWarSupport(state)
    for (let t = 120; t <= 3600; t += 60) evalAt(state, t)
    expect(getWarSupport(state)).toEqual(after)
  })

  it('resign ends the war as a player defeat', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    resign(state)
    expect(state.gameOver!.outcome).toBe('defeat')
    expect(state.gameOver!.loser).toBe('usa')
  })

  it('includes frozen stats in the gameOver report', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa'), lossUnit('ship', 'ir1', 'iran')])
    evalAt(state, 0)
    destroyUnit(state, 'ir1')
    evalAt(state, 60)
    resign(state)
    const stats = state.gameOver!.stats
    expect(stats.unitsLost.iran).toBe(1)
    expect(stats.unitsLost.usa).toBe(0)
    expect(stats.durationTicks).toBeGreaterThan(0)
  })
})

describe('ceasefire', () => {
  it('AI accepts when its support is lower than the offerer plus margin', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 50
    state.warStatus!.usa.warSupport = 80
    offerCeasefire(state, 'usa', 'iran')
    expect(state.gameOver?.outcome).toBe('ceasefire')
    expect(state.nations.usa.atWar).toHaveLength(0)
  })

  it('rejects when the target is winning, with a re-offer cooldown', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa'), makeUnit({ id: 'tel', nation: 'iran', category: 'missile_battery', weapons: [{ weaponId: 'fateh110', count: 12, maxCount: 12, reloadTimeSec: 60 }] })])
    evalAt(state, 0)
    state.warStatus!.iran.warSupport = 95
    state.warStatus!.usa.warSupport = 40
    offerCeasefire(state, 'usa', 'iran')
    expect(state.gameOver).toBeUndefined()
    expect(state.events.some(e => e.type === 'CEASEFIRE_REJECTED')).toBe(true)

    state.warStatus!.iran.warSupport = 10
    state.time.tick = 120
    offerCeasefire(state, 'usa', 'iran')
    expect(state.gameOver).toBeUndefined()
  })

  it('accepting a standing offer during war produces a ceasefire gameOver', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')])
    evalAt(state, 0)
    acceptCeasefire(state, 'usa', 'iran')
    expect(state.gameOver?.outcome).toBe('ceasefire')
  })

  it('acceptCeasefire at peace is a no-op', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')], { atWar: false })
    acceptCeasefire(state, 'usa', 'iran')
    expect(state.gameOver).toBeUndefined()
  })
})

describe('objectives', () => {
  it('returns empty at peace', () => {
    const state = makeState([lossUnit('ship', 'us1', 'usa')], { atWar: false })
    processWarSupport(state)
    expect(getObjectives(state)).toEqual([])
  })

  it('USA objectives track battery kills', () => {
    const state = makeState([
      lossUnit('carrier_group', 'cvn', 'usa'),
      lossUnit('missile_battery', 'tel1', 'iran'),
      lossUnit('missile_battery', 'tel2', 'iran'),
    ])
    evalAt(state, 0)
    const before = getObjectives(state).find(o => o.id === 'destroy_missile_force')!
    expect(before.progress).toBe(0)

    destroyUnit(state, 'tel1')
    evalAt(state, 60)
    const after = getObjectives(state).find(o => o.id === 'destroy_missile_force')!
    expect(after.progress).toBeCloseTo(0.5)
    const carrier = getObjectives(state).find(o => o.id === 'preserve_carrier')!
    expect(carrier.status).toBe('good')
  })

  it('freezes objectives once the war is decided', () => {
    const state = makeState([
      lossUnit('carrier_group', 'cvn', 'usa'),
      lossUnit('missile_battery', 'tel1', 'iran'),
    ])
    evalAt(state, 0)
    resign(state)
    const frozen = getObjectives(state)
    destroyUnit(state, 'tel1')
    evalAt(state, 120)
    expect(getObjectives(state)).toEqual(frozen)
  })
})
