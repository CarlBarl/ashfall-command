import type { GameState, GameEvent, Missile, Unit, WeaponSpec, ADSystemSpec } from '@/types/game'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { haversine, bearing, destination } from '../utils/geo'
import { greatCirclePath, machToKmh } from '../utils/geo'
import { detectThreats } from './detection'
import { isSuppressedForTight } from './orders'

let missileCounter = 0
let interceptorCounter = 0

// Track active fire channels per AD system per unit: `${unitId}:${adSystemId}` -> Set<missileId>
const activeEngagements = new Map<string, Set<string>>()

/** Reset module-level state — must be called on save/load */
export function resetCombatState(): void {
  missileCounter = 0
  interceptorCounter = 0
  activeEngagements.clear()
}

export function processCombat(state: GameState, rng: SeededRNG): void {
  updateMissileFuel(state)
  updateMissileSpeed(state)
  updateMissileAltitudes(state)
  updateMissilePositions(state)
  runADEngagement(state, rng)
  updateInterceptors(state, rng)
  resolveImpacts(state)
  updateReloads(state)
}

// ===============================================
//  FUEL MODEL
// ===============================================

function updateMissileFuel(state: GameState): void {
  const toRemove: string[] = []

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue

    const spec = weaponSpecs[missile.weaponId]
    if (!spec) continue

    if (missile.fuel_remaining_sec > 0) {
      missile.fuel_remaining_sec = Math.max(0, missile.fuel_remaining_sec - 1)
    }

    if (missile.fuel_remaining_sec <= 0) {
      if (missile.is_interceptor) {
        // Interceptors with no fuel have missed their target
        toRemove.push(missile.id)
      } else if (spec.type === 'cruise_missile' || spec.type === 'ashm' || spec.type === 'loitering_munition') {
        // Cruise missiles: speed decays and altitude drops (handled in speed/altitude updates)
        // If altitude has reached 0 or below, crash
        if (missile.altitude_m <= 0) {
          toRemove.push(missile.id)
        }
      }
      // Ballistic missiles: fuel only matters in boost phase, midcourse/terminal are unpowered
    }
  }

  for (const id of toRemove) {
    state.missiles.delete(id)
  }
}

// ===============================================
//  SPEED MODEL
// ===============================================

function updateMissileSpeed(state: GameState): void {
  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue

    const spec = weaponSpecs[missile.weaponId]
    if (!spec) continue

    if (missile.is_interceptor) {
      // Interceptors fly at spec speed while they have fuel
      if (missile.fuel_remaining_sec > 0) {
        missile.speed_current_mach = spec.speed_mach
      }
      // If fuel is out, interceptor will be removed by updateMissileFuel
      continue
    }

    if (spec.type === 'ballistic_missile') {
      const flightDuration = missile.eta - missile.launchTime
      const elapsed = state.time.timestamp - missile.launchTime
      const progress = Math.max(0, Math.min(1, elapsed / flightDuration))

      if (progress < 0.15) {
        // Boost phase: ramp from 0 to spec speed
        const boostProgress = progress / 0.15
        missile.speed_current_mach = spec.speed_mach * boostProgress
      } else if (progress < 0.7) {
        // Midcourse: exoatmospheric — negligible drag, maintain burnout speed
        missile.speed_current_mach = spec.speed_mach
      } else {
        // Terminal: gravity accelerates reentry vehicle substantially
        // Real BMs gain ~50-70% speed during reentry (e.g. Mach 7 → Mach 10-12)
        const terminalProgress = (progress - 0.7) / 0.3
        missile.speed_current_mach *= (1 + 0.005 * terminalProgress)
      }
    } else {
      // Cruise missiles and ASHMs
      if (missile.fuel_remaining_sec > 0) {
        missile.speed_current_mach = spec.speed_mach
      } else {
        // Out of fuel: speed decays 5% per second
        missile.speed_current_mach *= 0.95
      }
    }
  }
}

// ===============================================
//  ALTITUDE MODEL
// ===============================================

function updateMissileAltitudes(state: GameState): void {
  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue

    const spec = weaponSpecs[missile.weaponId]
    if (!spec) continue

    if (missile.is_interceptor) {
      // 3-phase SAM flight profile: climb → cruise at altitude → terminal dive
      const target = state.missiles.get(missile.interceptTargetMissileId ?? '')
      if (!target) continue

      const elapsed = state.time.timestamp - missile.launchTime
      const flightDuration = missile.eta - missile.launchTime
      const progress = Math.max(0, Math.min(1, elapsed / flightDuration))

      // Determine climb altitude: SAMs climb ABOVE the target, then dive down
      // Exoatmospheric interceptors (SM-3, THAAD) climb directly to high altitude
      const isExo = spec.flight_altitude_ft > 200000
      const minClimbM = isExo ? spec.flight_altitude_ft * 0.3048 * 0.3 : 3000 // 3km min for endo SAMs
      const overheadM = isExo ? 0 : 2000 // endo SAMs climb 2km above target
      const climbAlt = Math.max(target.altitude_m + overheadM, minClimbM)

      if (progress < 0.3) {
        // Phase 1: Rapid vertical climb
        missile.altitude_m = climbAlt * (progress / 0.3)
      } else if (progress < 0.7) {
        // Phase 2: Cruise at engagement altitude
        missile.altitude_m = climbAlt
      } else {
        // Phase 3: Terminal dive toward target
        const termProgress = (progress - 0.7) / 0.3
        missile.altitude_m = climbAlt + (target.altitude_m - climbAlt) * termProgress
      }
      continue
    }

    if (spec.type === 'ballistic_missile') {
      const flightDuration = missile.eta - missile.launchTime
      const elapsed = state.time.timestamp - missile.launchTime
      const progress = Math.max(0, Math.min(1, elapsed / flightDuration))

      // Ballistic profile: boost (0-0.15), midcourse (0.15-0.7), terminal (0.7-1.0)
      const peakAltM = spec.flight_altitude_ft * 0.3048 // convert ft to m

      if (progress < 0.15) {
        missile.phase = 'boost'
        missile.altitude_m = (progress / 0.15) * peakAltM * 0.5
      } else if (progress < 0.7) {
        missile.phase = 'midcourse'
        // Parabolic arc peaking at midpoint
        const midProgress = (progress - 0.15) / 0.55
        missile.altitude_m = peakAltM * (1 - 4 * (midProgress - 0.5) ** 2)
      } else {
        missile.phase = 'terminal'
        const termProgress = (progress - 0.7) / 0.3
        missile.altitude_m = peakAltM * (1 - termProgress) * 0.5
      }
    } else {
      // Cruise missiles fly at constant low altitude while fueled
      missile.phase = 'cruise'
      if (missile.fuel_remaining_sec > 0) {
        missile.altitude_m = spec.flight_altitude_ft * 0.3048
      } else {
        // Fuel exhausted: altitude drops 10 m/sec
        missile.altitude_m = Math.max(0, missile.altitude_m - 10)
      }
    }
  }
}

// ===============================================
//  POSITION UPDATE — uses speed_current_mach
// ===============================================

function updateMissilePositions(state: GameState): void {
  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue
    if (missile.is_interceptor) continue // interceptors are moved in updateInterceptors

    const target = state.units.get(missile.targetId)
    if (!target) {
      // Target gone, impact at current position
      if (state.time.timestamp >= missile.eta) {
        missile.status = 'impact'
      }
      continue
    }

    // Compute km traveled this tick (1 tick = 1 second of game time)
    const kmPerSec = machToKmh(missile.speed_current_mach) / 3600
    const currentPos = getCurrentMissilePosition(missile, state.time.timestamp)
    if (!currentPos) {
      if (state.time.timestamp >= missile.eta) {
        missile.status = 'impact'
      }
      continue
    }

    const distToTarget = haversine(
      { lng: currentPos[0], lat: currentPos[1] },
      target.position,
    )

    // If close enough or past ETA, mark as impact
    if (distToTarget <= kmPerSec || state.time.timestamp >= missile.eta) {
      missile.status = 'impact'
      continue
    }

    // Update ETA based on current speed
    if (missile.speed_current_mach > 0) {
      const timeToTargetMs = (distToTarget / kmPerSec) * 1000
      missile.eta = state.time.timestamp + timeToTargetMs
    }

    // Advance position along great circle toward target
    const brng = bearing(
      { lng: currentPos[0], lat: currentPos[1] },
      target.position,
    )
    const newPos = destination(
      { lng: currentPos[0], lat: currentPos[1] },
      brng,
      kmPerSec,
    )

    // Truncate initial great-circle path points that are in the future
    // (they have non-monotonic timestamps that break interpolation)
    while (missile.timestamps.length > 1 &&
           missile.timestamps[missile.timestamps.length - 1] > state.time.timestamp + 2000) {
      missile.path.pop()
      missile.timestamps.pop()
    }

    // Append actual tick position
    missile.path.push([newPos.lng, newPos.lat])
    missile.timestamps.push(state.time.timestamp + 1000)
    if (missile.path.length > 500) {
      missile.path.splice(0, missile.path.length - 500)
      missile.timestamps.splice(0, missile.timestamps.length - 500)
    }
  }
}

/** Get current position of a missile by interpolating its path */
function getCurrentMissilePosition(missile: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = missile
  if (path.length === 0) return null

  // Return the most recent path point (since we now append each tick)
  if (timestamps.length > 0 && currentTime >= timestamps[timestamps.length - 1]) {
    return path[path.length - 1]
  }

  // Interpolate between path segments
  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }

  return path[path.length - 1]
}

// ===============================================
//  AD ENGAGEMENT — creates interceptor Missiles
// ===============================================

function runADEngagement(state: GameState, _rng: SeededRNG): void {
  const events: GameEvent[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.roe === 'hold_fire') continue

    // Find ALL AD systems this unit can use (one per SAM weapon type)
    const unitADSystems = findAllADSystems(unit)
    if (unitADSystems.length === 0) continue

    const threats = detectThreats(state, unit)
    if (threats.length === 0) continue

    for (const { adSpec, loadout } of unitADSystems) {
      if (loadout.count <= 0) continue
      if (loadout.reloadingUntil) continue

      const engKey = `${unit.id}:${adSpec.id}`
      let engaged = activeEngagements.get(engKey)
      if (!engaged) {
        engaged = new Set()
        activeEngagements.set(engKey, engaged)
      }

      // Clean stale engagements
      for (const mId of engaged) {
        if (!state.missiles.has(mId)) engaged.delete(mId)
      }

      const availableChannels = adSpec.fire_channels - engaged.size
      let channelsUsed = 0

      for (const threat of threats) {
        if (channelsUsed >= availableChannels) break
        if (loadout.count <= 0) break
        if (engaged.has(threat.missile.id)) continue
        // Skip interceptor missiles - don't shoot at our own interceptors
        if (threat.missile.is_interceptor) continue
        // Weapons tight: only engage threats targeting this unit or nearby friendlies
        if (isSuppressedForTight(threat.missile.id, unit)) continue

        // Already engaged by another system on this unit?
        if (isAlreadyEngagedByUnit(unit.id, threat.missile.id)) continue

        // ALTITUDE CHECK -- can this system reach the missile?
        if (threat.missile.altitude_m > adSpec.max_altitude_m) continue

        // RANGE CHECK
        if (threat.distKm > adSpec.engagement_range_km) continue

        const interceptorSpec = weaponSpecs[loadout.weaponId]
        if (!interceptorSpec) continue

        // Fire! Decrement ammo and create an interceptor missile
        loadout.count--
        engaged.add(threat.missile.id)
        channelsUsed++

        if (loadout.count === 0) {
          events.push({
            type: 'AMMO_DEPLETED',
            unitId: unit.id,
            weaponId: loadout.weaponId,
            tick: state.time.tick,
          })
          loadout.reloadingUntil = state.time.timestamp + adSpec.reload_time_sec * 1000
        }

        // Compute interceptor flight parameters
        const intSpeedKmh = machToKmh(interceptorSpec.speed_mach)
        const fuelSec = adSpec.engagement_range_km / (intSpeedKmh / 3600)
        const flightTimeMs = (threat.distKm / intSpeedKmh) * 3600 * 1000

        // Predict intercept point: approximate where the threat will be
        const threatPos = getCurrentMissilePosition(threat.missile, state.time.timestamp)
        if (!threatPos) continue

        const interceptPoint = { lng: threatPos[0], lat: threatPos[1] }
        const numSegments = Math.max(5, Math.ceil(threat.distKm / 5))
        const path = greatCirclePath(unit.position, interceptPoint, numSegments)
        const timestamps = generateTimestamps(state.time.timestamp, flightTimeMs, numSegments)

        const intId = `int_${++interceptorCounter}`
        const interceptor: Missile = {
          id: intId,
          weaponId: loadout.weaponId,
          launcherId: unit.id,
          targetId: '', // not targeting a unit
          nation: unit.nation,
          path,
          timestamps,
          status: 'inflight',
          launchTime: state.time.timestamp,
          eta: state.time.timestamp + flightTimeMs,
          altitude_m: 0,
          phase: 'cruise',
          speed_current_mach: interceptorSpec.speed_mach,
          fuel_remaining_sec: fuelSec,
          is_interceptor: true,
          interceptTargetMissileId: threat.missile.id,
        }

        state.missiles.set(intId, interceptor)
      }
    }
  }

  emitEvents(state, events)
}

// ===============================================
//  INTERCEPTOR PURSUIT + RESOLUTION
// ===============================================

function updateInterceptors(state: GameState, rng: SeededRNG): void {
  const events: GameEvent[] = []
  const toRemove: string[] = []

  for (const interceptor of state.missiles.values()) {
    if (!interceptor.is_interceptor) continue
    if (interceptor.status !== 'inflight') continue

    const targetMissileId = interceptor.interceptTargetMissileId
    if (!targetMissileId) {
      toRemove.push(interceptor.id)
      continue
    }

    const targetMissile = state.missiles.get(targetMissileId)

    // If target is gone (destroyed/impacted), remove interceptor
    if (!targetMissile || targetMissile.status !== 'inflight') {
      toRemove.push(interceptor.id)
      continue
    }

    // If fuel exhausted, remove (missed)
    if (interceptor.fuel_remaining_sec <= 0) {
      toRemove.push(interceptor.id)
      continue
    }

    // Compute distance between interceptor and target
    const intPos = getCurrentMissilePosition(interceptor, state.time.timestamp)
    const targetPos = getCurrentMissilePosition(targetMissile, state.time.timestamp)

    if (!intPos || !targetPos) {
      toRemove.push(interceptor.id)
      continue
    }

    const dist = haversine(
      { lng: intPos[0], lat: intPos[1] },
      { lng: targetPos[0], lat: targetPos[1] },
    )

    // Close enough for engagement: within 2km
    if (dist < 2) {
      const interceptorSpec = weaponSpecs[interceptor.weaponId]
      const targetSpec = weaponSpecs[targetMissile.weaponId]

      // Find the launching unit for pKill calculation
      const adUnit = state.units.get(interceptor.launcherId)
      if (!adUnit || !interceptorSpec) {
        toRemove.push(interceptor.id)
        continue
      }

      const adSpec = findADSpecForWeapon(interceptor.weaponId)
      const pKill = computePKill(
        interceptorSpec,
        targetSpec,
        adUnit,
        targetMissile,
        adSpec?.fire_channels ?? 6,
        0,
      )

      if (rng.chance(pKill)) {
        // Hit! Destroy both
        targetMissile.status = 'intercepted'
        events.push({
          type: 'MISSILE_INTERCEPTED',
          missileId: targetMissileId,
          interceptorId: interceptor.launcherId,
          position: { lng: targetPos[0], lat: targetPos[1] },
          tick: state.time.tick,
        })
        state.missiles.delete(targetMissileId)
        toRemove.push(interceptor.id)

        // Clean up engagement tracking
        cleanEngagement(interceptor.launcherId, targetMissileId)
      } else {
        // Missed! Remove interceptor
        toRemove.push(interceptor.id)
        cleanEngagement(interceptor.launcherId, targetMissileId)
      }
      continue
    }

    // Pursuit: update interceptor position toward target
    const brng = bearing(
      { lng: intPos[0], lat: intPos[1] },
      { lng: targetPos[0], lat: targetPos[1] },
    )
    const kmPerSec = machToKmh(interceptor.speed_current_mach) / 3600
    const newPos = destination(
      { lng: intPos[0], lat: intPos[1] },
      brng,
      kmPerSec,
    )

    interceptor.path.push([newPos.lng, newPos.lat])
    interceptor.timestamps.push(state.time.timestamp + 1000)
  }

  for (const id of toRemove) {
    state.missiles.delete(id)
  }

  emitEvents(state, events)
}

/** Remove a missile from engagement tracking */
function cleanEngagement(unitId: string, missileId: string): void {
  for (const [key, engaged] of activeEngagements) {
    if (key.startsWith(`${unitId}:`)) {
      engaged.delete(missileId)
    }
  }
}

function computePKill(
  interceptor: WeaponSpec,
  target: WeaponSpec | undefined,
  adUnit: Unit,
  missile: Missile,
  totalChannels: number,
  activeChannels: number,
): number {
  const targetType = target?.type ?? 'cruise_missile'
  let pKill = interceptor.pk[targetType] ?? 0.5

  // Speed factor -- use actual current speed, not spec speed
  if (target) {
    const effectiveTargetSpeed = missile.speed_current_mach > 0
      ? missile.speed_current_mach
      : target.speed_mach
    const speedFactor = Math.min(1, interceptor.speed_mach / effectiveTargetSpeed)
    pKill *= speedFactor
  }

  // Saturation factor
  const load = activeChannels / totalChannels
  if (load > 0.8) {
    pKill *= Math.max(0.3, 1.0 - (load - 0.8) * 3.5)
  }

  // Health factor
  pKill *= adUnit.health / 100

  // Altitude penalty -- harder to hit at extremes of envelope
  if (target?.type === 'ballistic_missile') {
    // Terminal phase is harder (fast reentry)
    if (missile.phase === 'terminal') pKill *= 0.75
    // Midcourse at very high altitude -- only BMD interceptors good here
    if (missile.phase === 'midcourse' && missile.altitude_m > 100000) pKill *= 0.85
    // Boost phase -- difficult but possible for forward-deployed BMD
    if (missile.phase === 'boost') pKill *= 0.7
  }

  // Low-altitude cruise missiles harder to detect/track
  if (target?.flight_altitude_ft && target.flight_altitude_ft < 500) {
    pKill *= 0.8
  }

  return Math.max(0.05, Math.min(0.95, pKill))
}

// ===============================================
//  LAUNCH FUNCTIONS
// ===============================================

/** Launch a missile -- called from executeCommand */
export function launchMissile(
  state: GameState,
  launcherId: string,
  weaponId: string,
  targetId: string,
): GameEvent | null {
  const launcher = state.units.get(launcherId)
  const target = state.units.get(targetId)
  if (!launcher || !target) return null

  const loadout = launcher.weapons.find(w => w.weaponId === weaponId)
  if (!loadout || loadout.count <= 0) return null

  const spec = weaponSpecs[weaponId]
  if (!spec) return null

  const dist = haversine(launcher.position, target.position)
  if (dist > spec.range_km) return null

  loadout.count--

  if (loadout.count === 0) {
    emitEvents(state, [{
      type: 'AMMO_DEPLETED',
      unitId: launcherId,
      weaponId,
      tick: state.time.tick,
    }])
  }

  const flightTimeMs = computeFlightTime(dist, spec)
  const numSegments = Math.max(20, Math.ceil(dist / 10))
  const path = greatCirclePath(launcher.position, target.position, numSegments)
  const timestamps = generateTimestamps(state.time.timestamp, flightTimeMs, numSegments)

  // Fuel duration: range_km / (speed_kmh / 3600) = seconds of burn
  const speedKmPerSec = machToKmh(spec.speed_mach) / 3600
  const fuelSec = spec.range_km / speedKmPerSec

  const id = `m_${++missileCounter}`
  const missile: Missile = {
    id,
    weaponId,
    launcherId,
    targetId,
    nation: launcher.nation,
    path,
    timestamps,
    status: 'inflight',
    launchTime: state.time.timestamp,
    eta: state.time.timestamp + flightTimeMs,
    altitude_m: spec.type === 'ballistic_missile' ? 0 : spec.flight_altitude_ft * 0.3048,
    phase: spec.type === 'ballistic_missile' ? 'boost' : 'cruise',
    speed_current_mach: spec.type === 'ballistic_missile' ? 0 : spec.speed_mach,
    fuel_remaining_sec: fuelSec,
    is_interceptor: false,
  }

  state.missiles.set(id, missile)

  return {
    type: 'MISSILE_LAUNCHED',
    missileId: id,
    launcherId,
    targetId,
    weaponName: spec.name,
    tick: state.time.tick,
  }
}

/** Manually fire a SAM at a specific missile */
export function launchSAM(
  state: GameState,
  launcherId: string,
  weaponId: string,
  missileId: string,
  _rng: SeededRNG,
): GameEvent | null {
  const launcher = state.units.get(launcherId)
  if (!launcher) return null

  const loadout = launcher.weapons.find(w => w.weaponId === weaponId)
  if (!loadout || loadout.count <= 0) return null

  const interceptorSpec = weaponSpecs[weaponId]
  if (!interceptorSpec || interceptorSpec.type !== 'sam') return null

  const targetMissile = state.missiles.get(missileId)
  if (!targetMissile || targetMissile.status !== 'inflight') return null

  // Check altitude envelope
  const adSpec = findADSpecForWeapon(weaponId)
  if (adSpec && targetMissile.altitude_m > adSpec.max_altitude_m) return null // can't reach

  loadout.count--

  if (loadout.count === 0) {
    emitEvents(state, [{
      type: 'AMMO_DEPLETED',
      unitId: launcherId,
      weaponId,
      tick: state.time.tick,
    }])
  }

  // Create an interceptor missile instead of instant resolution
  const intSpeedKmh = machToKmh(interceptorSpec.speed_mach)
  const fuelSec = adSpec
    ? adSpec.engagement_range_km / (intSpeedKmh / 3600)
    : interceptorSpec.range_km / (intSpeedKmh / 3600)

  const threatPos = getCurrentMissilePosition(targetMissile, state.time.timestamp)
  if (!threatPos) return null

  const interceptPoint = { lng: threatPos[0], lat: threatPos[1] }
  const dist = haversine(launcher.position, interceptPoint)
  const flightTimeMs = (dist / intSpeedKmh) * 3600 * 1000
  const numSegments = Math.max(5, Math.ceil(dist / 5))
  const path = greatCirclePath(launcher.position, interceptPoint, numSegments)
  const timestamps = generateTimestamps(state.time.timestamp, flightTimeMs, numSegments)

  const intId = `int_${++interceptorCounter}`
  const interceptor: Missile = {
    id: intId,
    weaponId,
    launcherId,
    targetId: '', // not targeting a unit
    nation: launcher.nation,
    path,
    timestamps,
    status: 'inflight',
    launchTime: state.time.timestamp,
    eta: state.time.timestamp + flightTimeMs,
    altitude_m: 0,
    phase: 'cruise',
    speed_current_mach: interceptorSpec.speed_mach,
    fuel_remaining_sec: fuelSec,
    is_interceptor: true,
    interceptTargetMissileId: missileId,
  }

  state.missiles.set(intId, interceptor)

  return null // no immediate event; events fire when intercept resolves
}

// ===============================================
//  AD SYSTEM HELPERS
// ===============================================

/** Find all AD systems matching this unit's SAM weapons */
function findAllADSystems(unit: Unit): { adSpec: ADSystemSpec; loadout: typeof unit.weapons[0] }[] {
  const results: { adSpec: ADSystemSpec; loadout: typeof unit.weapons[0] }[] = []

  for (const loadout of unit.weapons) {
    const spec = weaponSpecs[loadout.weaponId]
    if (spec?.type !== 'sam') continue

    for (const ad of Object.values(adSystems)) {
      if (ad.interceptorId === loadout.weaponId) {
        results.push({ adSpec: ad, loadout })
        break
      }
    }
  }

  // Sort: longest-range systems first (engage at maximum distance)
  results.sort((a, b) => b.adSpec.engagement_range_km - a.adSpec.engagement_range_km)
  return results
}

function findADSpecForWeapon(weaponId: string): ADSystemSpec | null {
  for (const ad of Object.values(adSystems)) {
    if (ad.interceptorId === weaponId) return ad
  }
  return null
}

function isAlreadyEngagedByUnit(unitId: string, missileId: string): boolean {
  for (const [key, engaged] of activeEngagements) {
    if (key.startsWith(`${unitId}:`) && engaged.has(missileId)) return true
  }
  return false
}

// ===============================================
//  IMPACT RESOLUTION
// ===============================================

function resolveImpacts(state: GameState): void {
  const events: GameEvent[] = []

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'impact') continue

    // Interceptors don't cause damage on impact
    if (missile.is_interceptor) {
      state.missiles.delete(missile.id)
      continue
    }

    const target = state.units.get(missile.targetId)
    const spec = weaponSpecs[missile.weaponId]

    if (target && target.status !== 'destroyed' && spec) {
      const damage = computeDamage(spec, target.hardness)
      const healthBefore = target.health
      target.health = Math.max(0, target.health - damage)

      // Permanent structural damage: heavy hits that bring unit below 30 HP
      // reduce maxHealth, making full repair impossible
      if (target.health < 30 && healthBefore >= 30) {
        const permanentDmg = Math.ceil(damage * 0.25)
        target.maxHealth = Math.max(10, (target.maxHealth ?? 100) - permanentDmg)
      }

      events.push({
        type: 'MISSILE_IMPACT',
        missileId: missile.id,
        targetId: missile.targetId,
        damage,
        tick: state.time.tick,
      })

      if (target.health <= 0) {
        target.status = 'destroyed'
        events.push({
          type: 'UNIT_DESTROYED',
          unitId: target.id,
          tick: state.time.tick,
        })
      } else if (target.health < 50) {
        target.status = 'damaged'
      }
    }

    state.missiles.delete(missile.id)
  }

  emitEvents(state, events)
}

function updateReloads(state: GameState): void {
  for (const unit of state.units.values()) {
    for (const loadout of unit.weapons) {
      if (loadout.reloadingUntil && state.time.timestamp >= loadout.reloadingUntil) {
        loadout.reloadingUntil = undefined
        const spec = weaponSpecs[loadout.weaponId]
        if (spec?.type === 'sam') {
          loadout.count = Math.min(loadout.maxCount, loadout.count + Math.ceil(loadout.maxCount * 0.25))
        }
      }
    }
  }
}

// ===============================================
//  HELPERS
// ===============================================

function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}

function computeFlightTime(distKm: number, spec: WeaponSpec): number {
  const speedKmH = machToKmh(spec.speed_mach)
  return (distKm / speedKmH) * 3600 * 1000
}

function computeDamage(spec: WeaponSpec, targetHardness: number): number {
  let cepFactor: number
  if (spec.cep_m < 10) cepFactor = 1.0
  else if (spec.cep_m < 50) cepFactor = 0.8
  else if (spec.cep_m < 200) cepFactor = 0.5
  else cepFactor = 0.3

  const raw = (spec.warhead_kg / targetHardness) * cepFactor * 100
  return Math.min(100, Math.max(1, Math.round(raw)))
}

function generateTimestamps(
  launchTime: number,
  flightTimeMs: number,
  numSegments: number,
): number[] {
  const timestamps: number[] = []
  for (let i = 0; i <= numSegments; i++) {
    timestamps.push(launchTime + (flightTimeMs * i) / numSegments)
  }
  return timestamps
}
