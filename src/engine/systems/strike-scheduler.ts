import type { GameState, ScheduledLaunch, TrackQuality } from '@/types/game'
import type { Command } from '@/types/commands'

type LaunchSalvoCommand = Extract<Command, { type: 'LAUNCH_SALVO' }>

/**
 * Queue every round of a delayed salvo (LAUNCH_SALVO with delayTicks > 0) —
 * the TOT path. Unlike the spacing-only path NOTHING fires at command time:
 * war declaration and launch events happen when each round's dueTick arrives
 * (fireScheduledLaunch declares war on the first successful round). The leak
 * roll already happened at command time; rounds reuse its result.
 */
export function scheduleSalvo(
  state: GameState,
  cmd: LaunchSalvoCommand,
  compromised: boolean,
  trackQuality?: TrackQuality,
): void {
  if (cmd.count <= 0) return
  // A dueTick in the past would fire the backlog all at once next tick
  const delay = Math.max(1, cmd.delayTicks ?? 1)
  const spacing = cmd.spacingTicks ?? 0
  state.scheduledLaunches ??= []
  for (let i = 0; i < cmd.count; i++) {
    state.scheduledLaunches.push({
      dueTick: state.time.tick + delay + i * spacing,
      launcherId: cmd.launcherId,
      weaponId: cmd.weaponId,
      targetId: cmd.targetId,
      waypoints: cmd.waypoints,
      trackQuality,
      compromised,
    })
  }
}

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
