import type { Economy } from '@/types/game'

/**
 * Second Polish Republic economy data, 1939.
 *
 * GDP: ~24B zloty (~$5B USD at 1939 exchange), purchasing power adjusted.
 * Military spending: ~2.5B zloty (~10% of GDP) — high for peacetime
 *   but Poland was still modernizing after 20 years of independence.
 * No oil revenue (Romania was the regional oil producer).
 * War cost: estimated 8M zloty/day during mobilization + active defense.
 * Reserves: ~2B zloty — limited by interwar development needs.
 *
 * Sources: M. Cienciala & T. Komarnicki "From Versailles to Locarno",
 *          R. Kaczmarek "Poland 1918-1945".
 */
export const polandEconomy: Economy = {
  gdp_billions: 24,
  military_budget_billions: 2.5,
  military_budget_pct_gdp: 10,
  oil_revenue_billions: 0,
  sanctions_impact: 0,
  war_cost_per_day_millions: 8,
  reserves_billions: 2,
  currency: 'zl',
}
