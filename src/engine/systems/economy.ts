import type { GameState } from '@/types/game'

const TICKS_PER_HOUR = 3_600
const BASE_OIL_PRICE = 80   // $/barrel baseline
const MAX_OIL_PRICE = 160   // $/barrel during full Hormuz blockade
const HORMUZ_CAPACITY_MBD = 17.0 // million barrels/day through Hormuz normally
const OIL_PRICE_EVENT_THRESHOLD = 5 // $/barrel move per hour that warrants an alert

export function processEconomy(state: GameState): void {
  if (state.time.tick % TICKS_PER_HOUR !== 0) return

  // ─── Oil price from shipping lane suppression ───
  const hormuzLane = state.shippingLanes.get('hormuz')
  const hormuzThroughput = hormuzLane?.currentThroughput_mbd ?? HORMUZ_CAPACITY_MBD
  const hormuzSuppression = 1 - (hormuzThroughput / HORMUZ_CAPACITY_MBD)
  // Nonlinear price rise — small disruptions have outsized market impact
  const oilPrice = BASE_OIL_PRICE + (MAX_OIL_PRICE - BASE_OIL_PRICE) * (hormuzSuppression ** 0.7)
  const oilPricePremium = Math.max(0, (oilPrice - BASE_OIL_PRICE) / BASE_OIL_PRICE)

  const oldPrice = Object.values(state.nations)[0]?.economy.oilPrice_per_barrel ?? BASE_OIL_PRICE
  if (Math.abs(oilPrice - oldPrice) >= OIL_PRICE_EVENT_THRESHOLD) {
    const event = {
      type: 'OIL_PRICE_CHANGE' as const,
      newPrice: oilPrice,
      oldPrice,
      tick: state.time.tick,
    }
    state.events.push(event)
    state.pendingEvents.push(event)
  }

  for (const nation of Object.values(state.nations)) {
    const eco = nation.economy
    const atWar = nation.atWar.length > 0

    // Store oil price on every nation (global, same for all)
    eco.oilPrice_per_barrel = oilPrice

    if (atWar) {
      // Set war costs if not already set
      if (eco.war_cost_per_day_millions === 0) {
        eco.war_cost_per_day_millions = nation.id === 'usa' ? 300 : 50
      }

      // Oil price shock adds to war costs (fuel, supply chain disruption)
      const effectiveWarCost = eco.war_cost_per_day_millions * (1 + oilPricePremium * 0.5)

      // Hourly deduction = daily cost / 24
      eco.reserves_billions -= effectiveWarCost / 1000 / 24

      if (nation.id === 'iran') {
        // Sanctions escalate 0.01/day = ~0.0004/hour
        eco.sanctions_impact = Math.min(0.8, eco.sanctions_impact + 0.01 / 24)
        // Iran can only export through Hormuz — throughput gates revenue
        const hormuzFraction = hormuzThroughput / HORMUZ_CAPACITY_MBD
        const effectiveOilRevenue = eco.oil_revenue_billions * (1 - eco.sanctions_impact) * hormuzFraction
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
