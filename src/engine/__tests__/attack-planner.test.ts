import { describe, it, expect } from 'vitest'
import { computeAttackPlan } from '../attack-planner'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import type { Unit } from '@/types/game'
import type { ViewUnit } from '@/types/view'
import type { AttackPriority } from '@/types/attack-plan'

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
