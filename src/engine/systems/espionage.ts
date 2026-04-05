import type { GameState, UnitId, NationId } from '@/types/game'
import type { SeededRNG } from '../utils/rng'

export interface EspionageResult {
  humintRevealed: Map<NationId, UnitId[]>  // units revealed by HUMINT
  sigintMultiplier: Map<NationId, number>  // SIGINT range multiplier for ELINT
}

export function processEspionage(state: GameState, rng: SeededRNG): EspionageResult {
  const humintRevealed = new Map<NationId, UnitId[]>()
  const sigintMultiplier = new Map<NationId, number>()

  for (const nation of Object.values(state.nations)) {
    const budget = nation.intelBudget
    if (!budget || budget.total_pct <= 0) {
      sigintMultiplier.set(nation.id, 1.5) // default ELINT multiplier
      continue
    }

    const enemyNation: NationId = nation.id === 'usa' ? 'iran' : 'usa'

    // HUMINT: random chance to reveal enemy units, checked once per game-hour
    if (state.time.tick % 3600 === 0) {
      const humintChance = 0.005 * (budget.humint_pct / 10) * (budget.total_pct / 10)
      const revealed: UnitId[] = []
      for (const unit of state.units.values()) {
        if (unit.nation !== enemyNation) continue
        if (unit.status === 'destroyed') continue
        if (rng.chance(humintChance)) {
          revealed.push(unit.id)
        }
      }
      humintRevealed.set(nation.id, revealed)
    }

    // SIGINT: extends ELINT detection range
    // Default 1.5x, max 2.0x with full SIGINT budget
    const sigintMult = 1.5 + (budget.sigint_pct / 100) * 0.5
    sigintMultiplier.set(nation.id, sigintMult)
  }

  return { humintRevealed, sigintMultiplier }
}
