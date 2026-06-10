import type { GameState, NationId } from '@/types/game'
import type { ObjectiveStatus } from '@/types/view'

/**
 * War support (political will) and war termination: drains from losses, duration and
 * economic pain; capitulation at 0; ceasefire offers/acceptance; scenario objectives;
 * the GameOverReport for the debrief screen. Design: docs/plans/game-loop-v2.md §2.
 *
 * STUB: not yet implemented — war support stays at 100 and wars never end on their own.
 */
export function processWarSupport(_state: GameState): void {
  // implemented by the war-support work package
}

export function resetWarSupportState(): void {
  // module-level state reset (worker reuses one engine across games)
}

/** Player (or AI) puts a ceasefire offer on the table; the other side decides */
export function offerCeasefire(_state: GameState, _by: NationId, _target: NationId): void {
  // implemented by the war-support work package
}

/** Accept a standing offer (or mutually stand down) — ends the war between the two nations */
export function acceptCeasefire(state: GameState, by: NationId, target: NationId): void {
  const a = state.nations[by as string]
  const b = state.nations[target as string]
  if (!a || !b) return
  a.atWar = a.atWar.filter(n => n !== target)
  b.atWar = b.atWar.filter(n => n !== by)
}

/** Player gives up — immediate defeat */
export function resign(_state: GameState): void {
  // implemented by the war-support work package
}

/** Current war support per nation id (defaults to 100 before any war) */
export function getWarSupport(state: GameState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.keys(state.nations)) {
    out[id] = state.warStatus?.[id]?.warSupport ?? 100
  }
  return out
}

/** Scenario objectives for the player's side (empty at peace or until implemented) */
export function getObjectives(_state: GameState): ObjectiveStatus[] {
  return []
}
