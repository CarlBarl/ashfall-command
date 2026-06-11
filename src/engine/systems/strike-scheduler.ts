import type { GameState, ScheduledLaunch } from '@/types/game'

/**
 * Fires salvo rounds whose dueTick has arrived. Runs inside tick(), so a paused
 * game (speed 0 — the loop never ticks) cannot fire scheduled rounds. All state
 * lives on GameState, so save/load and scenario init need no extra plumbing.
 */
export function processScheduledLaunches(
  state: GameState,
  launchFn: (entry: ScheduledLaunch) => void,
): void {
  const pending = state.scheduledLaunches
  if (!pending || pending.length === 0) return

  const tick = state.time.tick
  const due = pending.filter((e) => e.dueTick <= tick)
  if (due.length === 0) return

  state.scheduledLaunches = pending.filter((e) => e.dueTick > tick)
  for (const entry of due) launchFn(entry)
}
