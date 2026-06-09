import type { GameState, NationId } from '@/types/game'
import type { Command } from '@/types/commands'
import type { SeededRNG } from '../utils/rng'
import { weaponSpecs } from '@/data/weapons/missiles'
import { haversine, bearing } from '../utils/geo'
import { processDroneSwarm, getDroneAmmo } from './drone-ai'

type AIPhase = 'PEACETIME' | 'ALERT' | 'DEFENSIVE' | 'OFFENSIVE' | 'ATTRITION'

/** Ticks spent in ALERT (setting units weapons_free) before DEFENSIVE operations begin */
const ALERT_DURATION_TICKS = 60
/** At war this long without escalating via retaliation → initiate OFFENSIVE anyway */
const OFFENSIVE_AFTER_WAR_TICKS = 1800

interface AIState {
  phase: AIPhase
  lastRetaliationTick: number
  salvosLaunched: number
  /** Track attacks received to trigger escalation */
  attacksReceived: number
  /** Watermark into GameState.attackCounters — only deltas count as new attacks */
  lastSeenAttackCounter: number
  /** Tick when this nation entered its current war (-1 = at peace) */
  warStartTick: number
}

const aiStates = new Map<NationId, AIState>()

/** Reset module-level state — must be called on save/load */
export function resetAIState(): void {
  aiStates.clear()
}

function getAIState(nation: NationId, state: GameState): AIState {
  let s = aiStates.get(nation)
  if (!s) {
    s = {
      phase: 'PEACETIME',
      lastRetaliationTick: -999,
      salvosLaunched: 0,
      attacksReceived: 0,
      // Seed at the current counter so a loaded save doesn't replay its whole attack history
      lastSeenAttackCounter: state.attackCounters?.[nation] ?? 0,
      warStartTick: -1,
    }
    aiStates.set(nation, s)
  }
  return s
}

/** Orient sector-limited SAM radars toward the nearest enemy concentration */
export function orientSAMRadars(state: GameState, excludeNation?: NationId): void {
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (excludeNation && unit.nation === excludeNation) continue

    // Only orient units with sector-limited radar
    const radar = unit.sensors.find(s => s.type === 'radar' && s.sector_deg != null && s.sector_deg < 360)
    if (!radar) continue

    // Find centroid of enemy units as threat axis
    let sumLat = 0, sumLng = 0, count = 0
    for (const other of state.units.values()) {
      if (other.nation === unit.nation) continue
      if (other.status === 'destroyed') continue
      sumLat += other.position.lat
      sumLng += other.position.lng
      count++
    }

    if (count === 0) continue

    const enemyCentroid = { lat: sumLat / count, lng: sumLng / count }
    unit.heading = bearing(unit.position, enemyCentroid)
  }
}

/** Process AI for all non-player nations. Returns commands to execute. */
export function processAI(state: GameState, rng: SeededRNG): Command[] {
  const commands: Command[] = []

  // Re-orient enemy SAMs periodically (initial orient done in game-engine init)
  if (state.time.tick % 60 === 0) {
    orientSAMRadars(state, state.playerNation)
  }

  for (const nation of Object.values(state.nations)) {
    if (nation.id === state.playerNation) continue // player-controlled

    const ai = getAIState(nation.id, state)
    const enemyNation = state.playerNation

    // New attacks since last tick — counter delta, NOT pendingEvents (that's the UI delivery
    // buffer, drained on poll cadence, so reading it re-counts events and breaks determinism)
    const counter = state.attackCounters?.[nation.id] ?? 0
    const newAttacks = counter - ai.lastSeenAttackCounter
    ai.lastSeenAttackCounter = counter

    if (newAttacks > 0) {
      ai.attacksReceived += newAttacks

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
          // Accompany with drone swarm for saturation effect
          if (getDroneAmmo(state, nation.id) > 10) {
            const droneCommands = processDroneSwarm(state, nation.id, enemyNation, rng, 'defensive')
            commands.push(...droneCommands)
          }
          ai.lastRetaliationTick = state.time.tick
          ai.attacksReceived = 0
          // Retaliation counts toward escalation — without this OFFENSIVE is unreachable
          if (salvoCommands.length > 0) ai.salvosLaunched++
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
        // Drone swarms — supplement ballistic salvos with cheap drones
        if (getDroneAmmo(state, nation.id) > 20) {
          const droneCommands = processDroneSwarm(state, nation.id, enemyNation, rng, 'offensive')
          commands.push(...droneCommands)
        }
        break

      case 'ATTRITION':
        // Conserve ballistic ammo — launch only for saturation
        if (state.time.tick - ai.lastRetaliationTick > 3600) {
          const salvoCommands = generateRetaliatorySalvo(state, nation.id, enemyNation, rng, 'saturation')
          commands.push(...salvoCommands)
          ai.lastRetaliationTick = state.time.tick
        }
        // Rely heavily on drones in attrition phase — cheap and plentiful
        if (getDroneAmmo(state, nation.id) > 10) {
          const droneCommands = processDroneSwarm(state, nation.id, enemyNation, rng, 'saturation')
          commands.push(...droneCommands)
        }
        break
    }
  }

  return commands
}

function updatePhase(ai: AIState, state: GameState, nationId: NationId): void {
  const nation = state.nations[nationId]
  const atWar = nation.atWar.length > 0

  if (!atWar) {
    ai.warStartTick = -1
    ai.salvosLaunched = 0
    ai.phase = ai.attacksReceived > 0 ? 'ALERT' : 'PEACETIME'
    return
  }

  if (ai.warStartTick < 0) ai.warStartTick = state.time.tick
  const ticksAtWar = state.time.tick - ai.warStartTick

  const totalAmmo = getTotalOffensiveAmmo(state, nationId)
  const unitsLost = countDestroyedUnits(state, nationId)

  if (totalAmmo <= 20 || unitsLost >= 10) {
    ai.phase = 'ATTRITION'
  } else if (ai.salvosLaunched >= 2 || ticksAtWar > OFFENSIVE_AFTER_WAR_TICKS) {
    ai.phase = 'OFFENSIVE'
  } else if (ticksAtWar > ALERT_DURATION_TICKS) {
    ai.phase = 'DEFENSIVE'
  } else {
    // War just started — go weapons_free across the force before operations
    ai.phase = 'ALERT'
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
