import { describe, it, expect } from 'vitest'
import {
  computeAttackPlan,
  computeTotSchedule,
  estimateLeakers,
  TOT_PAD_TICKS,
  TOT_RIPPLE_TICKS,
  AD_ENGAGEMENT_CYCLE_SEC,
} from '../attack-planner'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import type { Unit } from '@/types/game'
import type { ViewUnit } from '@/types/view'
import type { AttackPriority, AttackPlan, PlannedStrike } from '@/types/attack-plan'

// Mirrors game-engine.ts toViewUnit — the planner consumes worker snapshots
function toViewUnit(u: Unit): ViewUnit {
  return {
    id: u.id,
    name: u.name,
    nation: u.nation,
    category: u.category,
    position: { ...u.position },
    heading: u.heading,
    speed_kts: u.speed_kts,
    status: u.status,
    health: u.health,
    maxHealth: u.maxHealth,
    logistics: u.logistics,
    supplyStocks: u.supplyStocks.map(s => ({ ...s })),
    weapons: u.weapons.map(w => ({ ...w })),
    pointDefense: u.pointDefense.map(pd => ({ ...pd })),
    sensors: u.sensors.map(s => ({ ...s })),
    roe: u.roe,
    waypoints: u.waypoints.map(w => ({ ...w })),
    parentId: u.parentId,
    subordinateIds: [...u.subordinateIds],
    readiness: u.readiness,
    readinessTimer: u.readinessTimer,
    radius_km: u.radius_km,
    mine_count: u.mine_count,
    droneMission: u.droneMission,
    visibility: 'identified',
    stale: false,
  }
}

// Mirrors StrikePanel handleAddPriority defaults
function priority(targetCategory: AttackPriority['targetCategory'], id = `p_${targetCategory}`): AttackPriority {
  return {
    id,
    targetCategory,
    severity: 'standard',
    seadFirst: targetCategory !== 'sam_site',
    weaponPreference: 'any',
    launcherPreference: 'any',
  }
}

describe('computeAttackPlan on the real USA/Iran scenario', () => {
  const friendly = usaUnits.map(toViewUnit)
  const enemy = iranUnits.map(toViewUnit)

  it('default USA force allocates >0 missiles against Bandar Abbas-area airbase', () => {
    const plan = computeAttackPlan([priority('airbase')], 'simultaneous', friendly, enemy, 'Test Plan')

    expect(plan.summary.totalMissiles).toBeGreaterThan(0)

    const bandarStrikes = plan.strikes.filter(s => s.targetId === 'bandar_abbas_ab')
    expect(bandarStrikes.length).toBeGreaterThan(0)
    expect(bandarStrikes.every(s => s.inRange)).toBe(true)
    expect(plan.summary.warnings).not.toContain('Bandar Abbas Air Base: launchers exist but out of range')
  })

  it('weapon budget shows real Tomahawk and JASSM-ER availability', () => {
    const plan = computeAttackPlan([priority('airbase')], 'simultaneous', friendly, enemy, 'Test Plan')

    // 60 (CVN-72) + 20 + 20 + 45 (DDGs) + 12 (SSN) = 157
    expect(plan.summary.weaponBudget['BGM-109 Tomahawk']?.available).toBe(157)
    // 96 + 48 + 64 + 32 + 48 + 80 = 368 across airbases
    expect(plan.summary.weaponBudget['AGM-158B JASSM-ER']?.available).toBe(368)
  })

  it('SEAD pre-strikes against Bandar Abbas SAM coverage get ammo allocated', () => {
    const plan = computeAttackPlan(
      [priority('missile_battery')], 'simultaneous', friendly, enemy, 'Test Plan',
    )

    const seadStrikes = plan.strikes.filter(s => s.targetId === 'khordad_bandar')
    expect(seadStrikes.length).toBeGreaterThan(0)
    expect(plan.summary.warnings.filter(w => w.includes('allocated 0'))).toEqual([])
  })

  it('does not allocate from launchers that cannot fire (packing/moving/deploying)', () => {
    const packedFriendly = friendly.map(u => ({
      ...u,
      readiness: u.weapons.some(w => w.weaponId === 'jassm_er') ? ('packing' as const) : u.readiness,
    }))
    const plan = computeAttackPlan([priority('airbase')], 'simultaneous', packedFriendly, enemy, 'Test Plan')

    expect(plan.strikes.some(s => s.weaponId === 'jassm_er')).toBe(false)
    // Tomahawk shooters (ships, no readiness lifecycle) still cover the targets
    expect(plan.summary.totalMissiles).toBeGreaterThan(0)
  })

  it('drained theater (live-bug signature): SEAD warnings say out of range, not insufficient ammo', () => {
    // Reproduces the playtest state: every in-range launcher fired dry by the
    // weapons-free auto-fire AI; only Diego Garcia (~3900 km out) still has JASSM.
    const drained = friendly.map(u => ({
      ...u,
      weapons: u.weapons.map(w => (u.id === 'diego_garcia' ? { ...w } : { ...w, count: 0 })),
    }))
    const plan = computeAttackPlan([priority('missile_battery')], 'simultaneous', drained, enemy, 'Test Plan')

    expect(plan.summary.totalMissiles).toBe(0)
    expect(plan.summary.weaponBudget['BGM-109 Tomahawk']?.available).toBe(0)
    expect(plan.summary.weaponBudget['AGM-158B JASSM-ER']?.available).toBe(80)

    const seadWarnings = plan.summary.warnings.filter(w => w.startsWith('SEAD:'))
    expect(seadWarnings.length).toBeGreaterThan(0)
    expect(seadWarnings.every(w => w.includes('out of range'))).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
//  TOT scheduling + leaker estimate
// ════════════════════════════════════════════════════════════════

function plannedStrike(over: Partial<PlannedStrike> & { flightTimeSec: number }): PlannedStrike {
  return {
    launcherId: 'l1',
    launcherName: 'Launcher 1',
    weaponId: 'tomahawk',
    weaponName: 'BGM-109 Tomahawk',
    targetId: 't1',
    targetName: 'Target 1',
    targetCategory: 'airbase',
    count: 1,
    inRange: true,
    distanceKm: 100,
    priorityTier: 0,
    ...over,
  }
}

function planOf(strikes: PlannedStrike[]): AttackPlan {
  return {
    name: 'TOT Test',
    priorities: [],
    timing: 'simultaneous',
    strikes,
    summary: {
      totalMissiles: strikes.reduce((s, st) => s + st.count, 0),
      totalTargets: new Set(strikes.map(s => s.targetId)).size,
      weaponBudget: {},
      targetCoverage: {},
      estimatedPenetration: 1,
      estimatedKills: 0,
      warnings: [],
    },
  }
}

function vu(over: Partial<ViewUnit> & { id: string; category: ViewUnit['category'] }): ViewUnit {
  return {
    name: over.id,
    nation: 'iran',
    position: { lat: 27, lng: 52 },
    heading: 0,
    speed_kts: 0,
    status: 'ready',
    health: 100,
    maxHealth: 100,
    logistics: 100,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_tight',
    waypoints: [],
    subordinateIds: [],
    visibility: 'identified',
    stale: false,
    ...over,
  } as ViewUnit
}

describe('computeTotSchedule', () => {
  it('schedules different flight times to impact within ±2 ticks of one TOT', () => {
    const now = 1000
    const strikes = [
      plannedStrike({ launcherId: 'cruise', flightTimeSec: 2333.4 }),
      plannedStrike({ launcherId: 'ballistic', flightTimeSec: 250 }),
      plannedStrike({ launcherId: 'fast', flightTimeSec: 66.6 }),
    ]
    const schedule = computeTotSchedule(planOf(strikes), now)

    expect(schedule.totTick).toBe(now + Math.ceil(2333.4) + TOT_PAD_TICKS)

    for (const e of schedule.entries) {
      const impactTick = e.dueTick + (e.count - 1) * TOT_RIPPLE_TICKS + Math.ceil(e.flightTimeSec)
      expect(Math.abs(impactTick - schedule.totTick)).toBeLessThanOrEqual(2)
    }

    // Longest flight launches first; the derived schedule is sorted by dueTick
    expect(schedule.entries[0].launcherId).toBe('cruise')
    expect(schedule.earliestLaunchTick).toBe(schedule.entries[0].dueTick)
    expect(schedule.earliestLaunchTick).toBe(now + TOT_PAD_TICKS)
  })

  it('ripples multi-round rows 1 tick per round so the last round lands on TOT', () => {
    const now = 0
    const schedule = computeTotSchedule(planOf([
      plannedStrike({ flightTimeSec: 300, count: 4 }),
    ]), now)

    const e = schedule.entries[0]
    expect(e.dueTick).toBe(schedule.totTick - 300 - 3 * TOT_RIPPLE_TICKS)
    // Round j launches at dueTick + j and impacts at totTick - 3 + j
    for (let j = 0; j < e.count; j++) {
      const impact = e.dueTick + j * TOT_RIPPLE_TICKS + Math.ceil(e.flightTimeSec)
      expect(impact).toBeGreaterThanOrEqual(schedule.totTick - 3)
      expect(impact).toBeLessThanOrEqual(schedule.totTick)
    }
  })

  it('never schedules a launch at or before nowTick', () => {
    const now = 50
    const schedule = computeTotSchedule(planOf([
      plannedStrike({ flightTimeSec: 10, count: 100 }), // ripple longer than pad
    ]), now)
    expect(schedule.entries[0].dueTick).toBeGreaterThan(now)
  })

  it('skips out-of-range and unreachable (Infinity flight time) strikes', () => {
    const schedule = computeTotSchedule(planOf([
      plannedStrike({ launcherId: 'ok', flightTimeSec: 100 }),
      plannedStrike({ launcherId: 'far', flightTimeSec: 500, inRange: false }),
      plannedStrike({ launcherId: 'dead', flightTimeSec: Infinity }),
    ]), 0)

    expect(schedule.entries.map(e => e.launcherId)).toEqual(['ok'])
    expect(schedule.totTick).toBe(100 + TOT_PAD_TICKS)
  })

  it('returns an empty schedule for a plan with no executable strikes', () => {
    const schedule = computeTotSchedule(planOf([]), 10)
    expect(schedule.entries).toEqual([])
    expect(schedule.totTick).toBe(10 + TOT_PAD_TICKS)
    expect(schedule.earliestLaunchTick).toBe(schedule.totTick)
  })
})

describe('estimateLeakers', () => {
  // 3rd Khordad battery: 4 fire channels (air-defense.ts), interceptor khordad15_int
  const samSite = vu({
    id: 'sam1',
    category: 'sam_site',
    weapons: [{ weaponId: 'khordad15_int', count: 8, maxCount: 16, reloadTimeSec: 480 }],
  })
  const airbase = vu({ id: 'ab1', category: 'airbase' })
  const tenAtAirbase = [plannedStrike({ targetId: 'ab1', count: 10, flightTimeSec: 300 })]

  it('compressed TOT window gives AD one engagement cycle: channels × 1 intercepts', () => {
    const leakers = estimateLeakers(tenAtAirbase, [samSite, airbase], 0)
    expect(leakers).toBe(10 - 4)
  })

  it('a spread impact window multiplies engagement cycles and kills the raid', () => {
    const windowSec = 20 * AD_ENGAGEMENT_CYCLE_SEC // 21 cycles × 4 channels = 84 ≥ 10
    expect(estimateLeakers(tenAtAirbase, [samSite, airbase], windowSec)).toBe(0)
  })

  it('undefended target leaks everything; out-of-range strikes are ignored', () => {
    expect(estimateLeakers(tenAtAirbase, [airbase], 0)).toBe(10)
    const oor = [plannedStrike({ targetId: 'ab1', count: 10, inRange: false, flightTimeSec: 300 })]
    expect(estimateLeakers(oor, [samSite, airbase], 0)).toBe(0)
  })

  it('SAM sites farther than 200 km contribute no fire channels', () => {
    const farSam = vu({
      id: 'sam_far',
      category: 'sam_site',
      position: { lat: 27, lng: 55 }, // ~297 km from the airbase at lng 52
      weapons: [{ weaponId: 'khordad15_int', count: 8, maxCount: 16, reloadTimeSec: 480 }],
    })
    expect(estimateLeakers(tenAtAirbase, [farSam, airbase], 0)).toBe(10)
  })
})
