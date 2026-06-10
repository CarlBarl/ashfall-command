import type { GameState, NationId, Position, Unit, UnitCategory, VisibilityLevel } from '@/types/game'
import type { ElevationGrid } from './elevation'
import type { SensorNetwork } from './sensor-network'
import type { EspionageResult } from './espionage'

/**
 * Fog of war. Maintains state.visibility — per observing nation, a contact map over
 * enemy units — from radar coverage, satellites, HUMINT, ELINT and combat events.
 * Design: docs/plans/game-loop-v2.md §1.
 *
 * STUB: not yet implemented — getViewVisibility currently reports everything as
 * identified, which preserves pre-fog behavior.
 */
export function processVisibility(
  _state: GameState,
  _network: SensorNetwork | null,
  _espionage: EspionageResult | null,
  _grid: ElevationGrid | null,
): void {
  // implemented by the visibility work package
}

export function resetVisibilityState(): void {
  // module-level state reset (worker reuses one engine across games)
}

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
  if (!contact) {
    // STUB default: full knowledge until processVisibility is implemented
    return { level: 'identified', stale: false, position: unit.position }
  }
  if (contact.level === 'unseen') return null
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
