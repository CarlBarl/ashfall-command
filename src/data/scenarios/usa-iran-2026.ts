import type { ScenarioDefinition, ScenarioData } from '@/types/scenario'
import type { Nation, NationId } from '@/types/game'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import { usaBaseSupply, usaSupplyLines } from '@/data/supply/usa-supply'
import { iranBaseSupply, iranSupplyLines } from '@/data/supply/iran-supply'

function buildData(): ScenarioData {
  const nations: Record<NationId, Nation> = {
    usa: {
      id: 'usa',
      name: 'United States of America',
      economy: {
        gdp_billions: 28000,
        military_budget_billions: 886,
        military_budget_pct_gdp: 3.2,
        oil_revenue_billions: 0,
        sanctions_impact: 0,
        war_cost_per_day_millions: 0,
        reserves_billions: 800,
      },
      relations: { usa: 100, iran: -60 },
      atWar: [],
    },
    iran: {
      id: 'iran',
      name: 'Islamic Republic of Iran',
      economy: {
        gdp_billions: 400,
        military_budget_billions: 25,
        military_budget_pct_gdp: 6.3,
        oil_revenue_billions: 50,
        sanctions_impact: 0.3,
        war_cost_per_day_millions: 0,
        reserves_billions: 120,
      },
      relations: { usa: -60, iran: 100 },
      atWar: [],
    },
  }

  return {
    nations,
    units: [...usaUnits, ...iranUnits],
    supplyLines: [...usaSupplyLines, ...iranSupplyLines],
    baseSupply: { ...usaBaseSupply, ...iranBaseSupply },
  }
}

export const persianGulf2026: ScenarioDefinition = {
  id: 'persian-gulf-2026',
  name: 'Persian Gulf Crisis 2026',
  description:
    'Tensions escalate between the United States and Iran in the Persian Gulf. ' +
    'US CENTCOM forces are deployed across Gulf state bases while Iran fields a layered ' +
    'air defense network and dispersed missile arsenal. Full ORBAT with realistic ' +
    'weapon loadouts, supply lines, and economic models.',
  year: 2026,
  startDate: '2026-06-15T06:00:00Z',
  nations: ['usa', 'iran'],
  defaultPlayerNation: 'usa',
  getData: buildData,
}
