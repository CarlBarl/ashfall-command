import type { GameState, GameEvent, Missile, Unit, WeaponSpec, ADSystemSpec } from '@/types/game'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { haversine } from '../utils/geo'
import { greatCirclePath, machToKmh } from '../utils/geo'
import { detectThreats } from './detection'

let missileCounter = 0

// Track active fire channels per AD system per unit: `${unitId}:${adSystemId}` → Set<missileId>
const activeEngagements = new Map<string, Set<string>>()

export function processCombat(state: GameState, rng: SeededRNG): void {
  updateMissilePositions(state)
  updateMissileAltitudes(state)
  runADEngagement(state, rng)
  resolveImpacts(state)
  updateReloads(state)
}

/** Launch a missile — called from executeCommand */
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
    altitude_km: spec.type === 'ballistic_missile' ? 0 : spec.flight_altitude_ft * 0.0003048,
    phase: spec.type === 'ballistic_missile' ? 'boost' : 'cruise',
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
  rng: SeededRNG,
): GameEvent | null {
  const launcher = state.units.get(launcherId)
  if (!launcher) return null

  const loadout = launcher.weapons.find(w => w.weaponId === weaponId)
  if (!loadout || loadout.count <= 0) return null

  const interceptorSpec = weaponSpecs[weaponId]
  if (!interceptorSpec || interceptorSpec.type !== 'sam') return null

  const missile = state.missiles.get(missileId)
  if (!missile || missile.status !== 'inflight') return null

  // Check altitude envelope
  const adSpec = findADSpecForWeapon(weaponId)
  if (adSpec && missile.altitude_km > adSpec.max_altitude_km) return null // can't reach

  loadout.count--

  const targetSpec = weaponSpecs[missile.weaponId]
  const pKill = computePKill(interceptorSpec, targetSpec, launcher, missile, adSpec?.fire_channels ?? 6, 0)

  if (rng.chance(pKill)) {
    missile.status = 'intercepted'
    state.missiles.delete(missileId)
    const event: GameEvent = {
      type: 'MISSILE_INTERCEPTED',
      missileId,
      interceptorId: launcherId,
      tick: state.time.tick,
    }
    emitEvents(state, [event])
    return event
  }

  return null // missed
}

// ═══════════════════════════════════════════════
//  ALTITUDE MODEL
// ═══════════════════════════════════════════════

function updateMissileAltitudes(state: GameState): void {
  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue

    const spec = weaponSpecs[missile.weaponId]
    if (!spec) continue

    if (spec.type === 'ballistic_missile') {
      const flightDuration = missile.eta - missile.launchTime
      const elapsed = state.time.timestamp - missile.launchTime
      const progress = Math.max(0, Math.min(1, elapsed / flightDuration))

      // Ballistic profile: boost (0-0.15), midcourse (0.15-0.7), terminal (0.7-1.0)
      const peakAltKm = spec.flight_altitude_ft * 0.0003048 // convert ft to km

      if (progress < 0.15) {
        missile.phase = 'boost'
        missile.altitude_km = (progress / 0.15) * peakAltKm * 0.5
      } else if (progress < 0.7) {
        missile.phase = 'midcourse'
        // Parabolic arc peaking at midpoint
        const midProgress = (progress - 0.15) / 0.55
        missile.altitude_km = peakAltKm * (1 - 4 * (midProgress - 0.5) ** 2)
      } else {
        missile.phase = 'terminal'
        const termProgress = (progress - 0.7) / 0.3
        missile.altitude_km = peakAltKm * (1 - termProgress) * 0.5
      }
    } else {
      // Cruise missiles fly at constant low altitude
      missile.phase = 'cruise'
      missile.altitude_km = spec.flight_altitude_ft * 0.0003048
    }
  }
}

// ═══════════════════════════════════════════════
//  AD ENGAGEMENT — multi-system, altitude-aware
// ═══════════════════════════════════════════════

function runADEngagement(state: GameState, rng: SeededRNG): void {
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

        // Already engaged by another system on this unit?
        if (isAlreadyEngagedByUnit(unit.id, threat.missile.id)) continue

        // ALTITUDE CHECK — can this system reach the missile?
        if (threat.missile.altitude_km > adSpec.max_altitude_km) continue

        // RANGE CHECK
        if (threat.distKm > adSpec.engagement_range_km) continue

        const interceptorSpec = weaponSpecs[loadout.weaponId]
        if (!interceptorSpec) continue

        const targetSpec = weaponSpecs[threat.missile.weaponId]
        const pKill = computePKill(interceptorSpec, targetSpec, unit, threat.missile, adSpec.fire_channels, engaged.size)

        // Fire!
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

        if (rng.chance(pKill)) {
          threat.missile.status = 'intercepted'
          events.push({
            type: 'MISSILE_INTERCEPTED',
            missileId: threat.missile.id,
            interceptorId: unit.id,
            tick: state.time.tick,
          })
          state.missiles.delete(threat.missile.id)
          engaged.delete(threat.missile.id)
        }
      }
    }
  }

  emitEvents(state, events)
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

  // Speed factor
  if (target) {
    const speedFactor = Math.min(1, interceptor.speed_mach / target.speed_mach)
    pKill *= speedFactor
  }

  // Saturation factor
  const load = activeChannels / totalChannels
  if (load > 0.8) {
    pKill *= Math.max(0.3, 1.0 - (load - 0.8) * 3.5)
  }

  // Health factor
  pKill *= adUnit.health / 100

  // Altitude penalty — harder to hit at extremes of envelope
  if (target?.type === 'ballistic_missile') {
    // Terminal phase is harder (fast reentry)
    if (missile.phase === 'terminal') pKill *= 0.75
    // Midcourse at very high altitude — only BMD interceptors good here
    if (missile.phase === 'midcourse' && missile.altitude_km > 100) pKill *= 0.85
    // Boost phase — difficult but possible for forward-deployed BMD
    if (missile.phase === 'boost') pKill *= 0.7
  }

  // Low-altitude cruise missiles harder to detect/track
  if (target?.flight_altitude_ft && target.flight_altitude_ft < 500) {
    pKill *= 0.8
  }

  return Math.max(0.05, Math.min(0.95, pKill))
}

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

// ═══════════════════════════════════════════════
//  MISSILE FLIGHT + IMPACT
// ═══════════════════════════════════════════════

function updateMissilePositions(state: GameState): void {
  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue
    if (state.time.timestamp >= missile.eta) {
      missile.status = 'impact'
    }
  }
}

function resolveImpacts(state: GameState): void {
  const events: GameEvent[] = []

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'impact') continue

    const target = state.units.get(missile.targetId)
    const spec = weaponSpecs[missile.weaponId]

    if (target && target.status !== 'destroyed' && spec) {
      const damage = computeDamage(spec, target.hardness)
      target.health = Math.max(0, target.health - damage)

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

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
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
