/**
 * Ground Combat System for REALPOLITIK
 *
 * Resolves land battles using a Combat Results Table (CRT) inspired by
 * classic operational-level wargames. Force ratios account for terrain,
 * entrenchment, supply state, and unit hardness composition.
 */

import type {
  GroundUnit,
  GroundUnitId,
  TerrainType,
} from '@/types/ground'
import type { GameState, GameEvent } from '@/types/game'
import type { SeededRNG } from '@/engine/utils/rng'
import { terrainModifiers } from '@/data/ground/terrain-modifiers'

// ── Types ────────────────────────────────────────────────────────

type CombatResult =
  | 'attacker_eliminated'
  | 'attacker_retreat'
  | 'exchange'
  | 'defender_retreat'
  | 'defender_eliminated'

export type { CombatResult }

// ── Module-level state (must reset on save/load) ─────────────────

/** Cells already fought over this tick (prevent double-processing) */
let processedCells = new Set<string>()

export function resetGroundCombatState(): void {
  processedCells = new Set()
}

// ── Combat Results Table ─────────────────────────────────────────

/**
 * CRT columns indexed by odds bracket.
 * Each column has 6 entries (roll 0-5).
 * AE = attacker_eliminated, AR = attacker_retreat,
 * EX = exchange, DR = defender_retreat, DE = defender_eliminated
 */
const CRT: Record<string, CombatResult[]> = {
  '1:2':  ['attacker_eliminated', 'attacker_eliminated', 'attacker_retreat', 'attacker_retreat', 'attacker_retreat', 'exchange'],
  '1:1':  ['attacker_retreat', 'attacker_retreat', 'exchange', 'exchange', 'defender_retreat', 'defender_retreat'],
  '3:2':  ['attacker_retreat', 'exchange', 'exchange', 'defender_retreat', 'defender_retreat', 'defender_eliminated'],
  '2:1':  ['defender_retreat', 'exchange', 'exchange', 'defender_retreat', 'defender_eliminated', 'defender_eliminated'],
  '3:1':  ['defender_retreat', 'defender_retreat', 'defender_eliminated', 'defender_eliminated', 'defender_eliminated', 'defender_eliminated'],
  '4:1+': ['defender_eliminated', 'defender_eliminated', 'defender_eliminated', 'defender_eliminated', 'defender_eliminated', 'defender_eliminated'],
}

function oddsColumn(ratio: number): string {
  if (ratio < 0.5) return '1:2'
  if (ratio < 1.0) return '1:1'
  if (ratio < 1.5) return '3:2'
  if (ratio < 2.0) return '2:1'
  if (ratio < 3.0) return '3:1'
  return '4:1+'
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
 *
 * Attacker power uses soft/hard attack weighted by defender hardness composition.
 * Defender power uses defense stat modified by terrain and entrenchment.
 * Both sides are modified by strength, experience, and supply.
 */
export function computeLocalForceRatio(
  attackers: GroundUnit[],
  defenders: GroundUnit[],
  terrain: TerrainType,
  entrenchment: number,
): number {
  // Average defender hardness (for weighting soft vs hard attack)
  const avgDefHardness = defenders.length > 0
    ? defenders.reduce((sum, u) => sum + u.hardness, 0) / defenders.length
    : 0

  // Sum attacker power
  let attackerPower = 0
  for (const unit of attackers) {
    const baseAttack = unit.softAttack * (1 - avgDefHardness) + unit.hardAttack * avgDefHardness
    attackerPower += baseAttack * (unit.strength / 100) * unit.experience * supplyModifier(unit)
  }

  // Sum defender power with terrain and entrenchment
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
 * Roll on the Combat Results Table.
 * Uses the seeded PRNG for deterministic replay.
 */
export function resolveCombat(ratio: number, rng: SeededRNG): CombatResult {
  const column = oddsColumn(ratio)
  const roll = rng.int(0, 5)
  return CRT[column][roll]
}

/**
 * Main ground combat processor. Called once per tick by the game engine.
 *
 * Algorithm:
 * 1. Build spatial index of ground units by grid cell
 * 2. Find frontline cells (adjacent to enemy-controlled cells)
 * 3. For each frontline cell with attacking units, resolve combat
 * 4. Apply losses, flip cells, check for routing
 */
export function processGroundCombat(state: GameState, rng: SeededRNG): void {
  const grid = state.controlGrid
  const groundUnits = state.groundUnits

  if (!grid || !groundUnits?.size) return

  processedCells.clear()

  // Helper to access flat row-major cells
  const getCell = (r: number, c: number) => grid.cells[r * grid.cols + c]

  // Step 1: Build spatial index
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

  // Step 2-4: Find frontline cells and resolve combat
  const events: GameEvent[] = []

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

        // Target is an enemy cell
        const targetKey = `${nRow}_${nCol}`
        if (processedCells.has(targetKey)) continue // Already fought here
        processedCells.add(targetKey)

        const attackerNation = cell.controller
        // Capture defender nation before cell might flip
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
        const targetUnitIds = spatialIndex.get(targetKey)
        if (targetUnitIds) {
          for (const id of targetUnitIds) {
            defenderUnits.push(groundUnits.get(id)!)
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
            defenderUnits.push(groundUnits.get(id)!)
          }
        }

        if (attackerUnits.length === 0) continue

        // Average entrenchment of defenders
        const avgEntrenchment = defenderUnits.length > 0
          ? defenderUnits.reduce((sum, u) => sum + u.entrenched, 0) / defenderUnits.length
          : 0

        // Compute force ratio
        const ratio = computeLocalForceRatio(
          attackerUnits,
          defenderUnits,
          neighborCell.terrain,
          avgEntrenchment,
        )

        // Roll CRT
        const result = resolveCombat(ratio, rng)

        // Apply losses
        applyLosses(result, attackerUnits, defenderUnits, groundUnits, rng)

        // Cell control changes
        if (result === 'defender_retreat' || result === 'defender_eliminated') {
          neighborCell.controller = attackerNation
        }

        if (result === 'attacker_eliminated') {
          // Destroy weakest attacking division
          const weakest = attackerUnits.reduce((min, u) =>
            u.strength < min.strength ? u : min, attackerUnits[0])
          weakest.status = 'destroyed'
          weakest.strength = 0
        }

        // Emit battle event
        events.push({
          type: 'BATTLE_RESULT',
          tick: state.time.tick,
          attackerNation: attackerNation!,
          defenderNation: defenderNation!,
          cellRow: nRow,
          cellCol: nCol,
          attackerLosses: 0,
          defenderLosses: 0,
          cellFlipped: result === 'defender_retreat' || result === 'defender_eliminated',
        })
      }
    }
  }

  // Step 5: Check for routing (morale < 15)
  for (const [, unit] of groundUnits) {
    if (unit.status === 'destroyed') continue
    if (unit.morale < 15 && unit.status !== 'routing') {
      unit.status = 'routing'
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

function applyLosses(
  result: CombatResult,
  attackers: GroundUnit[],
  defenders: GroundUnit[],
  allUnits: Map<GroundUnitId, GroundUnit>,
  rng: SeededRNG,
): void {
  // Strength damage ranges by result (percentage points of strength)
  const strengthDamage: Record<CombatResult, { atk: [number, number]; def: [number, number] }> = {
    'attacker_eliminated': { atk: [15, 20], def: [5, 8] },
    'attacker_retreat':    { atk: [10, 15], def: [5, 10] },
    'exchange':            { atk: [10, 15], def: [10, 15] },
    'defender_retreat':    { atk: [5, 10], def: [10, 15] },
    'defender_eliminated': { atk: [5, 8], def: [15, 20] },
  }

  // Morale damage ranges by result
  const moraleDamage: Record<CombatResult, { atk: [number, number]; def: [number, number] }> = {
    'attacker_eliminated': { atk: [25, 30], def: [10, 15] },
    'attacker_retreat':    { atk: [15, 25], def: [10, 15] },
    'exchange':            { atk: [15, 20], def: [15, 20] },
    'defender_retreat':    { atk: [10, 15], def: [15, 25] },
    'defender_eliminated': { atk: [10, 15], def: [25, 30] },
  }

  const sDmg = strengthDamage[result]
  const mDmg = moraleDamage[result]

  // Apply to attackers
  for (const unit of attackers) {
    const u = allUnits.get(unit.id)
    if (!u || u.status === 'destroyed') continue
    u.strength = Math.max(0, u.strength - rng.int(sDmg.atk[0], sDmg.atk[1]))
    u.morale = Math.max(0, u.morale - rng.int(mDmg.atk[0], mDmg.atk[1]))
    if (u.strength <= 0) u.status = 'destroyed'
  }

  // Apply to defenders
  for (const unit of defenders) {
    const u = allUnits.get(unit.id)
    if (!u || u.status === 'destroyed') continue
    u.strength = Math.max(0, u.strength - rng.int(sDmg.def[0], sDmg.def[1]))
    u.morale = Math.max(0, u.morale - rng.int(mDmg.def[0], mDmg.def[1]))
    if (u.strength <= 0) u.status = 'destroyed'
  }
}

/**
 * Emit ground combat events. Uses the same pattern as existing systems
 * (combat.ts, logistics.ts, etc.) — push to events/pendingEvents with cap.
 */
function emitEvents(state: GameState, events: GameEvent[]): void {
  state.events.push(...events)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(...events)
}
