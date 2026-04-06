import type { Economy } from '@/types/game'

/**
 * Nazi Germany economy data, 1939.
 *
 * GDP: ~77B RM (~$30B USD at 1939 exchange), purchasing power adjusted.
 * Military spending: ~17B RM (~22% of GDP) — the highest in Europe.
 * No oil revenue (Germany imported oil, main strategic weakness).
 * War cost: estimated 20M RM/day in the opening weeks of the war.
 * Reserves: ~10B RM in gold + foreign currency (depleted by rearmament).
 *
 * Sources: Adam Tooze "The Wages of Destruction", IISS data.
 */
export const germanyEconomy: Economy = {
  gdp_billions: 77,
  military_budget_billions: 17,
  military_budget_pct_gdp: 22,
  oil_revenue_billions: 0,
  sanctions_impact: 0,
  war_cost_per_day_millions: 20,
  reserves_billions: 10,
  currency: 'RM',
}
