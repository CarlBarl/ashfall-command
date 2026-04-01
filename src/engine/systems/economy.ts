import type { GameState } from '@/types/game'

const TICKS_PER_DAY = 86_400 // 1 tick = 1 second, 86400 seconds = 1 day

export function processEconomy(state: GameState): void {
  if (state.time.tick % TICKS_PER_DAY !== 0) return

  for (const nation of Object.values(state.nations)) {
    const eco = nation.economy
    const atWar = nation.atWar.length > 0

    if (atWar) {
      // Deduct war costs from reserves
      eco.reserves_billions -= eco.war_cost_per_day_millions / 1000

      if (nation.id === 'iran') {
        // Sanctions increase by 0.01/day during war, capped at 0.8
        eco.sanctions_impact = Math.min(0.8, eco.sanctions_impact + 0.01)
        // Oil revenue reduced by sanctions
        const effectiveOilRevenue = eco.oil_revenue_billions * (1 - eco.sanctions_impact)
        // Net: oil revenue partially offsets war cost (applied as daily credit)
        eco.reserves_billions += effectiveOilRevenue / 365
      }
    } else {
      // Slow reserve recovery during peace
      const recoveryRate = nation.id === 'usa' ? 0.5 : 0.1
      eco.reserves_billions += recoveryRate
    }

    // Prevent reserves from going negative
    eco.reserves_billions = Math.max(0, eco.reserves_billions)
  }
}
