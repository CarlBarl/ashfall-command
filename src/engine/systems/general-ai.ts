/**
 * General AI — executes player/AI orders for army group generals.
 * Runs every 12 ticks (= 12 hours in WW2 mode).
 *
 * Each general evaluates their currentOrder and issues stance/movement
 * commands to divisions in their army group.
 */

import type { GameState } from '@/types/game'
import type {
  GroundUnit,
  General,
  ArmyGroup,
  GeneralReport,
} from '@/types/ground'
import type { GameEvent } from '@/types/game'
import type { SeededRNG } from '@/engine/utils/rng'

const TICKS_PER_CYCLE = 12
const REPORT_INTERVAL = 24

// ── Module state (must reset on save/load) ────────────────────

// No persistent module state needed for now — generals carry their own state.
// Keeping the pattern for consistency with other systems.

/** Reset module-level state — must be called on save/load */
export function resetGeneralAIState(): void {
  // Reserved for future module-level caches
}

// ── Extended state accessors ──────────────────────────────────

function getGroundUnits(state: GameState): GroundUnit[] {
  const map = state.groundUnits
  return map ? Array.from(map.values()) : []
}

function getGenerals(state: GameState): General[] {
  const map = state.generals
  return map ? Array.from(map.values()) : []
}

function getArmyGroups(state: GameState): ArmyGroup[] {
  const map = state.armyGroups
  return map ? Array.from(map.values()) : []
}

// ── Main processing ───────────────────────────────────────────

export function processGeneralAI(state: GameState, rng: SeededRNG): void {
  if (state.time.tick % TICKS_PER_CYCLE !== 0) return

  const units = getGroundUnits(state)
  const generals = getGenerals(state)
  const armyGroups = getArmyGroups(state)

  if (units.length === 0 || generals.length === 0) return

  for (const general of generals) {
    if (!general.currentOrder) continue

    const armyGroup = armyGroups.find(ag => ag.id === general.armyGroupId)
    if (!armyGroup) continue

    const divisions = units.filter(u =>
      armyGroup.divisionIds.includes(u.id) &&
      u.status !== 'destroyed' &&
      u.status !== 'routing',
    )

    if (divisions.length === 0) continue

    switch (general.currentOrder.type) {
      case 'ADVANCE':
        executeAdvance(general, armyGroup, divisions, units, rng)
        break
      case 'HOLD_LINE':
        executeHoldLine(general, armyGroup, divisions)
        break
      case 'ENCIRCLE':
        executeEncircle(general, armyGroup, divisions, units, rng)
        break
      case 'WITHDRAW':
        executeWithdraw(divisions)
        break
      case 'RESERVE':
        executeReserve(divisions)
        break
    }

    // Generate reports every 24 ticks
    if (state.time.tick - general.lastReportTick >= REPORT_INTERVAL) {
      const report = generateReport(general, armyGroup, divisions, units, state.time.tick)
      general.pendingReports.push(report)
      general.lastReportTick = state.time.tick

      const event: GameEvent = {
        type: 'GENERAL_REPORT',
        generalId: general.id,
        report,
        tick: state.time.tick,
      }
      state.pendingEvents.push(event)
    }
  }
}

// ── Order execution ───────────────────────────────────────────

function executeAdvance(
  general: General,
  armyGroup: ArmyGroup,
  divisions: GroundUnit[],
  allUnits: GroundUnit[],
  _rng: SeededRNG,
): void {
  const sectorStart = armyGroup.sectorStartCol
  const sectorEnd = armyGroup.sectorEndCol

  // Find enemy units in this sector
  const enemyInSector = allUnits.filter(u =>
    u.nation !== general.nation &&
    u.status !== 'destroyed' &&
    u.gridCol >= sectorStart &&
    u.gridCol <= sectorEnd,
  )

  // Evaluate enemy strength per column
  const enemyStrengthByCol = new Map<number, number>()
  for (let col = sectorStart; col <= sectorEnd; col++) {
    const colEnemies = enemyInSector.filter(e => e.gridCol === col)
    const totalStrength = colEnemies.reduce((sum, e) => sum + e.strength * e.defense, 0)
    enemyStrengthByCol.set(col, totalStrength)
  }

  // Find weakest enemy column (only columns with actual enemy presence)
  let weakestCol = sectorStart
  let weakestStrength = Infinity
  let hasEnemyPresence = false
  for (const [col, strength] of enemyStrengthByCol) {
    if (strength > 0 && strength < weakestStrength) {
      weakestStrength = strength
      weakestCol = col
      hasEnemyPresence = true
    }
  }

  // If no enemy in sector, pick middle column to advance toward
  if (!hasEnemyPresence) {
    weakestCol = Math.floor((sectorStart + sectorEnd) / 2)
    weakestStrength = 0
  }

  // Calculate friendly strength
  const friendlyStrength = divisions.reduce((sum, d) => sum + d.strength * d.softAttack, 0)

  // Total enemy strength in the sector — used for attack ratio assessment
  const totalEnemyStrength = enemyInSector.reduce((sum, e) => sum + e.strength * e.defense, 0)

  // Determine required attack ratio based on general personality
  let requiredRatio: number
  if (general.traits.aggression > 6) {
    requiredRatio = 1.5 // Aggressive: attack at 1.5:1
  } else if (general.traits.caution > 6) {
    requiredRatio = 3.0 // Cautious: need 3:1 advantage
  } else {
    requiredRatio = 2.0 // Balanced: 2:1
  }

  // Use total sector strength for ratio assessment (not just weakest column)
  const actualRatio = totalEnemyStrength > 0 ? friendlyStrength / totalEnemyStrength : Infinity

  if (actualRatio >= requiredRatio) {
    // Attack! Concentrate at weak point
    for (const div of divisions) {
      div.stance = 'attack'
      // Move toward weakest column
      if (div.gridCol < weakestCol) div.gridCol++
      else if (div.gridCol > weakestCol) div.gridCol--
    }
  } else {
    // Not enough advantage — hold and wait
    for (const div of divisions) {
      div.stance = 'defend'
    }
  }
}

function executeHoldLine(
  _general: General,
  armyGroup: ArmyGroup,
  divisions: GroundUnit[],
): void {
  const sectorWidth = armyGroup.sectorEndCol - armyGroup.sectorStartCol + 1
  const divsPerCol = Math.max(1, Math.ceil(divisions.length / sectorWidth))

  // Distribute evenly across sector
  let divIndex = 0
  for (let col = armyGroup.sectorStartCol; col <= armyGroup.sectorEndCol && divIndex < divisions.length; col++) {
    for (let i = 0; i < divsPerCol && divIndex < divisions.length; i++) {
      divisions[divIndex].gridCol = col
      divisions[divIndex].stance = 'defend'
      divIndex++
    }
  }

  // Build entrenchment
  for (const div of divisions) {
    div.entrenched = Math.min(100, div.entrenched + 5)
  }
}

function executeEncircle(
  general: General,
  armyGroup: ArmyGroup,
  divisions: GroundUnit[],
  allUnits: GroundUnit[],
  _rng: SeededRNG,
): void {
  const sectorStart = armyGroup.sectorStartCol
  const sectorEnd = armyGroup.sectorEndCol
  // ENCIRCLE order has targetCol/targetRow
  const targetCol = (general.currentOrder?.type === 'ENCIRCLE' ? general.currentOrder.targetCol : undefined) ?? Math.floor((sectorStart + sectorEnd) / 2)

  // Check local superiority
  const enemyInSector = allUnits.filter(u =>
    u.nation !== general.nation &&
    u.status !== 'destroyed' &&
    u.gridCol >= sectorStart &&
    u.gridCol <= sectorEnd,
  )
  const enemyStrength = enemyInSector.reduce((sum, e) => sum + e.strength, 0)
  const friendlyStrength = divisions.reduce((sum, d) => sum + d.strength, 0)

  if (friendlyStrength < enemyStrength * 2) {
    // Not enough superiority — fall back to hold line
    for (const div of divisions) {
      div.stance = 'defend'
    }
    return
  }

  // Split forces into two prongs
  const halfPoint = Math.floor(divisions.length / 2)
  const leftProng = divisions.slice(0, halfPoint)
  const rightProng = divisions.slice(halfPoint)

  // Left prong goes left of target
  for (const div of leftProng) {
    div.stance = 'attack'
    if (div.gridCol > targetCol - 1) div.gridCol--
  }

  // Right prong goes right of target
  for (const div of rightProng) {
    div.stance = 'attack'
    if (div.gridCol < targetCol + 1) div.gridCol++
  }
}

function executeWithdraw(divisions: GroundUnit[]): void {
  // Find the maximum row (front line)
  const maxRow = Math.max(...divisions.map(d => d.gridRow))

  for (const div of divisions) {
    if (div.gridRow === maxRow) {
      // Front-line units — they're the ones withdrawing
      div.gridRow = Math.max(0, div.gridRow - 1)
      div.stance = 'retreat'
    } else {
      // Rear units — serve as rearguard
      div.stance = 'defend'
    }
  }
}

function executeReserve(divisions: GroundUnit[]): void {
  for (const div of divisions) {
    div.stance = 'reserve'
  }
}

// ── Reporting ─────────────────────────────────────────────────

function generateReport(
  general: General,
  armyGroup: ArmyGroup,
  divisions: GroundUnit[],
  allUnits: GroundUnit[],
  tick: number,
): GeneralReport {
  const sectorStart = armyGroup.sectorStartCol
  const sectorEnd = armyGroup.sectorEndCol

  const friendlyStrength = divisions.reduce((sum, d) => sum + d.strength, 0)

  const enemyInSector = allUnits.filter(u =>
    u.nation !== general.nation &&
    u.status !== 'destroyed' &&
    u.gridCol >= sectorStart &&
    u.gridCol <= sectorEnd,
  )
  const enemyStrength = enemyInSector.reduce((sum, e) => sum + e.strength, 0)

  const ratio = enemyStrength > 0 ? friendlyStrength / enemyStrength : Infinity
  let reportType: GeneralReport['type'] = 'progress'
  let severity: GeneralReport['severity'] = 'info'
  if (ratio > 3) {
    reportType = 'breakthrough'
  } else if (ratio < 0.5) {
    reportType = 'retreat'
    severity = 'warning'
  } else if (ratio < 1.0) {
    reportType = 'stalled'
    severity = 'warning'
  }

  const orderDesc = general.currentOrder?.type ?? 'NO ORDERS'
  const message = `${general.name}: ${divisions.length} divs, strength ${friendlyStrength} vs enemy ${enemyStrength} in sector ${sectorStart}-${sectorEnd}. Executing ${orderDesc}. Ratio ${ratio === Infinity ? 'INF' : ratio.toFixed(1)}:1.`

  return {
    tick,
    type: reportType,
    message,
    severity,
  }
}
