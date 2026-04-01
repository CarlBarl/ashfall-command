/**
 * Autonomous offensive AI for units with weapons_free ROE.
 * Generic — works for any nation, any unit type with offensive weapons.
 * When a unit is set to weapons_free and its nation is at war,
 * it autonomously selects and fires at high-priority enemy targets in range.
 */

import type { GameState, NationId, UnitId } from '@/types/game'
import type { Command } from '@/types/commands'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine } from '../utils/geo'

const FIRE_COOLDOWN_TICKS = 300 // 5 minutes between autonomous salvos
const lastFireTick = new Map<UnitId, number>()

const CATEGORY_PRIORITY: Record<string, number> = {
  carrier_group: 10,
  airbase: 9,
  naval_base: 8,
  sam_site: 7,
  missile_battery: 6,
  ship: 5,
  submarine: 4,
  aircraft: 3,
}

/** Process autonomous offensive fire for all weapons_free units at war */
export function processFriendlyAI(state: GameState, rng: SeededRNG): Command[] {
  const commands: Command[] = []

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.roe !== 'weapons_free') continue

    // Must be at war
    const nation = state.nations[unit.nation]
    if (!nation || nation.atWar.length === 0) continue

    // Cooldown check
    const lastFire = lastFireTick.get(unit.id) ?? -FIRE_COOLDOWN_TICKS
    if (state.time.tick - lastFire < FIRE_COOLDOWN_TICKS) continue

    // Find offensive weapons with ammo
    const offensiveWeapons = unit.weapons.filter(w => {
      const spec = weaponSpecs[w.weaponId]
      return spec && spec.type !== 'sam' && w.count > 0
    })

    if (offensiveWeapons.length === 0) continue

    // Find enemy nations
    const enemyNations = new Set<NationId>(nation.atWar as NationId[])

    // Find all enemy targets, sorted by priority
    const enemies = Array.from(state.units.values())
      .filter(u => enemyNations.has(u.nation) && u.status !== 'destroyed')
      .sort((a, b) => (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0))

    if (enemies.length === 0) continue

    // For each offensive weapon, find a target in range
    let fired = false
    for (const loadout of offensiveWeapons) {
      if (fired) break // one salvo per cooldown cycle

      const spec = weaponSpecs[loadout.weaponId]
      if (!spec) continue

      // Find best target in range
      const target = enemies.find(e => {
        const dist = haversine(unit.position, e.position)
        return dist <= spec.range_km
      })

      if (!target) continue

      // Fire 1-2 missiles
      const salvoSize = Math.min(loadout.count, rng.int(1, 2))
      for (let i = 0; i < salvoSize; i++) {
        commands.push({
          type: 'LAUNCH_MISSILE',
          launcherId: unit.id,
          weaponId: loadout.weaponId,
          targetId: target.id,
        })
      }

      lastFireTick.set(unit.id, state.time.tick)
      fired = true
    }
  }

  return commands
}
