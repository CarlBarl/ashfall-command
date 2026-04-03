import type { NationId } from '@/types/game'
import type { NationalStockpile } from '@/types/logistics'

/**
 * National stockpiles — top-level strategic reserves for each nation.
 *
 * These represent the total national inventory beyond what's already
 * pre-positioned at forward bases. The depot unit is the rear logistics
 * hub through which all new production enters the supply chain.
 *
 * Production rates reflect real-world manufacturing capacity:
 * - US: ~400 Tomahawks/yr ≈ 0.046/hr, but game uses slightly higher
 *   rates for playability while remaining constrained.
 * - Iran: Mass-produced drones are cheap and fast; precision missiles
 *   are scarce and slow.
 */
export const nationalStockpiles: Record<NationId, NationalStockpile> = {
  usa: {
    nationId: 'usa',
    depotId: 'diego_garcia', // Rear logistics hub (BIOT)
    stocks: [
      { weaponId: 'tomahawk',   count: 4000, maxCount: 4000 },
      { weaponId: 'jassm_er',   count: 2000, maxCount: 2000 },
      { weaponId: 'pac3_mse',   count: 1200, maxCount: 1200 },
      { weaponId: 'sm6',        count: 800,  maxCount: 800 },
      { weaponId: 'sm2_iiia',   count: 600,  maxCount: 600 },
      { weaponId: 'sm3_iia',    count: 200,  maxCount: 200 },
      { weaponId: 'harpoon',    count: 400,  maxCount: 400 },
      { weaponId: 'thaad_int',  count: 300,  maxCount: 300 },
    ],
    production: [
      { weaponId: 'tomahawk',   ratePerHour: 0.5,  efficiency: 1.0 },
      { weaponId: 'jassm_er',   ratePerHour: 0.3,  efficiency: 1.0 },
      { weaponId: 'pac3_mse',   ratePerHour: 0.2,  efficiency: 1.0 },
      { weaponId: 'sm6',        ratePerHour: 0.15, efficiency: 1.0 },
      { weaponId: 'sm2_iiia',   ratePerHour: 0.1,  efficiency: 1.0 },
      { weaponId: 'sm3_iia',    ratePerHour: 0.05, efficiency: 1.0 },
      { weaponId: 'harpoon',    ratePerHour: 0.1,  efficiency: 1.0 },
      { weaponId: 'thaad_int',  ratePerHour: 0.1,  efficiency: 1.0 },
    ],
  },

  iran: {
    nationId: 'iran',
    depotId: 'mehrabad', // Tehran — capital and industrial center
    stocks: [
      { weaponId: 'shahab3',       count: 50,   maxCount: 50 },
      { weaponId: 'sejjil2',       count: 30,   maxCount: 30 },
      { weaponId: 'fateh110',      count: 100,  maxCount: 100 },
      { weaponId: 'zolfaghar',     count: 60,   maxCount: 60 },
      { weaponId: 'soumar',        count: 30,   maxCount: 30 },
      { weaponId: 'noor',          count: 80,   maxCount: 80 },
      { weaponId: 'khalij_fars',   count: 40,   maxCount: 40 },
      { weaponId: 'shahed_136',    count: 2000, maxCount: 2000 },
      { weaponId: 'shahed_131',    count: 1000, maxCount: 1000 },
      { weaponId: 'shahed_238',    count: 200,  maxCount: 200 },
      { weaponId: 's300_48n6e2',   count: 200,  maxCount: 200 },
      { weaponId: 'bavar373_int',  count: 100,  maxCount: 100 },
    ],
    production: [
      { weaponId: 'shahab3',       ratePerHour: 0.1,  efficiency: 1.0 },
      { weaponId: 'sejjil2',       ratePerHour: 0.05, efficiency: 1.0 },
      { weaponId: 'fateh110',      ratePerHour: 0.2,  efficiency: 1.0 },
      { weaponId: 'zolfaghar',     ratePerHour: 0.1,  efficiency: 1.0 },
      { weaponId: 'soumar',        ratePerHour: 0.05, efficiency: 1.0 },
      { weaponId: 'noor',          ratePerHour: 0.15, efficiency: 1.0 },
      { weaponId: 'khalij_fars',   ratePerHour: 0.1,  efficiency: 1.0 },
      { weaponId: 'shahed_136',    ratePerHour: 2.0,  efficiency: 1.0 },
      { weaponId: 'shahed_131',    ratePerHour: 1.0,  efficiency: 1.0 },
      { weaponId: 'shahed_238',    ratePerHour: 0.5,  efficiency: 1.0 },
      { weaponId: 's300_48n6e2',   ratePerHour: 0.3,  efficiency: 1.0 },
      { weaponId: 'bavar373_int',  ratePerHour: 0.2,  efficiency: 1.0 },
    ],
  },
}
