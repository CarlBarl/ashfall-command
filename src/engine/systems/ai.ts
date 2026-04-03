import type { GameState, NationId, UnitId } from '@/types/game'
import type { Command } from '@/types/commands'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine } from '../utils/geo'

type AIPhase = 'PEACETIME' | 'ALERT' | 'DEFENSIVE' | 'OFFENSIVE' | 'ATTRITION'

interface AIState {
  phase: AIPhase
  lastRetaliationTick: number
  salvosLaunched: number
  /** Track attacks received to trigger escalation */
  attacksReceived: number
}

const aiStates = new Map<NationId, AIState>()

/** Reset module-level state — must be called on save/load */
export function resetAIState(): void {
  aiStates.clear()
}

function getAIState(nation: NationId): AIState {
  let s = aiStates.get(nation)
  if (!s) {
    s = { phase: 'PEACETIME', lastRetaliationTick: -999, salvosLaunched: 0, attacksReceived: 0 }
    aiStates.set(nation, s)
  }
  return s
}

/** Process AI for all non-player nations. Returns commands to execute. */
export function processAI(state: GameState, rng: SeededRNG): Command[] {
  const commands: Command[] = []

  for (const nation of Object.values(state.nations)) {
    if (nation.id === 'usa') continue // player-controlled

    const ai = getAIState(nation.id)
    const enemyNation: NationId = 'usa'

    // Check for new attacks against this nation
    const newAttacks = state.pendingEvents.filter(e =>
      (e.type === 'MISSILE_IMPACT' && isOwnUnit(state, e.targetId, nation.id)) ||
      (e.type === 'UNIT_DESTROYED' && isOwnUnit(state, e.unitId, nation.id)),
    )

    if (newAttacks.length > 0) {
      ai.attacksReceived += newAttacks.length

      // Auto-declare war when attacked — no nation absorbs strikes without responding
      if (!nation.atWar.includes(enemyNation)) {
        nation.atWar.push(enemyNation)
        state.nations[enemyNation].atWar.push(nation.id)
        state.pendingEvents.push({
          type: 'WAR_DECLARED',
          attacker: nation.id,
          defender: enemyNation,
          tick: state.time.tick,
        })
        state.events.push({
          type: 'WAR_DECLARED',
          attacker: nation.id,
          defender: enemyNation,
          tick: state.time.tick,
        })
      }
    }

    // Phase transitions
    updatePhase(ai, state, nation.id)

    // Generate commands based on phase
    switch (ai.phase) {
      case 'PEACETIME':
        // Do nothing — wait for provocation
        break

      case 'ALERT':
        // Set all units to weapons_free
        for (const unit of state.units.values()) {
          if (unit.nation === nation.id && unit.roe !== 'weapons_free') {
            commands.push({ type: 'SET_ROE', unitId: unit.id, roe: 'weapons_free' })
          }
        }
        break

      case 'DEFENSIVE':
        // Retaliate within 5 minutes of being attacked
        if (ai.attacksReceived > 0 && state.time.tick - ai.lastRetaliationTick > 300) {
          const salvoCommands = generateRetaliatorySalvo(state, nation.id, enemyNation, rng, 'defensive')
          commands.push(...salvoCommands)
          ai.lastRetaliationTick = state.time.tick
          ai.attacksReceived = 0
        }
        break

      case 'OFFENSIVE':
        // Launch salvos every 15 minutes
        if (state.time.tick - ai.lastRetaliationTick > 900) {
          const salvoCommands = generateRetaliatorySalvo(state, nation.id, enemyNation, rng, 'offensive')
          commands.push(...salvoCommands)
          ai.lastRetaliationTick = state.time.tick
          ai.salvosLaunched++
        }
        break

      case 'ATTRITION':
        // Conserve ammo — launch only when accumulating enough for saturation
        if (state.time.tick - ai.lastRetaliationTick > 3600) {
          const salvoCommands = generateRetaliatorySalvo(state, nation.id, enemyNation, rng, 'saturation')
          commands.push(...salvoCommands)
          ai.lastRetaliationTick = state.time.tick
        }
        break
    }
  }

  return commands
}

function updatePhase(ai: AIState, state: GameState, nationId: NationId): void {
  const nation = state.nations[nationId]
  const atWar = nation.atWar.length > 0

  const totalAmmo = getTotalOffensiveAmmo(state, nationId)
  const unitsLost = countDestroyedUnits(state, nationId)

  if (!atWar && ai.attacksReceived === 0) {
    ai.phase = 'PEACETIME'
  } else if (!atWar && ai.attacksReceived > 0) {
    ai.phase = 'ALERT'
  } else if (atWar && ai.salvosLaunched < 2) {
    ai.phase = 'DEFENSIVE'
  } else if (atWar && totalAmmo > 20 && unitsLost < 10) {
    ai.phase = 'OFFENSIVE'
  } else {
    ai.phase = 'ATTRITION'
  }
}

function generateRetaliatorySalvo(
  state: GameState,
  nationId: NationId,
  enemyNation: NationId,
  rng: SeededRNG,
  mode: 'defensive' | 'offensive' | 'saturation',
): Command[] {
  const commands: Command[] = []

  // Find launchers with offensive missiles
  const launchers = Array.from(state.units.values()).filter(u =>
    u.nation === nationId &&
    u.status !== 'destroyed' &&
    u.weapons.some(w => {
      const spec = weaponSpecs[w.weaponId]
      return spec && spec.type !== 'sam' && w.count > 0
    }),
  )

  // Find enemy targets, prioritized
  const targets = Array.from(state.units.values())
    .filter(u => u.nation === enemyNation && u.status !== 'destroyed')
    .sort((a, b) => targetPriority(b) - targetPriority(a))

  if (targets.length === 0 || launchers.length === 0) return commands

  // Determine salvo size based on mode
  let maxLaunches: number
  switch (mode) {
    case 'defensive': maxLaunches = 4; break
    case 'offensive': maxLaunches = 8; break
    case 'saturation': maxLaunches = 20; break
  }

  let launched = 0
  for (const launcher of launchers) {
    if (launched >= maxLaunches) break

    for (const loadout of launcher.weapons) {
      if (launched >= maxLaunches) break

      const spec = weaponSpecs[loadout.weaponId]
      if (!spec || spec.type === 'sam' || loadout.count <= 0) continue

      // Pick a target in range
      const target = targets.find(t => {
        const dist = haversine(launcher.position, t.position)
        return dist <= spec.range_km
      })

      if (!target) continue

      // Launch 1-3 missiles at this target
      const count = Math.min(loadout.count, rng.int(1, 3), maxLaunches - launched)
      for (let i = 0; i < count; i++) {
        commands.push({
          type: 'LAUNCH_MISSILE',
          launcherId: launcher.id,
          weaponId: loadout.weaponId,
          targetId: target.id,
        })
        launched++
      }
    }
  }

  return commands
}

function targetPriority(unit: { category: string }): number {
  // Higher = more valuable target
  switch (unit.category) {
    case 'airbase': return 10
    case 'carrier_group': return 9
    case 'sam_site': return 8
    case 'ship': return 6
    case 'missile_battery': return 5
    case 'naval_base': return 4
    case 'submarine': return 3
    default: return 1
  }
}

function isOwnUnit(state: GameState, unitId: UnitId, nationId: NationId): boolean {
  const unit = state.units.get(unitId)
  return unit?.nation === nationId
}

function getTotalOffensiveAmmo(state: GameState, nationId: NationId): number {
  let total = 0
  for (const unit of state.units.values()) {
    if (unit.nation !== nationId || unit.status === 'destroyed') continue
    for (const w of unit.weapons) {
      const spec = weaponSpecs[w.weaponId]
      if (spec && spec.type !== 'sam') total += w.count
    }
  }
  return total
}

function countDestroyedUnits(state: GameState, nationId: NationId): number {
  let count = 0
  for (const unit of state.units.values()) {
    if (unit.nation === nationId && unit.status === 'destroyed') count++
  }
  return count
}
