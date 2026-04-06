/**
 * Ground Combat System for REALPOLITIK
 *
 * Continuous attrition model: every tick, units in contact deal proportional
 * damage based on their combat power. No CRT dice rolls — outcomes emerge
 * from sustained force application over time.
 */

import type {
  GroundUnit,
  GroundUnitId,
  BattleIndicator,
  DivisionStance,
  TerrainType,
} from '@/types/ground'
import type { GameState, GameEvent } from '@/types/game'
import type { SeededRNG } from '@/engine/utils/rng'
import { terrainModifiers } from '@/data/ground/terrain-modifiers'
import { cellToLatLng } from './frontline'

// ── Constants ───────────────────────────────────────────────────

const DAMAGE_SCALAR = 0.02        // Base damage per tick as fraction of power
const MORALE_FACTOR = 0.7         // Morale loss relative to strength loss
const ORG_FACTOR = 1.2            // Org loss relative to strength loss
const ORG_COLLAPSE = 5            // Auto-retreat threshold
const ORG_PENALTY = 20            // Halved effectiveness threshold
const BREAKTHROUGH_THRESHOLD = 2.0 // Ratio for breakthrough bonus
const PRESSURE_SCALAR = 0.5       // How fast cell pressure accumulates

// ── Stance modifiers ────────────────────────────────────────────

const STANCE_ATK_MOD: Record<DivisionStance, number> = {
  attack: 1.0,
  defend: 0.5,
  fortify: 0.3,
  reserve: 0,
  retreat: 0,
}

const STANCE_DEF_MOD: Record<DivisionStance, number> = {
  attack: 0.3,
  defend: 1.0,
  fortify: 1.5,
  reserve: 0.2,
  retreat: 0,
}

// ── Module-level state (must reset on save/load) ─────────────────

/** Battle indicators collected during the current tick */
let tickBattles: BattleIndicator[] = []

export function resetGroundCombatState(): void {
  tickBattles = []
}

/** Get the battles computed during the last processGroundCombat call */
export function getTickBattles(): BattleIndicator[] {
  return tickBattles
}

// ── Supply modifier ──────────────────────────────────────────────

function supplyModifier(unit: GroundUnit): number {
  if (unit.supplyState < 30) return 0.4
  if (unit.supplyState < 60) return 0.7
  return 1.0
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Compute the local force ratio for an engagement.
 * Kept for display purposes and tests.
 */
export function computeLocalForceRatio(
  attackers: GroundUnit[],
  defenders: GroundUnit[],
  terrain: TerrainType,
  entrenchment: number,
): number {
  const avgDefHardness = defenders.length > 0
    ? defenders.reduce((sum, u) => sum + u.hardness, 0) / defenders.length
    : 0

  let attackerPower = 0
  for (const unit of attackers) {
    const baseAttack = unit.softAttack * (1 - avgDefHardness) + unit.hardAttack * avgDefHardness
    attackerPower += baseAttack * (unit.strength / 100) * unit.experience * supplyModifier(unit)
  }

  const terrainMod = terrainModifiers[terrain]
  const entrenchMult = 1 + entrenchment / 100

  let defenderPower = 0
  for (const unit of defenders) {
    defenderPower += unit.defense * (unit.strength / 100) * unit.experience * supplyModifier(unit)
  }
  defenderPower *= terrainMod.defenseModifier * entrenchMult

  return attackerPower / Math.max(defenderPower, 1)
}

/**
 * Main ground combat processor. Called once per tick by the game engine.
 *
 * Algorithm: continuous attrition — each side deals damage proportional
 * to its combat power. Pressure accumulates on cells over time, and
 * cells flip when pressure reaches 100.
 */
export function processGroundCombat(state: GameState, _rng: SeededRNG): void {
  const grid = state.controlGrid
  const groundUnits = state.groundUnits

  if (!grid || !groundUnits?.size) return

  tickBattles = []
  const unitsInCombat = new Set<GroundUnitId>()
  const events: GameEvent[] = []

  // Helper to access flat row-major cells
  const getCell = (r: number, c: number) => grid.cells[r * grid.cols + c]

  // Step 1: Build spatial index (only active, non-routing units)
  const spatialIndex = new Map<string, GroundUnitId[]>()
  for (const [id, unit] of groundUnits) {
    if (unit.status === 'destroyed' || unit.status === 'routing') continue
    const key = `${unit.gridRow}_${unit.gridCol}`
    const list = spatialIndex.get(key)
    if (list) {
      list.push(id)
    } else {
      spatialIndex.set(key, [id])
    }
  }

  // Step 2: Find cells with attackers adjacent to enemy cells
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell = getCell(row, col)
      const cellKey = `${row}_${col}`

      // Get units in this cell
      const unitIds = spatialIndex.get(cellKey)
      if (!unitIds) continue

      // Check if any unit here has 'attack' stance
      const attackingIds = unitIds.filter(id => {
        const u = groundUnits.get(id)!
        return u.stance === 'attack'
      })
      if (attackingIds.length === 0) continue

      // Find adjacent enemy cells
      const neighbors = getNeighbors(row, col, grid.rows, grid.cols)
      for (const [nRow, nCol] of neighbors) {
        const neighborCell = getCell(nRow, nCol)
        if (neighborCell.controller === cell.controller) continue // Same side

        const attackerNation = cell.controller
        const defenderNation = neighborCell.controller

        // Gather attackers: units in this cell with attack stance
        const attackerUnits: GroundUnit[] = []
        for (const id of attackingIds) {
          attackerUnits.push(groundUnits.get(id)!)
        }

        // Also gather support from other adjacent friendly cells
        for (const [sRow, sCol] of getNeighbors(nRow, nCol, grid.rows, grid.cols)) {
          if (sRow === row && sCol === col) continue // Already counted
          const sCell = getCell(sRow, sCol)
          if (sCell.controller !== attackerNation) continue
          const sKey = `${sRow}_${sCol}`
          const sUnitIds = spatialIndex.get(sKey)
          if (!sUnitIds) continue
          for (const id of sUnitIds) {
            const u = groundUnits.get(id)!
            if (u.stance === 'attack') {
              attackerUnits.push(u)
            }
          }
        }

        // Gather defenders: units in target cell + adjacent friendly cells
        const defenderUnits: GroundUnit[] = []
        const targetKey = `${nRow}_${nCol}`
        const targetUnitIds = spatialIndex.get(targetKey)
        if (targetUnitIds) {
          for (const id of targetUnitIds) {
            const u = groundUnits.get(id)!
            if (u.nation === defenderNation) {
              defenderUnits.push(u)
            }
          }
        }

        // Defender support from adjacent cells
        for (const [dRow, dCol] of getNeighbors(nRow, nCol, grid.rows, grid.cols)) {
          const dCell = getCell(dRow, dCol)
          if (dCell.controller !== defenderNation) continue
          if (dRow === nRow && dCol === nCol) continue
          const dKey = `${dRow}_${dCol}`
          const dUnitIds = spatialIndex.get(dKey)
          if (!dUnitIds) continue
          for (const id of dUnitIds) {
            const u = groundUnits.get(id)!
            if (u.nation === defenderNation) {
              defenderUnits.push(u)
            }
          }
        }

        if (attackerUnits.length === 0) continue

        // ── Compute attacker power ──
        const avgDefHardness = defenderUnits.length > 0
          ? defenderUnits.reduce((sum, u) => sum + u.hardness, 0) / defenderUnits.length
          : 0

        let attackerPower = 0
        for (const unit of attackerUnits) {
          let effectiveness = 1.0
          if (unit.organization < ORG_PENALTY) effectiveness *= 0.5
          const baseAttack = unit.softAttack * (1 - avgDefHardness) + unit.hardAttack * avgDefHardness
          attackerPower += baseAttack * (unit.strength / 100) * unit.experience * supplyModifier(unit) * STANCE_ATK_MOD[unit.stance] * effectiveness
        }

        // ── Compute defender power ──
        const terrainMod = terrainModifiers[neighborCell.terrain]
        const avgEntrenchment = defenderUnits.length > 0
          ? defenderUnits.reduce((sum, u) => sum + u.entrenched, 0) / defenderUnits.length
          : 0

        let rawDefPower = 0
        for (const unit of defenderUnits) {
          let effectiveness = 1.0
          if (unit.organization < ORG_PENALTY) effectiveness *= 0.5
          rawDefPower += unit.defense * (unit.strength / 100) * unit.experience * supplyModifier(unit) * STANCE_DEF_MOD[unit.stance] * effectiveness
        }
        const totalDefPower = rawDefPower * terrainMod.defenseModifier * (1 + avgEntrenchment / 100)

        // ── Breakthrough check ──
        let attackerDamageMultiplier = 1.0
        let defenderDamageMultiplier = 1.0

        const breakthroughPower = attackerUnits.reduce(
          (sum, u) => sum + u.breakthrough * (u.strength / 100), 0,
        )
        if (totalDefPower > 0 && breakthroughPower / totalDefPower > BREAKTHROUGH_THRESHOLD) {
          attackerDamageMultiplier = 0.5  // attackers take less damage
          defenderDamageMultiplier = 1.5  // defenders take more damage
        }

        // ── Apply damage to both sides ──
        const defDamagePerUnit = defenderUnits.length > 0
          ? (attackerPower * DAMAGE_SCALAR / defenderUnits.length)
          : 0
        const atkDamagePerUnit = attackerUnits.length > 0
          ? (totalDefPower * DAMAGE_SCALAR / attackerUnits.length)
          : 0

        for (const unit of defenderUnits) {
          const dmg = defDamagePerUnit * defenderDamageMultiplier
          unit.strength = Math.max(0, unit.strength - dmg)
          unit.morale = Math.max(0, unit.morale - dmg * MORALE_FACTOR)
          unit.organization = Math.max(0, unit.organization - dmg * ORG_FACTOR)
          unitsInCombat.add(unit.id)
        }

        for (const unit of attackerUnits) {
          const dmg = atkDamagePerUnit * attackerDamageMultiplier
          unit.strength = Math.max(0, unit.strength - dmg)
          unit.morale = Math.max(0, unit.morale - dmg * MORALE_FACTOR)
          unit.organization = Math.max(0, unit.organization - dmg * ORG_FACTOR)
          unitsInCombat.add(unit.id)
        }

        // ── Status checks ──
        for (const unit of [...attackerUnits, ...defenderUnits]) {
          if (unit.strength <= 0) {
            unit.status = 'destroyed'
          } else if (unit.organization < ORG_COLLAPSE && unit.status === 'active') {
            unit.stance = 'retreat'
            unit.status = 'routing'
          } else if (unit.morale < 15 && unit.status === 'active') {
            unit.status = 'routing'
          }
        }

        // ── Pressure accumulation on the cell ──
        const pressureDelta = (attackerPower - totalDefPower) * PRESSURE_SCALAR
        neighborCell.pressure = clamp(neighborCell.pressure + pressureDelta, -100, 100)

        let cellFlipped = false
        if (neighborCell.pressure >= 100) {
          neighborCell.controller = attackerNation
          neighborCell.pressure = 0
          neighborCell.fortification = Math.max(0, neighborCell.fortification - 0.5)
          cellFlipped = true
        }

        // ── Collect BattleIndicator ──
        const pos = cellToLatLng(nRow, nCol, grid)
        const forceRatio = attackerPower / Math.max(1, totalDefPower)

        tickBattles.push({
          position: { lat: pos.lat, lng: pos.lng },
          intensity: Math.min(100, (attackerPower + totalDefPower) / 10),
          attackerNation: attackerNation!,
          defenderNation: defenderNation!,
          attackerPower,
          defenderPower: totalDefPower,
          forceRatio,
          pressureDelta,
          attackerUnits: attackerUnits.length,
          defenderUnits: defenderUnits.length,
        })

        // ── Emit battle event ──
        events.push({
          type: 'BATTLE_RESULT',
          tick: state.time.tick,
          attackerNation: attackerNation!,
          defenderNation: defenderNation!,
          cellRow: nRow,
          cellCol: nCol,
          attackerLosses: 0,
          defenderLosses: 0,
          cellFlipped,
        })
      }
    }
  }

  // ── Recovery for units NOT in combat this tick ──
  for (const unit of groundUnits.values()) {
    if (unit.status === 'destroyed') continue
    if (!unitsInCombat.has(unit.id)) {
      // Org recovery
      if (unit.stance === 'reserve') {
        unit.organization = Math.min(100, unit.organization + 5)
      } else if (unit.stance === 'defend' || unit.stance === 'fortify') {
        unit.organization = Math.min(100, unit.organization + 3)
      } else {
        unit.organization = Math.min(100, unit.organization + 1)
      }
      // Morale recovery
      unit.morale = Math.min(100, unit.morale + 1)
      // Routing units with recovered morale become active again
      if (unit.status === 'routing' && unit.morale >= 30 && unit.organization >= 20) {
        unit.status = 'active'
        unit.stance = 'defend'
      }
    }
  }

  emitEvents(state, events)
}

// ── Helpers ──────────────────────────────────────────────────────

function getNeighbors(row: number, col: number, maxRows: number, maxCols: number): [number, number][] {
  const result: [number, number][] = []
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr
    const nc = col + dc
    if (nr >= 0 && nr < maxRows && nc >= 0 && nc < maxCols) {
      result.push([nr, nc])
    }
  }
  return result
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Emit ground combat events. Uses the same pattern as existing systems.
 */
function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}
