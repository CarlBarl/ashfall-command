import type { GameState, GameEvent, Missile, Unit } from '@/types/game'
import type { SeededRNG } from '../utils/rng'
import { haversine } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'
import { pointDefenseSpecs } from '@/data/weapons/point-defense'

/**
 * Point defense system — last-ditch layer that runs AFTER SAM engagement.
 * Gun-type systems (Phalanx CIWS, C-RAM) resolve instantly with no interceptor missile.
 * Missile-type PD (RAM) also resolves instantly for simplicity (fire-and-forget).
 */
export function processPointDefense(state: GameState, rng: SeededRNG): void {
  const events: GameEvent[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (!unit.pointDefense || unit.pointDefense.length === 0) continue

    for (const pd of unit.pointDefense) {
      if (!pd.active) continue
      if (pd.ammo <= 0) continue
      if (pd.cooldownUntil && state.time.timestamp < pd.cooldownUntil) continue

      const spec = pointDefenseSpecs[pd.specId]
      if (!spec) continue

      // Find incoming enemy missiles within PD range
      const threat = findClosestThreat(state, unit, spec.range_km)
      if (!threat) continue

      // Engage: consume ammo, apply cooldown
      pd.ammo = Math.max(0, pd.ammo - spec.ammoPerEngagement)
      pd.cooldownUntil = state.time.timestamp + spec.cooldown_sec * 1000

      // Roll PK
      const targetSpec = weaponSpecs[threat.weaponId]
      const targetType = targetSpec?.type ?? 'cruise_missile'
      const basePk = spec.pk[targetType] ?? 0.3
      // Health degrades effectiveness
      const healthFactor = unit.health / 100
      const pKill = Math.max(0.05, Math.min(0.95, basePk * healthFactor))

      if (rng.chance(pKill)) {
        // Kill — remove the missile
        threat.status = 'intercepted'
        state.missiles.delete(threat.id)
        events.push({
          type: 'POINT_DEFENSE_KILL',
          unitId: unit.id,
          missileId: threat.id,
          specId: pd.specId,
          tick: state.time.tick,
        })
        // Also emit standard intercept event for the AlertFeed
        events.push({
          type: 'MISSILE_INTERCEPTED',
          missileId: threat.id,
          interceptorId: unit.id,
          position: { ...unit.position },
          tick: state.time.tick,
        })
      }
      // Miss — threat continues. PD can't re-engage until cooldown expires.
    }
  }

  emitEvents(state, events)
}

function findClosestThreat(
  state: GameState,
  unit: Unit,
  maxRange: number,
): Missile | null {
  let closest: Missile | null = null
  let closestDist = Infinity

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue
    if (missile.is_interceptor) continue
    if (missile.nation === unit.nation) continue

    // Check if missile is targeting this unit or nearby
    const missilePos = getMissileApproxPos(missile, state.time.timestamp)
    if (!missilePos) continue

    const dist = haversine(unit.position, missilePos)
    if (dist <= maxRange && dist < closestDist) {
      closest = missile
      closestDist = dist
    }
  }

  return closest
}

function getMissileApproxPos(missile: Missile, currentTime: number): { lng: number; lat: number } | null {
  const { path, timestamps } = missile
  if (path.length === 0) return null

  // Use latest path point
  if (currentTime >= timestamps[timestamps.length - 1]) {
    const p = path[path.length - 1]
    return { lng: p[0], lat: p[1] }
  }

  // Interpolate
  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return {
        lng: path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        lat: path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      }
    }
  }

  return null
}

function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}

export function resetPointDefenseState(): void {
  // No module-level state currently
}
