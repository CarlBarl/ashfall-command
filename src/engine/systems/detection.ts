import type { GameState, Missile, Unit, UnitId, Position } from '@/types/game'
import type { ElevationGrid } from './elevation'
import { haversine, bearing } from '../utils/geo'
import { weaponSpecs } from '@/data/weapons/missiles'

export interface DetectedThreat {
  missile: Missile
  distKm: number
  timeToImpactMs: number
}

const DEFAULT_ANTENNA_HEIGHT_M = 15

interface TickMemo {
  tick: number
  results: Map<UnitId, DetectedThreat[]>
}

// detectThreats runs for the same unit up to 3× per tick (sensor network, ROE
// enforcement, combat); within a tick the inputs are identical, so memoize per
// (state, tick, unit). Keyed by state object so parallel states (tests) never collide.
let detectionMemo = new WeakMap<GameState, TickMemo>()

/** Reset module-level state — must be called on save/load (game-engine resetAllSystems) */
export function resetDetectionCache(): void {
  detectionMemo = new WeakMap()
}

/**
 * Height pays: a radar sited high (terrain + antenna/airframe) reaches further.
 * +50% range at 10 km of total height. Replaces the old hard radar-horizon cap —
 * radar coverage is otherwise its nominal radius (design decision 2026-06-11).
 */
export function elevationRangeBonus(heightM: number): number {
  return 1 + 0.5 * Math.min(1, Math.max(0, heightM) / 10000)
}

/** High targets stand out against the sky: spotted at up to +30% range at 8 km height */
export function targetProminenceBonus(heightM: number): number {
  return 1 + 0.3 * Math.min(1, Math.max(0, heightM) / 8000)
}

/** Check line-of-sight between two points using elevation grid */
export function hasLineOfSight(
  radarPos: Position, radarAltM: number,
  targetLat: number, targetLng: number, targetAltM: number,
  grid: ElevationGrid,
): boolean {
  const samples = grid.sampleLine(
    radarPos,
    { lat: targetLat, lng: targetLng },
    10,
  )
  for (let i = 1; i < samples.length - 1; i++) {
    const t = i / (samples.length - 1)
    const losHeight = radarAltM + (targetAltM - radarAltM) * t
    if (samples[i] > losHeight) return false
  }
  return true
}

/** For each AD unit, find incoming missiles within detection range */
export function detectThreats(state: GameState, adUnit: Unit, grid?: ElevationGrid | null): DetectedThreat[] {
  if (adUnit.sensors.length === 0) return []
  // EMCON checked before the memo so a mid-tick flip never serves a stale picture
  if (adUnit.emcon) return []

  let memo = detectionMemo.get(state)
  if (!memo || memo.tick !== state.time.tick) {
    memo = { tick: state.time.tick, results: new Map() }
    detectionMemo.set(state, memo)
  }
  const cached = memo.results.get(adUnit.id)
  if (cached) return cached

  const threats = computeThreats(state, adUnit, grid)
  memo.results.set(adUnit.id, threats)
  return threats
}

function computeThreats(state: GameState, adUnit: Unit, grid?: ElevationGrid | null): DetectedThreat[] {
  const threats: DetectedThreat[] = []

  // Sensor.detection_prob is data-only today — no probability roll (see BACKLOG)
  const radars = adUnit.sensors.filter(s => s.type === 'radar' && s.range_km > 0)
  if (radars.length === 0) return threats

  const siteElevM = grid ? grid.getElevation(adUnit.position.lat, adUnit.position.lng) : 0

  for (const missile of state.missiles.values()) {
    if (missile.status !== 'inflight') continue
    if (missile.nation === adUnit.nation) continue // don't track friendly

    // Approximate current missile position from path + timestamps
    const currentPos = interpolateMissilePosition(missile, state.time.timestamp)
    if (!currentPos) continue

    const targetPos = { lat: currentPos[1], lng: currentPos[0] }
    const dist = haversine(adUnit.position, targetPos)

    // Per-missile range modifiers, shared by every sensor
    const spec = weaponSpecs[missile.weaponId]
    let profileModifier = 1.0
    if (spec) {
      // RCS factor: small targets (drones ~0.1 m²) are harder to detect
      const rcs = spec.rcs_m2 ?? 1.0
      if (rcs < 1.0) profileModifier *= Math.min(1.0, Math.sqrt(rcs))

      // Low flyers hide in surface clutter — harder to pick up, but no hard horizon cap
      if (spec.flight_altitude_ft < 500) profileModifier *= 0.4
      else if (spec.flight_altitude_ft < 5000) profileModifier *= 0.7
    }

    const targetAltM = missile.altitude_m ?? 50

    // The missile is detected if ANY radar sees it — each sensor evaluated with its
    // own range, antenna height and sector arc (mirrors visibility.ts radarSeesUnit)
    let seen = false
    for (const sensor of radars) {
      let effectiveRange = sensor.range_km * profileModifier
      const radarAltM = siteElevM + (sensor.antenna_height_m ?? DEFAULT_ANTENNA_HEIGHT_M)

      // High-sited radars reach further
      if (grid) effectiveRange *= elevationRangeBonus(radarAltM)

      if (dist > effectiveRange) continue

      // Sector check — skip targets outside this radar's coverage arc
      const sectorDeg = sensor.sector_deg ?? 360
      if (sectorDeg < 360) {
        const bearingToTarget = bearing(adUnit.position, targetPos)
        // Normalize difference to [-180, 180]
        const headingDiff = ((bearingToTarget - adUnit.heading) % 360 + 540) % 360 - 180
        if (Math.abs(headingDiff) > sectorDeg / 2) continue
      }

      // Terrain masking is a hard check — mountains physically block radar
      if (grid &&
          !hasLineOfSight(adUnit.position, radarAltM, currentPos[1], currentPos[0], targetAltM, grid)) continue

      seen = true
      break
    }

    if (seen) {
      threats.push({
        missile,
        distKm: dist,
        timeToImpactMs: missile.eta - state.time.timestamp,
      })
    }
  }

  // Sort by urgency (shortest time to impact first)
  threats.sort((a, b) => a.timeToImpactMs - b.timeToImpactMs)
  return threats
}

function interpolateMissilePosition(missile: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = missile
  if (timestamps.length < 2) return null

  if (currentTime <= timestamps[0]) return path[0]
  if (currentTime >= timestamps[timestamps.length - 1]) return path[path.length - 1]

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }

  return null
}
