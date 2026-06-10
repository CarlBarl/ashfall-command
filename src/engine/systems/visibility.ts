import type {
  GameState,
  Nation,
  NationId,
  Position,
  Unit,
  UnitCategory,
  UnitId,
  VisibilityContact,
  VisibilityLevel,
} from '@/types/game'
import type { ElevationGrid } from './elevation'
import type { SensorNetwork } from './sensor-network'
import type { EspionageResult } from './espionage'
import { hasLineOfSight } from './detection'
import { getSatelliteDetections, pointToLineDistKm, DETECTION_FADE_TICKS } from './satellites'
import { haversine } from '../utils/geo'

/**
 * Fog of war. Maintains state.visibility — per observing nation, a contact map over
 * enemy units — from radar coverage, satellites, HUMINT, ELINT and combat events.
 * Full source evaluation runs once per game-minute; event-driven reveals (launch
 * plumes, mine contacts) apply on the tick they happen.
 * Design: docs/plans/game-loop-v2.md §1.
 */

const EVAL_INTERVAL_TICKS = 60
const IDENTIFIED_DECAY_TICKS = 600
const TRACKED_DECAY_TICKS = 600
const DETECTED_DECAY_TICKS = 1800
const HUMINT_STICKY_TICKS = 1800
const RADAR_IDENTIFY_FRACTION = 0.6
const DEFAULT_SIGINT_MULTIPLIER = 1.5
const DEFAULT_ANTENNA_HEIGHT_M = 15
const TARGET_HEIGHT_M = 10

const LEVEL_RANK: Record<VisibilityLevel, number> = { unseen: 0, detected: 1, tracked: 2, identified: 3 }

interface ContactMeta {
  /** Level at lastSeenTick — decay thresholds are cumulative from this anchor */
  anchor: VisibilityLevel
  /** HUMINT reveals keep the contact identified until this tick */
  humintUntil: number
}

const metaByObserver = new Map<string, Map<UnitId, ContactMeta>>()

function metaFor(observer: string): Map<UnitId, ContactMeta> {
  let m = metaByObserver.get(observer)
  if (!m) {
    m = new Map()
    metaByObserver.set(observer, m)
  }
  return m
}

export function processVisibility(
  state: GameState,
  _network: SensorNetwork | null,
  espionage: EspionageResult | null,
  grid: ElevationGrid | null,
): void {
  if (state.time.tick % EVAL_INTERVAL_TICKS === 0) {
    evaluateSources(state, espionage, grid)
  }
  applyEventReveals(state)
}

export function resetVisibilityState(): void {
  metaByObserver.clear()
}

// ---------------------------------------------------------------------------
// Per-minute source evaluation
// ---------------------------------------------------------------------------

function evaluateSources(state: GameState, espionage: EspionageResult | null, grid: ElevationGrid | null): void {
  const tick = state.time.tick
  state.visibility ??= {}

  for (const nation of Object.values(state.nations)) {
    const contacts = (state.visibility[nation.id as string] ??= {})
    const meta = metaFor(nation.id as string)

    const ownRadars: Unit[] = []
    const ownSensorUnits: Unit[] = []
    for (const u of state.units.values()) {
      if (u.nation !== nation.id || u.status === 'destroyed' || u.sensors.length === 0) continue
      ownSensorUnits.push(u)
      if (u.sensors.some(s => s.type === 'radar' && s.range_km > 0)) ownRadars.push(u)
    }

    const humint = espionage?.humintRevealed.get(nation.id)
    if (humint) {
      for (const unitId of humint) {
        const m = meta.get(unitId)
        if (m) m.humintUntil = tick + HUMINT_STICKY_TICKS
        else meta.set(unitId, { anchor: 'unseen', humintUntil: tick + HUMINT_STICKY_TICKS })
      }
    }
    const sigintMultiplier = espionage?.sigintMultiplier.get(nation.id) ?? DEFAULT_SIGINT_MULTIPLIER
    const satDetections = getSatelliteDetections(nation.id, tick)

    for (const unit of state.units.values()) {
      if (unit.nation === nation.id) continue

      let best: VisibilityLevel = 'unseen'
      if (unit.status !== 'destroyed') {
        best = radarContactLevel(ownRadars, unit, grid)
        if (satDetections.has(unit.id)) {
          best = maxLevel(best, satelliteContactLevel(nation, unit, tick))
        }
        if ((meta.get(unit.id)?.humintUntil ?? 0) > tick) {
          best = 'identified'
        }
        if (best === 'unseen' && isElintDetected(ownSensorUnits, unit, sigintMultiplier)) {
          best = 'detected'
        }
      }

      const contact = contacts[unit.id]
      if (!contact) {
        if (best !== 'unseen') contacts[unit.id] = newContact(meta, unit, best, tick)
        continue
      }

      const anchor = anchorOf(contact, meta.get(unit.id))
      const floor = decayFloor(unit, contact, anchor)
      let decayed = decayedLevel(anchor, tick - contact.lastSeenTick)
      if (LEVEL_RANK[decayed] < LEVEL_RANK[floor]) decayed = floor

      if (best !== 'unseen' && LEVEL_RANK[best] >= LEVEL_RANK[decayed]) {
        refreshContact(contact, meta, unit, best, tick)
      } else if (decayed === 'unseen') {
        delete contacts[unit.id]
        meta.delete(unit.id)
      } else {
        contact.level = decayed
        contact.pinned = floor !== 'unseen'
      }
    }
  }
}

function radarContactLevel(ownRadars: Unit[], target: Unit, grid: ElevationGrid | null): VisibilityLevel {
  let best: VisibilityLevel = 'unseen'
  for (const radar of ownRadars) {
    let range = 0
    let antennaHeight = DEFAULT_ANTENNA_HEIGHT_M
    for (const s of radar.sensors) {
      if (s.type === 'radar' && s.range_km > range) {
        range = s.range_km
        antennaHeight = s.antenna_height_m ?? DEFAULT_ANTENNA_HEIGHT_M
      }
    }
    const dist = haversine(radar.position, target.position)
    if (dist > range) continue
    if (grid) {
      const radarAltM = grid.getElevation(radar.position.lat, radar.position.lng) + antennaHeight
      const targetAltM = grid.getElevation(target.position.lat, target.position.lng) + TARGET_HEIGHT_M
      if (!hasLineOfSight(radar.position, radarAltM, target.position.lat, target.position.lng, targetAltM, grid)) {
        continue
      }
    }
    if (dist <= range * RADAR_IDENTIFY_FRACTION) return 'identified'
    best = 'tracked'
  }
  return best
}

function satelliteContactLevel(nation: Nation, unit: Unit, tick: number): VisibilityLevel {
  for (const sat of nation.satellites ?? []) {
    if (sat.type !== 'optical') continue
    if (tick - sat.lastPassTick > DETECTION_FADE_TICKS) continue
    const start = { lat: sat.groundTrack.startLat, lng: sat.groundTrack.startLng }
    const end = { lat: sat.groundTrack.endLat, lng: sat.groundTrack.endLng }
    if (pointToLineDistKm(unit.position, start, end) <= sat.swathWidth_km / 2) return 'tracked'
  }
  return 'detected'
}

function isElintDetected(ownSensorUnits: Unit[], emitter: Unit, sigintMultiplier: number): boolean {
  let radarRange = 0
  for (const s of emitter.sensors) {
    if (s.type === 'radar' && s.range_km > radarRange) radarRange = s.range_km
  }
  if (radarRange <= 0) return false
  const elintRange = radarRange * sigintMultiplier
  for (const own of ownSensorUnits) {
    if (haversine(own.position, emitter.position) <= elintRange) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Event-driven reveals — applied every tick on the tick they happen
// ---------------------------------------------------------------------------

function applyEventReveals(state: GameState): void {
  const tick = state.time.tick
  const events = state.events
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.tick !== tick) break
    if (e.type === 'MISSILE_LAUNCHED') {
      const launcher = state.units.get(e.launcherId)
      if (!launcher) continue
      for (const nation of Object.values(state.nations)) {
        if (nation.id !== launcher.nation) {
          revealContact(state, nation.id as string, launcher, 'tracked')
        }
      }
    } else if (e.type === 'MINE_CONTACT') {
      const minefield = state.units.get(e.minefieldId)
      const target = state.units.get(e.targetId)
      if (minefield && target && target.nation !== minefield.nation) {
        revealContact(state, target.nation as string, minefield, 'identified')
      }
    }
  }
}

function revealContact(state: GameState, observer: string, unit: Unit, level: VisibilityLevel): void {
  const tick = state.time.tick
  state.visibility ??= {}
  const contacts = (state.visibility[observer] ??= {})
  const meta = metaFor(observer)

  const contact = contacts[unit.id]
  if (!contact) {
    contacts[unit.id] = newContact(meta, unit, level, tick)
    return
  }
  const anchor = anchorOf(contact, meta.get(unit.id))
  const floor = decayFloor(unit, contact, anchor)
  let decayed = decayedLevel(anchor, tick - contact.lastSeenTick)
  if (LEVEL_RANK[decayed] < LEVEL_RANK[floor]) decayed = floor
  if (LEVEL_RANK[level] >= LEVEL_RANK[decayed]) {
    refreshContact(contact, meta, unit, level, tick)
  }
}

// ---------------------------------------------------------------------------
// Contact bookkeeping
// ---------------------------------------------------------------------------

function newContact(meta: Map<UnitId, ContactMeta>, unit: Unit, level: VisibilityLevel, tick: number): VisibilityContact {
  const contact: VisibilityContact = {
    level,
    lastSeenTick: tick,
    lastKnownPosition: { ...unit.position },
  }
  setAnchor(meta, unit.id, level)
  contact.pinned = decayFloor(unit, contact, level) !== 'unseen'
  return contact
}

function refreshContact(
  contact: VisibilityContact,
  meta: Map<UnitId, ContactMeta>,
  unit: Unit,
  level: VisibilityLevel,
  tick: number,
): void {
  contact.level = level
  contact.lastSeenTick = tick
  contact.lastKnownPosition = { ...unit.position }
  setAnchor(meta, unit.id, level)
  contact.pinned = decayFloor(unit, contact, level) !== 'unseen'
}

function setAnchor(meta: Map<UnitId, ContactMeta>, unitId: UnitId, level: VisibilityLevel): void {
  const m = meta.get(unitId)
  if (m) m.anchor = level
  else meta.set(unitId, { anchor: level, humintUntil: 0 })
}

function anchorOf(contact: VisibilityContact, m: ContactMeta | undefined): VisibilityLevel {
  // After save/load the meta map is empty — fall back to the loaded level
  return m && m.anchor !== 'unseen' ? m.anchor : contact.level
}

function maxLevel(a: VisibilityLevel, b: VisibilityLevel): VisibilityLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

function decayedLevel(anchor: VisibilityLevel, age: number): VisibilityLevel {
  if (anchor === 'identified') {
    if (age < IDENTIFIED_DECAY_TICKS) return 'identified'
    if (age < IDENTIFIED_DECAY_TICKS + TRACKED_DECAY_TICKS) return 'tracked'
    if (age < IDENTIFIED_DECAY_TICKS + TRACKED_DECAY_TICKS + DETECTED_DECAY_TICKS) return 'detected'
    return 'unseen'
  }
  if (anchor === 'tracked') {
    if (age < TRACKED_DECAY_TICKS) return 'tracked'
    if (age < TRACKED_DECAY_TICKS + DETECTED_DECAY_TICKS) return 'detected'
    return 'unseen'
  }
  if (anchor === 'detected') {
    return age < DETECTED_DECAY_TICKS ? 'detected' : 'unseen'
  }
  return 'unseen'
}

/** Lowest level this contact may decay to — fixed sites don't walk away */
function decayFloor(unit: Unit, contact: VisibilityContact, anchor: VisibilityLevel): VisibilityLevel {
  const everIdentified = contact.level === 'identified' || anchor === 'identified'
  switch (unit.category) {
    case 'airbase':
    case 'naval_base':
      return everIdentified ? 'identified' : 'detected'
    case 'minefield':
      return everIdentified ? 'identified' : 'unseen'
    case 'sam_site': {
      const p = contact.lastKnownPosition
      const moved = unit.position.lng !== p.lng || unit.position.lat !== p.lat
      return moved ? 'unseen' : 'detected'
    }
    default:
      return 'unseen'
  }
}

// ---------------------------------------------------------------------------
// Snapshot queries
// ---------------------------------------------------------------------------

export interface ViewVisibility {
  level: VisibilityLevel
  stale: boolean
  /** Position to show the observer (lastKnownPosition when the live track is lost) */
  position: Position
}

/**
 * How `observer` currently sees `unit`. Returns null when the unit should be excluded
 * from the observer's snapshot entirely (level 'unseen').
 */
export function getViewVisibility(state: GameState, observer: NationId, unit: Unit): ViewVisibility | null {
  if (unit.nation === observer) {
    return { level: 'identified', stale: false, position: unit.position }
  }
  const contact = state.visibility?.[observer as string]?.[unit.id]
  if (!contact || contact.level === 'unseen') return null
  const live = contact.level === 'tracked' || contact.level === 'identified'
  return {
    level: contact.level,
    stale: !live,
    position: live ? unit.position : contact.lastKnownPosition,
  }
}

const CONTACT_NAMES: Record<UnitCategory, string> = {
  airbase: 'Unknown installation',
  naval_base: 'Unknown installation',
  sam_site: 'Unknown emitter',
  missile_battery: 'Unknown vehicle group',
  aircraft: 'Air contact',
  ship: 'Surface contact',
  submarine: 'Submerged contact',
  carrier_group: 'Surface group',
  minefield: 'Suspected minefield',
}

/** Generic display name for a low-confidence contact */
export function contactDisplayName(category: UnitCategory): string {
  return CONTACT_NAMES[category] ?? 'Unknown contact'
}
