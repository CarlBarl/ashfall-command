import type { GameState, NationId, UnitId } from '@/types/game'
import type { Command } from '@/types/commands'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine } from '../utils/geo'

// ═══════════════════════════════════════════════
//  Module-level state — must be resettable for save/load
// ═══════════════════════════════════════════════

/** Tracks last drone launch tick per nation to enforce cooldowns */
const lastLaunchTick = new Map<NationId, number>()

/** Minimum seconds between drone swarm launches */
const SWARM_COOLDOWN_SEC = 600 // 10 minutes

/** Reset all module-level state — call on save/load */
export function resetDroneAIState(): void {
  lastLaunchTick.clear()
}

// ═══════════════════════════════════════════════
//  Target priority for drone strikes
// ═══════════════════════════════════════════════

function droneTargetPriority(category: string): number {
  switch (category) {
    case 'airbase': return 10
    case 'carrier_group': return 9
    case 'sam_site': return 8
    case 'ship': return 6
    case 'missile_battery': return 5
    case 'naval_base': return 4
    default: return 1
  }
}

// ═══════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════

/**
 * Count total loitering munition ammo across all units of a nation.
 * Useful for AI phase decisions and HUD displays.
 */
export function getDroneAmmo(state: GameState, nationId: NationId): number {
  let total = 0
  for (const unit of state.units.values()) {
    if (unit.nation !== nationId || unit.status === 'destroyed') continue
    for (const w of unit.weapons) {
      const spec = weaponSpecs[w.weaponId]
      if (spec?.type === 'loitering_munition' && w.count > 0) {
        total += w.count
      }
    }
  }
  return total
}

/**
 * Process drone swarm launch logic for a nation.
 *
 * Finds all launchers with loitering munitions, selects high-value
 * enemy targets, and generates LAUNCH_MISSILE commands distributed
 * across multiple launchers (never empties one launcher).
 *
 * @param state - Current game state
 * @param nationId - Nation launching drones
 * @param enemyNation - Target nation
 * @param rng - Seeded RNG for determinism
 * @param mode - Swarm size: defensive (10), offensive (30), saturation (50)
 * @returns Array of LAUNCH_MISSILE commands
 */
export function processDroneSwarm(
  state: GameState,
  nationId: NationId,
  enemyNation: NationId,
  rng: SeededRNG,
  mode: 'defensive' | 'offensive' | 'saturation',
): Command[] {
  // Enforce cooldown between swarm launches
  const lastTick = lastLaunchTick.get(nationId) ?? -Infinity
  if (state.time.tick - lastTick < SWARM_COOLDOWN_SEC) {
    return []
  }

  // Find all launchers with loitering munition weapons and available ammo
  const launchers = findDroneLaunchers(state, nationId)
  if (launchers.length === 0) return []

  // Find and prioritize enemy targets
  const targets = findPrioritizedTargets(state, enemyNation)
  if (targets.length === 0) return []

  // Determine swarm size based on mode
  const maxDrones = getSwarmSize(mode)

  // Generate launch commands, distributing across launchers
  const commands = allocateDrones(launchers, targets, maxDrones, rng)

  if (commands.length > 0) {
    lastLaunchTick.set(nationId, state.time.tick)
  }

  return commands
}

// ═══════════════════════════════════════════════
//  Internal helpers
// ═══════════════════════════════════════════════

interface DroneLauncher {
  unitId: UnitId
  position: { lng: number; lat: number }
  weapons: Array<{
    weaponId: string
    count: number
    range_km: number
  }>
}

interface PrioritizedTarget {
  unitId: UnitId
  position: { lng: number; lat: number }
  priority: number
  category: string
}

function findDroneLaunchers(state: GameState, nationId: NationId): DroneLauncher[] {
  const launchers: DroneLauncher[] = []

  for (const unit of state.units.values()) {
    if (unit.nation !== nationId || unit.status === 'destroyed') continue

    const droneWeapons: DroneLauncher['weapons'] = []
    for (const w of unit.weapons) {
      const spec = weaponSpecs[w.weaponId]
      if (spec?.type === 'loitering_munition' && w.count > 0) {
        droneWeapons.push({
          weaponId: w.weaponId,
          count: w.count,
          range_km: spec.range_km,
        })
      }
    }

    if (droneWeapons.length > 0) {
      launchers.push({
        unitId: unit.id,
        position: unit.position,
        weapons: droneWeapons,
      })
    }
  }

  return launchers
}

function findPrioritizedTargets(state: GameState, enemyNation: NationId): PrioritizedTarget[] {
  const targets: PrioritizedTarget[] = []

  for (const unit of state.units.values()) {
    if (unit.nation !== enemyNation || unit.status === 'destroyed') continue

    targets.push({
      unitId: unit.id,
      position: unit.position,
      priority: droneTargetPriority(unit.category),
      category: unit.category,
    })
  }

  // Sort by priority descending
  targets.sort((a, b) => b.priority - a.priority)
  return targets
}

function getSwarmSize(mode: 'defensive' | 'offensive' | 'saturation'): number {
  switch (mode) {
    case 'defensive': return 10
    case 'offensive': return 30
    case 'saturation': return 50
  }
}

/**
 * Distribute drone launches across launchers and targets.
 *
 * Key design decisions:
 * - Never empty a launcher: leave at least 1 drone per weapon type
 * - Spread across 1-3 targets based on mode (defensive=1, offensive=2-3, saturation=all)
 * - Round-robin across launchers for realistic staggering
 */
function allocateDrones(
  launchers: DroneLauncher[],
  targets: PrioritizedTarget[],
  maxDrones: number,
  rng: SeededRNG,
): Command[] {
  const commands: Command[] = []

  // Determine how many targets to engage
  let targetCount: number
  if (maxDrones <= 10) {
    // Defensive: concentrate on nearest high-value target
    targetCount = 1
  } else if (maxDrones <= 30) {
    // Offensive: spread across 2-3 targets
    targetCount = Math.min(rng.int(2, 3), targets.length)
  } else {
    // Saturation: hit all reachable targets
    targetCount = targets.length
  }

  const selectedTargets = targets.slice(0, targetCount)

  // Calculate drones per target (weighted by priority)
  const totalPriority = selectedTargets.reduce((sum, t) => sum + t.priority, 0)
  const dronesPerTarget = selectedTargets.map(t => ({
    target: t,
    allocation: Math.max(1, Math.round((t.priority / totalPriority) * maxDrones)),
  }))

  // Track remaining ammo per launcher weapon to avoid over-allocation
  // Key: "unitId:weaponId"
  const remainingAmmo = new Map<string, number>()
  for (const launcher of launchers) {
    for (const w of launcher.weapons) {
      remainingAmmo.set(`${launcher.unitId}:${w.weaponId}`, w.count)
    }
  }

  let totalLaunched = 0

  for (const { target, allocation } of dronesPerTarget) {
    let launchedAtTarget = 0

    // Round-robin across launchers
    let launcherIdx = 0
    const maxPasses = launchers.length * 2 // prevent infinite loop

    for (let pass = 0; pass < maxPasses && launchedAtTarget < allocation && totalLaunched < maxDrones; pass++) {
      const launcher = launchers[launcherIdx % launchers.length]
      launcherIdx++

      // Find a weapon on this launcher that can reach the target
      for (const w of launcher.weapons) {
        if (launchedAtTarget >= allocation || totalLaunched >= maxDrones) break

        const dist = haversine(launcher.position, target.position)
        if (dist > w.range_km) continue

        const key = `${launcher.unitId}:${w.weaponId}`
        const remaining = remainingAmmo.get(key) ?? 0

        // Never empty a launcher — leave at least 1
        if (remaining <= 1) continue

        // Launch 1-3 from this launcher per pass (stagger, don't dump)
        const batchSize = Math.min(
          rng.int(1, 3),
          remaining - 1, // preserve at least 1
          allocation - launchedAtTarget,
          maxDrones - totalLaunched,
        )

        for (let i = 0; i < batchSize; i++) {
          commands.push({
            type: 'LAUNCH_MISSILE',
            launcherId: launcher.unitId,
            weaponId: w.weaponId,
            targetId: target.unitId,
          })
          launchedAtTarget++
          totalLaunched++
        }

        remainingAmmo.set(key, remaining - batchSize)
      }
    }
  }

  return commands
}
