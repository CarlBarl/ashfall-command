/**
 * Auto-engagement doctrine — units of any nation fire on enemy CONTACTS, not ground truth.
 *
 * A unit may engage a target only with fire-control quality from getFireControlQuality:
 * its own radar holds the target ('own'), or a live nation-level track exists and the
 * unit is datalink-connected ('datalink' — AWACS/hub relays the picture). Datalink shots
 * carry a miss chance against moving targets (combat.ts).
 *
 * ROE: weapons_free engages any valid track in weapon range; weapons_tight only targets
 * within the self-defense bubble around the unit or a nearby friendly; hold_fire never.
 */

import type { GameState, NationId, Unit, UnitCategory, UnitId } from '@/types/game'
import type { Command } from '@/types/commands'
import type { ElevationGrid } from './elevation'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine } from '../utils/geo'
import { getFireControlQuality } from './visibility'

const FIRE_COOLDOWN_TICKS = 90
const SELF_DEFENSE_RADIUS_KM = 75
/** A target already salvoed by the nation gets a grace period before the next salvo */
const TARGET_REENGAGE_TICKS = 120

const lastFireTick = new Map<UnitId, number>()
const lastTargetSalvoTick = new Map<string, number>() // `${nation}:${targetId}`

/** Reset module-level state — must be called on save/load */
export function resetFriendlyAIState(): void {
  lastFireTick.clear()
  lastTargetSalvoTick.clear()
}

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

// Excluded from autonomous fire: SAMs are combat.ts's job; strategic land-attack
// (cruise/ballistic) is the player's verb via the strike panel; loitering munitions
// belong to drone-ai's swarm logic (its cooldowns + never-empty rules).
const EXCLUDED_WEAPON_TYPES = new Set(['sam', 'cruise_missile', 'ballistic_missile', 'loitering_munition'])

/** Anti-ship missiles only work against things that float */
const ASHM_TARGETS = new Set<UnitCategory>(['ship', 'carrier_group', 'submarine'])

function validTargetForWeapon(weaponType: string, category: UnitCategory): boolean {
  if (weaponType === 'ashm') return ASHM_TARGETS.has(category)
  return category !== 'aircraft' // generic tactical weapons can't hit fast movers
}

function salvoSizeFor(category: UnitCategory): number {
  switch (category) {
    case 'carrier_group': return 4
    case 'ship': return 2
    case 'submarine': return 1
    default: return 2
  }
}

/** Process autonomous engagement for all units at war (weapons_free or weapons_tight) */
export function processFriendlyAI(state: GameState, _rng: SeededRNG, grid?: ElevationGrid | null): Command[] {
  const commands: Command[] = []
  const tick = state.time.tick

  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.roe === 'hold_fire') continue
    // launchMissile rejects non-deployed launchers — skip them so the cooldown isn't burned for nothing
    if (unit.readiness && unit.readiness !== 'deployed') continue

    const nation = state.nations[unit.nation]
    if (!nation || nation.atWar.length === 0) continue

    const lastFire = lastFireTick.get(unit.id) ?? -FIRE_COOLDOWN_TICKS
    if (tick - lastFire < FIRE_COOLDOWN_TICKS) continue

    const offensiveWeapons = unit.weapons.filter(w => {
      const spec = weaponSpecs[w.weaponId]
      return spec && !EXCLUDED_WEAPON_TYPES.has(spec.type) && w.count > 0
    })
    if (offensiveWeapons.length === 0) continue

    const enemyNations = new Set<NationId>(nation.atWar as NationId[])

    const candidates = Array.from(state.units.values())
      .filter(u => enemyNations.has(u.nation) && u.status !== 'destroyed')
      .sort((a, b) => (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0))
    if (candidates.length === 0) continue

    let fired = false
    for (const loadout of offensiveWeapons) {
      if (fired) break
      const spec = weaponSpecs[loadout.weaponId]
      if (!spec) continue

      for (const target of candidates) {
        if (!validTargetForWeapon(spec.type, target.category)) continue

        const dist = haversine(unit.position, target.position)
        if (dist > spec.range_km) continue

        if (unit.roe === 'weapons_tight' && !isSelfDefense(state, unit, target)) continue

        // Nation-level overkill guard — don't have every ship dump at the same contact
        const salvoKey = `${unit.nation}:${target.id}`
        const lastSalvo = lastTargetSalvoTick.get(salvoKey) ?? -TARGET_REENGAGE_TICKS
        if (tick - lastSalvo < TARGET_REENGAGE_TICKS) continue

        const quality = getFireControlQuality(state, unit, target, grid ?? null)
        if (!quality) continue

        const salvoSize = Math.min(loadout.count, salvoSizeFor(target.category))
        for (let i = 0; i < salvoSize; i++) {
          commands.push({
            type: 'LAUNCH_MISSILE',
            launcherId: unit.id,
            weaponId: loadout.weaponId,
            targetId: target.id,
            trackQuality: quality,
          })
        }

        state.events.push({
          type: 'AUTO_ENGAGEMENT',
          unitId: unit.id,
          targetId: target.id,
          weaponName: spec.name,
          count: salvoSize,
          quality,
          tick,
        })
        state.pendingEvents.push(state.events[state.events.length - 1])

        lastFireTick.set(unit.id, tick)
        lastTargetSalvoTick.set(salvoKey, tick)
        fired = true
        break
      }
    }
  }

  return commands
}

/** weapons_tight: only engage targets near the unit itself or a nearby friendly */
function isSelfDefense(state: GameState, unit: Unit, target: Unit): boolean {
  if (haversine(unit.position, target.position) <= SELF_DEFENSE_RADIUS_KM) return true
  for (const friendly of state.units.values()) {
    if (friendly.nation !== unit.nation || friendly.status === 'destroyed') continue
    if (haversine(friendly.position, target.position) <= SELF_DEFENSE_RADIUS_KM &&
        haversine(unit.position, friendly.position) <= SELF_DEFENSE_RADIUS_KM * 2) {
      return true
    }
  }
  return false
}
