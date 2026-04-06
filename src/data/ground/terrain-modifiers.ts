import type { TerrainType, TerrainModifier } from '@/types/ground'

/**
 * Terrain modifiers for ground combat.
 *
 * Defense multipliers reflect historical norms:
 * - Mountains/urban: 2x defense (extremely hard to assault)
 * - Hills: 1.5x (elevated positions, cover)
 * - Forest: 1.3x (concealment, channelized movement)
 * - River: 1.5x defense (crossing penalty on attacker)
 * - Desert: 0.8x (open, little cover for defenders)
 *
 * Attack modifiers penalize the attacker in difficult terrain.
 * Movement costs affect how many ticks to cross a cell.
 */
export const terrainModifiers: Record<TerrainType, TerrainModifier> = {
  plains:    { type: 'plains',    attackModifier: 1.0, defenseModifier: 1.0, movementCost: 1 },
  forest:    { type: 'forest',    attackModifier: 0.8, defenseModifier: 1.3, movementCost: 2 },
  hills:     { type: 'hills',     attackModifier: 0.7, defenseModifier: 1.5, movementCost: 2 },
  mountains: { type: 'mountains', attackModifier: 0.5, defenseModifier: 2.0, movementCost: 3 },
  urban:     { type: 'urban',     attackModifier: 0.6, defenseModifier: 2.0, movementCost: 1 },
  river:     { type: 'river',     attackModifier: 0.4, defenseModifier: 1.5, movementCost: 3 },
  marsh:     { type: 'marsh',     attackModifier: 0.6, defenseModifier: 1.2, movementCost: 3 },
  desert:    { type: 'desert',    attackModifier: 0.9, defenseModifier: 0.8, movementCost: 1 },
}
