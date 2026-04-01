/**
 * Attack Planner — AD-aware missile allocation algorithm.
 *
 * Pure function: takes a game-state snapshot (ViewUnit[]) and returns
 * an optimised AttackPlan.  Runs on the main thread so the UI panel
 * can call it synchronously whenever draft priorities change.
 */

import type { ViewUnit } from '@/types/view'
import type { WeaponLoadout, UnitCategory, WeaponId } from '@/types/game'
import type {
  AttackPriority,
  AttackPlan,
  TimingMode,
  PlannedStrike,
  AttackPlanSummary,
} from '@/types/attack-plan'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { haversine } from './utils/geo'

// Mach 1 at sea-level in km/s
const MACH_KMS = 1235 / 3600

// ────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────

/** Weapon types considered offensive (non-SAM) */
const OFFENSIVE_TYPES = new Set(['cruise_missile', 'ballistic_missile', 'ashm'])

function isOffensiveWeapon(wl: WeaponLoadout): boolean {
  const spec = weaponSpecs[wl.weaponId]
  return !!spec && OFFENSIVE_TYPES.has(spec.type)
}

function isSAMWeapon(wl: WeaponLoadout): boolean {
  const spec = weaponSpecs[wl.weaponId]
  return !!spec && spec.type === 'sam'
}

/** Find the AD system spec that uses a given interceptor */
function adSystemForInterceptor(interceptorId: WeaponId) {
  return Object.values(adSystems).find((s) => s.interceptorId === interceptorId)
}

/**
 * AD multiplier: how many missiles we need per target given nearby SAM coverage.
 *
 * Looks at all alive enemy SAM sites within 200 km of the target, sums their
 * fire channels, and returns a saturation factor capped at 4.
 */
function adMultiplier(target: ViewUnit, enemyUnits: ViewUnit[]): number {
  let totalFireChannels = 0

  for (const eu of enemyUnits) {
    if (eu.category !== 'sam_site' || eu.status === 'destroyed') continue

    const dist = haversine(eu.position, target.position)
    if (dist > 200) continue

    // Sum fire channels from each SAM weapon loadout on this unit
    for (const wl of eu.weapons) {
      if (!isSAMWeapon(wl) || wl.count === 0) continue
      const ad = adSystemForInterceptor(wl.weaponId)
      if (ad) {
        totalFireChannels += ad.fire_channels
      }
    }
  }

  if (totalFireChannels === 0) return 1.0
  const saturationFactor = 1.0 + totalFireChannels * 0.15
  return Math.min(4.0, saturationFactor)
}

/**
 * Compute missiles needed for a target given severity.
 */
function missilesNeeded(
  severity: 'surgical' | 'standard' | 'overwhelming',
  target: ViewUnit,
  enemyUnits: ViewUnit[],
): number {
  switch (severity) {
    case 'surgical':
      return 1
    case 'standard':
      return Math.ceil(adMultiplier(target, enemyUnits))
    case 'overwhelming':
      return Math.ceil(2 * adMultiplier(target, enemyUnits))
  }
}

/**
 * Does a weapon loadout match the requested weapon preference?
 */
function matchesWeaponPref(wl: WeaponLoadout, pref: WeaponId[] | 'any'): boolean {
  if (pref === 'any') return isOffensiveWeapon(wl)
  return pref.includes(wl.weaponId)
}

/**
 * Does a launcher's category match the requested launcher preference?
 */
function matchesLauncherPref(unit: ViewUnit, pref: UnitCategory[] | 'any'): boolean {
  if (pref === 'any') return true
  return pref.includes(unit.category)
}

// ────────────────────────────────────────────────
//  Mutable ammo tracker (lives only during one computeAttackPlan call)
// ────────────────────────────────────────────────

type AmmoMap = Map<string, Map<string, number>> // unitId → weaponId → remaining

function buildAmmoMap(units: ViewUnit[]): AmmoMap {
  const m: AmmoMap = new Map()
  for (const u of units) {
    const wm = new Map<string, number>()
    for (const wl of u.weapons) {
      wm.set(wl.weaponId, wl.count)
    }
    m.set(u.id, wm)
  }
  return m
}

function getAmmo(ammo: AmmoMap, unitId: string, weaponId: string): number {
  return ammo.get(unitId)?.get(weaponId) ?? 0
}

function consumeAmmo(ammo: AmmoMap, unitId: string, weaponId: string, qty: number) {
  const wm = ammo.get(unitId)
  if (!wm) return
  const cur = wm.get(weaponId) ?? 0
  wm.set(weaponId, Math.max(0, cur - qty))
}

// ────────────────────────────────────────────────
//  Candidate launchers for a target
// ────────────────────────────────────────────────

interface LauncherCandidate {
  unit: ViewUnit
  wl: WeaponLoadout
  distanceKm: number
  inRange: boolean
  flightTimeSec: number
}

function findCandidates(
  target: ViewUnit,
  friendlyUnits: ViewUnit[],
  ammo: AmmoMap,
  weaponPref: WeaponId[] | 'any',
  launcherPref: UnitCategory[] | 'any',
): LauncherCandidate[] {
  const candidates: LauncherCandidate[] = []

  for (const fu of friendlyUnits) {
    if (fu.status === 'destroyed') continue
    if (!matchesLauncherPref(fu, launcherPref)) continue

    for (const wl of fu.weapons) {
      if (!matchesWeaponPref(wl, weaponPref)) continue
      const avail = getAmmo(ammo, fu.id, wl.weaponId)
      if (avail <= 0) continue

      const spec = weaponSpecs[wl.weaponId]
      if (!spec) continue

      const dist = haversine(fu.position, target.position)
      const inRange = dist <= spec.range_km
      const flightTimeSec = spec.speed_mach > 0 ? dist / (spec.speed_mach * MACH_KMS) : Infinity

      candidates.push({ unit: fu, wl, distanceKm: dist, inRange, flightTimeSec })
    }
  }

  // Sort by distance ascending (closest first — shortest flight time)
  candidates.sort((a, b) => a.distanceKm - b.distanceKm)
  return candidates
}

// ────────────────────────────────────────────────
//  Core algorithm
// ────────────────────────────────────────────────

export function computeAttackPlan(
  priorities: AttackPriority[],
  timing: TimingMode,
  friendlyUnits: ViewUnit[],
  enemyUnits: ViewUnit[],
  planName: string,
): AttackPlan {
  const strikes: PlannedStrike[] = []
  const warnings: string[] = []
  const ammo = buildAmmoMap(friendlyUnits)

  // Track which targets are already covered (for SEAD de-dup)
  const seadTargetIds = new Set<string>()
  // Track total missiles needed and allocated per weapon type
  const weaponNeeded: Record<string, number> = {}
  // Track target coverage per category
  const targetedIds = new Set<string>()

  for (let tier = 0; tier < priorities.length; tier++) {
    const p = priorities[tier]

    // Step 1: find alive enemy targets matching this category
    const targets = enemyUnits.filter(
      (eu) => eu.category === p.targetCategory && eu.status !== 'destroyed',
    )

    // Step 2: SEAD — if seadFirst, pre-insert strikes against nearby SAM sites
    if (p.seadFirst) {
      const samSites = enemyUnits.filter(
        (eu) => eu.category === 'sam_site' && eu.status !== 'destroyed',
      )

      for (const target of targets) {
        for (const sam of samSites) {
          if (seadTargetIds.has(sam.id)) continue
          // Check if this SAM's engagement range overlaps the target
          const samToTarget = haversine(sam.position, target.position)
          // Use the longest-range interceptor on this SAM for the engagement envelope
          let maxEngRange = 0
          for (const wl of sam.weapons) {
            if (isSAMWeapon(wl) && wl.count > 0) {
              const ad = adSystemForInterceptor(wl.weaponId)
              if (ad && ad.engagement_range_km > maxEngRange) {
                maxEngRange = ad.engagement_range_km
              }
            }
          }
          if (maxEngRange === 0 || samToTarget > maxEngRange) continue

          // This SAM threatens targets in this tier — allocate SEAD strikes
          seadTargetIds.add(sam.id)
          const needed = missilesNeeded('standard', sam, enemyUnits)
          const candidates = findCandidates(sam, friendlyUnits, ammo, p.weaponPreference, p.launcherPreference)

          let allocated = 0
          for (const c of candidates) {
            if (allocated >= needed) break
            if (!c.inRange) continue
            const avail = getAmmo(ammo, c.unit.id, c.wl.weaponId)
            const take = Math.min(needed - allocated, avail)
            if (take <= 0) continue

            const spec = weaponSpecs[c.wl.weaponId]

            strikes.push({
              launcherId: c.unit.id,
              launcherName: c.unit.name,
              weaponId: c.wl.weaponId,
              weaponName: spec?.name ?? c.wl.weaponId,
              targetId: sam.id,
              targetName: sam.name,
              targetCategory: sam.category,
              count: take,
              inRange: true,
              distanceKm: Math.round(c.distanceKm),
              flightTimeSec: Math.round(c.flightTimeSec),
              priorityTier: tier,
            })

            consumeAmmo(ammo, c.unit.id, c.wl.weaponId, take)
            allocated += take
            weaponNeeded[c.wl.weaponId] = (weaponNeeded[c.wl.weaponId] ?? 0) + take
            targetedIds.add(sam.id)
          }

          if (allocated < needed) {
            warnings.push(
              `SEAD: insufficient ammo for ${sam.name} (need ${needed}, allocated ${allocated})`,
            )
          }
        }
      }
    }

    // Steps 3-4: allocate strikes against primary targets
    for (const target of targets) {
      const needed = missilesNeeded(p.severity, target, enemyUnits)
      const candidates = findCandidates(target, friendlyUnits, ammo, p.weaponPreference, p.launcherPreference)

      let allocated = 0
      let anyOutOfRange = false

      for (const c of candidates) {
        if (allocated >= needed) break
        if (!c.inRange) {
          anyOutOfRange = true
          continue
        }
        const avail = getAmmo(ammo, c.unit.id, c.wl.weaponId)
        const take = Math.min(needed - allocated, avail)
        if (take <= 0) continue

        const spec = weaponSpecs[c.wl.weaponId]

        strikes.push({
          launcherId: c.unit.id,
          launcherName: c.unit.name,
          weaponId: c.wl.weaponId,
          weaponName: spec?.name ?? c.wl.weaponId,
          targetId: target.id,
          targetName: target.name,
          targetCategory: target.category,
          count: take,
          inRange: true,
          distanceKm: Math.round(c.distanceKm),
          flightTimeSec: Math.round(c.flightTimeSec),
          priorityTier: tier,
        })

        consumeAmmo(ammo, c.unit.id, c.wl.weaponId, take)
        allocated += take
        weaponNeeded[c.wl.weaponId] = (weaponNeeded[c.wl.weaponId] ?? 0) + take
        targetedIds.add(target.id)
      }

      if (allocated < needed && anyOutOfRange) {
        warnings.push(`${target.name}: launchers exist but out of range`)
      }
      if (allocated < needed && !anyOutOfRange && candidates.length > 0) {
        warnings.push(
          `${target.name}: insufficient ammo (need ${needed}, allocated ${allocated})`,
        )
      }
      if (candidates.length === 0) {
        warnings.push(`${target.name}: no compatible launchers available`)
      }
    }
  }

  // Step 5: build summary
  const summary = buildSummary(
    strikes,
    friendlyUnits,
    enemyUnits,
    priorities,
    weaponNeeded,
    targetedIds,
    warnings,
  )

  return {
    name: planName,
    priorities,
    timing,
    strikes,
    summary,
  }
}

// ────────────────────────────────────────────────
//  Summary builder
// ────────────────────────────────────────────────

function buildSummary(
  strikes: PlannedStrike[],
  friendlyUnits: ViewUnit[],
  enemyUnits: ViewUnit[],
  priorities: AttackPriority[],
  weaponNeeded: Record<string, number>,
  targetedIds: Set<string>,
  warnings: string[],
): AttackPlanSummary {
  // Total missiles
  const totalMissiles = strikes.reduce((sum, s) => sum + s.count, 0)

  // Unique targets
  const uniqueTargets = new Set(strikes.map((s) => s.targetId))
  const totalTargets = uniqueTargets.size

  // Weapon budget: needed vs available across all friendly units
  const weaponBudget: Record<string, { needed: number; available: number }> = {}
  // Tally available from friendlies
  for (const fu of friendlyUnits) {
    for (const wl of fu.weapons) {
      if (!isOffensiveWeapon(wl)) continue
      const spec = weaponSpecs[wl.weaponId]
      const key = spec?.name ?? wl.weaponId
      if (!weaponBudget[key]) weaponBudget[key] = { needed: 0, available: 0 }
      weaponBudget[key].available += wl.count
    }
  }
  // Tally needed from computed allocation
  for (const [weaponId, count] of Object.entries(weaponNeeded)) {
    const spec = weaponSpecs[weaponId]
    const key = spec?.name ?? weaponId
    if (!weaponBudget[key]) weaponBudget[key] = { needed: 0, available: 0 }
    weaponBudget[key].needed += count
  }

  // Target coverage per category from priorities
  const targetCoverage: Record<string, { targeted: number; total: number }> = {}
  const categoriesInPlan = new Set(priorities.map((p) => p.targetCategory))
  for (const cat of categoriesInPlan) {
    const allInCat = enemyUnits.filter(
      (eu) => eu.category === cat && eu.status !== 'destroyed',
    )
    const coveredInCat = allInCat.filter((eu) => targetedIds.has(eu.id))
    targetCoverage[cat] = { targeted: coveredInCat.length, total: allInCat.length }
  }

  // Estimated penetration: rough model
  // For each targeted enemy, figure out how many SAM fire channels cover it,
  // then estimate what fraction of our missiles get through.
  let totalAllocated = 0
  let expectedPenetrating = 0

  for (const targetId of uniqueTargets) {
    const target = enemyUnits.find((eu) => eu.id === targetId)
    if (!target) continue

    const strikesForTarget = strikes.filter((s) => s.targetId === targetId)
    const missilesAtTarget = strikesForTarget.reduce((sum, s) => sum + s.count, 0)
    totalAllocated += missilesAtTarget

    // AD fire channels near this target
    const adMult = adMultiplier(target, enemyUnits)
    // Penetration estimate: missiles / adMult gives expected kills of ~1 per adMult missiles
    // Simple model: penetration rate = 1 / adMult (each missile has 1/adMult chance)
    // But with saturation: if we send more than adMult, extras get through at higher rate
    const basePk = 1.0 / adMult
    // Binomial-ish: expected penetrating = missiles * basePk, but floor at 1 if we sent enough
    const expectedThrough = Math.min(missilesAtTarget, missilesAtTarget * basePk + 0.5)
    expectedPenetrating += expectedThrough
  }

  const estimatedPenetration = totalAllocated > 0 ? expectedPenetrating / totalAllocated : 0
  const estimatedKills = Math.min(totalTargets, Math.floor(expectedPenetrating))

  // AD warning
  const heavyADTargets = enemyUnits.filter((eu) => {
    if (eu.status === 'destroyed') return false
    return adMultiplier(eu, enemyUnits) >= 2.5
  })
  if (heavyADTargets.length > 0 && !priorities.some((p) => p.seadFirst)) {
    warnings.push(
      `Heavy AD coverage over ${heavyADTargets.length} target(s) — consider enabling SEAD`,
    )
  }

  return {
    totalMissiles,
    totalTargets,
    weaponBudget,
    targetCoverage,
    estimatedPenetration: Math.round(estimatedPenetration * 100) / 100,
    estimatedKills,
    warnings,
  }
}
