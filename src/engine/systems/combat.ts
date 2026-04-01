import type { GameState, GameEvent, Missile, Position, Unit, WeaponSpec } from '@/types/game'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { haversine } from '../utils/geo'
import { greatCirclePath, machToKmh } from '../utils/geo'
import { detectThreats } from './detection'

let missileCounter = 0

// Track active fire channels: unitId → Set of engaged missileIds
const activeEngagements = new Map<string, Set<string>>()

/** Process all combat: launches, flight, AD engagement, interception, impacts */
export function processCombat(state: GameState, rng: SeededRNG): void {
  updateMissilePositions(state)
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
  const path = generateMissilePath(launcher.position, target.position, spec, numSegments)
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

// ═══════════════════════════════════════════════
//  AD ENGAGEMENT
// ═══════════════════════════════════════════════

function runADEngagement(state: GameState, rng: SeededRNG): void {
  const events: GameEvent[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.roe === 'hold_fire') continue

    // Find SAM weapons on this unit
    const samLoadouts = unit.weapons.filter(w => {
      const spec = weaponSpecs[w.weaponId]
      return spec?.type === 'sam' && w.count > 0 && !w.reloadingUntil
    })

    if (samLoadouts.length === 0) continue

    // Get AD system spec for this unit
    const adSpec = findADSpec(unit)
    if (!adSpec) continue

    // Detect threats
    const threats = detectThreats(state, unit)
    if (threats.length === 0) continue

    // Check available fire channels
    let engaged = activeEngagements.get(unit.id)
    if (!engaged) {
      engaged = new Set()
      activeEngagements.set(unit.id, engaged)
    }

    // Clean up resolved engagements
    for (const mId of engaged) {
      if (!state.missiles.has(mId)) engaged.delete(mId)
    }

    const availableChannels = adSpec.fire_channels - engaged.size

    // Engage threats up to available channels
    let channelsUsed = 0
    for (const threat of threats) {
      if (channelsUsed >= availableChannels) break
      if (engaged.has(threat.missile.id)) continue

      // Find best interceptor for this threat
      const loadout = samLoadouts.find(w => w.count > 0)
      if (!loadout) break

      const interceptorSpec = weaponSpecs[loadout.weaponId]
      if (!interceptorSpec) continue

      // Check engagement range
      if (threat.distKm > adSpec.engagement_range_km) continue

      // Weapons tight = only engage if target is heading toward us or friendly units
      // For simplicity, weapons_tight still engages incoming missiles
      // (it would restrict offensive launches, which we handle elsewhere)

      // Compute pKill
      const targetSpec = weaponSpecs[threat.missile.weaponId]
      const pKill = computePKill(interceptorSpec, targetSpec, unit, adSpec, engaged.size)

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
        // Start reload
        loadout.reloadingUntil = state.time.timestamp + adSpec.reload_time_sec * 1000
      }

      // Roll for kill
      if (rng.chance(pKill)) {
        // Intercept!
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
      // If miss, missile continues — channel stays occupied until missile resolves
    }
  }

  emitEvents(state, events)
}

function computePKill(
  interceptor: WeaponSpec,
  target: WeaponSpec | undefined,
  adUnit: Unit,
  _adSpec: { fire_channels: number },
  activeChannels: number,
): number {
  // Base pKill from interceptor spec
  const targetType = target?.type ?? 'cruise_missile'
  let pKill = interceptor.pk[targetType] ?? 0.5

  // Speed factor: min(1, interceptor_mach / target_mach)
  if (target) {
    const speedFactor = Math.min(1, interceptor.speed_mach / target.speed_mach)
    pKill *= speedFactor
  }

  // Saturation factor: 1.0 if load < 0.8, linear decay to 0.3 at 1.0
  const load = activeChannels / _adSpec.fire_channels
  if (load > 0.8) {
    const satFactor = 1.0 - (load - 0.8) * (0.7 / 0.2) // 1.0→0.3 over 0.8→1.0
    pKill *= Math.max(0.3, satFactor)
  }

  // Health factor
  pKill *= adUnit.health / 100

  // Terminal phase penalty for ballistic reentry
  if (target?.type === 'ballistic_missile') {
    pKill *= 0.85
  }

  // Low-RCS bonus for cruise missiles at low altitude
  if (target?.flight_altitude_ft && target.flight_altitude_ft < 500) {
    pKill *= 0.8
  }

  return Math.max(0.05, Math.min(0.99, pKill))
}

function findADSpec(unit: Unit): typeof adSystems[string] | null {
  // Match unit to AD system by its interceptor weapon
  for (const loadout of unit.weapons) {
    const spec = weaponSpecs[loadout.weaponId]
    if (spec?.type === 'sam') {
      // Find AD system that uses this interceptor
      for (const ad of Object.values(adSystems)) {
        if (ad.interceptorId === loadout.weaponId) return ad
      }
    }
  }
  return null
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
        // Reload some ammo (partial reload for SAMs)
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

function generateMissilePath(
  from: Position,
  to: Position,
  _spec: WeaponSpec,
  numSegments: number,
): [number, number][] {
  return greatCirclePath(from, to, numSegments)
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
