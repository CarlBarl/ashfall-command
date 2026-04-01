import type { GameState } from '@/types/game'

const TICKS_PER_HOUR = 3_600 // Process economy hourly for responsive feedback

export function processEconomy(state: GameState): void {
  if (state.time.tick % TICKS_PER_HOUR !== 0) return

  for (const nation of Object.values(state.nations)) {
    const eco = nation.economy
    const atWar = nation.atWar.length > 0

    if (atWar) {
      // Set war costs if not already set
      if (eco.war_cost_per_day_millions === 0) {
        eco.war_cost_per_day_millions = nation.id === 'usa' ? 300 : 50
      }

      // Hourly deduction = daily cost / 24
      eco.reserves_billions -= eco.war_cost_per_day_millions / 1000 / 24

      if (nation.id === 'iran') {
        // Sanctions escalate 0.01/day = ~0.0004/hour
        eco.sanctions_impact = Math.min(0.8, eco.sanctions_impact + 0.01 / 24)
        // Hourly oil revenue credit
        const effectiveOilRevenue = eco.oil_revenue_billions * (1 - eco.sanctions_impact)
        eco.reserves_billions += effectiveOilRevenue / 365 / 24
      }
    } else {
      // Slow reserve recovery during peace (hourly)
      const recoveryRate = nation.id === 'usa' ? 0.5 / 24 : 0.1 / 24
      eco.reserves_billions += recoveryRate

      // Reset war costs when at peace
      eco.war_cost_per_day_millions = 0
    }

    eco.reserves_billions = Math.max(0, eco.reserves_billions)
  }
}
