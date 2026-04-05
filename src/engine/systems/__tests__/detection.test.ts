import { describe, it, expect } from 'vitest'
import { detectThreats } from '../detection'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 25, lng: 51 },
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
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeMissile(overrides: Partial<Missile> & { id: string; nation: NationId }): Missile {
  return {
    weaponId: 'test_missile',
    launcherId: 'launcher_1',
    targetId: 'target_1',
    path: [[51, 25], [51.5, 25.5]],
    timestamps: [1000, 2000],
    status: 'inflight',
    launchTime: 1000,
    eta: 2000,
    altitude_m: 10000,
    phase: 'cruise',
    speed_current_mach: 0.8,
    fuel_remaining_sec: 300,
    is_interceptor: false,
    ...overrides,
  } as Missile
}

function makeState(units: Unit[], missiles: Missile[] = []): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  const missileMap = new Map(missiles.map(m => [m.id, m]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: 1500, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: unitMap,
    missiles: missileMap,
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('detectThreats', () => {
  it('returns empty array when no missiles exist', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const state = makeState([sam])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('returns empty array when unit has no sensors', () => {
    const sam = makeUnit({
      id: 'no_sensors',
      nation: 'usa',
      sensors: [],
    })
    const missile = makeMissile({
      id: 'missile_1',
      nation: 'iran',
      path: [[51, 25], [51.1, 25.1]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('returns empty array when unit has no radar sensors', () => {
    const sam = makeUnit({
      id: 'irst_only',
      nation: 'usa',
      sensors: [{ type: 'irst', range_km: 50, detection_prob: 0.7 }],
    })
    const missile = makeMissile({
      id: 'missile_1',
      nation: 'iran',
      path: [[51, 25], [51.1, 25.1]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('does not detect friendly missiles', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    // Friendly missile — same nation
    const missile = makeMissile({
      id: 'friendly_missile',
      nation: 'usa',
      path: [[51, 25], [51.05, 25.05]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('does not detect missiles that are not inflight', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const missile = makeMissile({
      id: 'impacted_missile',
      nation: 'iran',
      status: 'impact',
      path: [[51, 25], [51.05, 25.05]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('detects enemy missile within radar range', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    // Missile very close — path interpolates near the SAM at timestamp 1500
    const missile = makeMissile({
      id: 'enemy_cruise',
      nation: 'iran',
      path: [[51, 25], [51.1, 25.1]],
      timestamps: [1000, 2000],
      eta: 2000,
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats.length).toBeGreaterThanOrEqual(1)
    expect(threats[0].missile.id).toBe('enemy_cruise')
    expect(threats[0].distKm).toBeGreaterThan(0)
  })

  it('does not detect enemy missile beyond radar range', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 10, detection_prob: 0.95 }],  // very short range
    })
    // Missile far away (~550km away)
    const missile = makeMissile({
      id: 'far_missile',
      nation: 'iran',
      path: [[56, 30], [56.1, 30.1]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('sorts threats by time to impact (most urgent first)', () => {
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.95 }],
    })
    // Missile 1 — impacts later
    const missile1 = makeMissile({
      id: 'slow_missile',
      nation: 'iran',
      path: [[51, 25], [51.05, 25.05]],
      timestamps: [1000, 2000],
      eta: 5000,
    })
    // Missile 2 — impacts sooner
    const missile2 = makeMissile({
      id: 'fast_missile',
      nation: 'iran',
      path: [[51.1, 25.1], [51.05, 25.05]],
      timestamps: [1000, 2000],
      eta: 2000,
    })
    const state = makeState([sam], [missile1, missile2])
    const threats = detectThreats(state, sam)
    expect(threats.length).toBe(2)
    // fast_missile has eta 2000, timestamp 1500 => timeToImpact 500
    // slow_missile has eta 5000, timestamp 1500 => timeToImpact 3500
    expect(threats[0].missile.id).toBe('fast_missile')
    expect(threats[1].missile.id).toBe('slow_missile')
  })

  it('skips targets outside radar sector arc', () => {
    // SAM facing north (heading=0) with 90-degree sector
    const sam = makeUnit({
      id: 'sector_sam',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      heading: 0,  // facing north
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.95, sector_deg: 90 }],
    })
    // Missile approaching from the south (bearing ~180 from the SAM)
    // SAM faces north with 90deg arc => covers 315-45 degrees
    // Missile at lat=24 is south => bearing ~180 => outside sector
    const missile = makeMissile({
      id: 'behind_missile',
      nation: 'iran',
      path: [[51, 24], [51, 24.5]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats).toHaveLength(0)
  })

  it('detects target inside radar sector arc', () => {
    // SAM facing north (heading=0) with 90-degree sector
    const sam = makeUnit({
      id: 'sector_sam',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      heading: 0,  // facing north
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.95, sector_deg: 90 }],
    })
    // Missile to the north of SAM => bearing ~0 => inside sector
    const missile = makeMissile({
      id: 'front_missile',
      nation: 'iran',
      path: [[51, 26], [51, 25.5]],
      timestamps: [1000, 2000],
    })
    const state = makeState([sam], [missile])
    const threats = detectThreats(state, sam)
    expect(threats.length).toBeGreaterThanOrEqual(1)
  })
})
