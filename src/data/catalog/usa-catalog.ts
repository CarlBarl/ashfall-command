import type { UnitCatalogEntry } from '@/types/scenario'

/**
 * US unit catalog for Free Mode.
 * Costs are approximate acquisition costs in millions USD.
 * Templates match weapon loadouts from usa-orbat.ts.
 */
export const usaCatalog: UnitCatalogEntry[] = [
  // ═══════════════════════════════════════════════
  //  AIR DEFENSE
  // ═══════════════════════════════════════════════

  {
    id: 'usa_patriot',
    name: 'Patriot Battery (PAC-3 MSE)',
    nation: 'usa',
    category: 'sam_site',
    cost_millions: 1000,
    description:
      'MIM-104 Patriot battery with PAC-3 MSE interceptors. Primary theater ballistic ' +
      'missile defense. 16 ready interceptors, AN/MPQ-65 radar with 180 km detection range.',
    template: {
      name: 'Patriot Battery',
      nation: 'usa',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 25,
      health: 100,
      hardness: 100,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 },
      ],
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
      roe: 'weapons_free',
    },
  },

  {
    id: 'usa_thaad',
    name: 'THAAD Battery',
    nation: 'usa',
    category: 'sam_site',
    cost_millions: 3000,
    description:
      'Terminal High Altitude Area Defense battery. Exo-atmospheric ballistic missile intercept ' +
      'capability. 48 interceptors, AN/TPY-2 radar with 1000 km detection range.',
    template: {
      name: 'THAAD Battery',
      nation: 'usa',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 25,
      health: 100,
      hardness: 100,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'thaad_int', count: 48, maxCount: 48, reloadTimeSec: 900 },
      ],
      sensors: [{ type: 'radar', range_km: 1000, detection_prob: 0.98, antenna_height_m: 10, sector_deg: 120 }],
      roe: 'weapons_free',
    },
  },

  // ═══════════════════════════════════════════════
  //  NAVAL
  // ═══════════════════════════════════════════════

  {
    id: 'usa_ddg',
    name: 'Arleigh Burke DDG',
    nation: 'usa',
    category: 'ship',
    cost_millions: 2000,
    description:
      'Arleigh Burke-class guided missile destroyer. 96 VLS cells with Tomahawk, SM-6, ' +
      'SM-2 mix plus deck-mounted Harpoon launchers. SPY-1D radar, 500 km detection.',
    template: {
      name: 'Arleigh Burke DDG',
      nation: 'usa',
      category: 'ship',
      heading: 45,
      speed_kts: 15,
      maxSpeed_kts: 30,
      health: 100,
      hardness: 150,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 },
        { weaponId: 'sm6', count: 52, maxCount: 52, reloadTimeSec: 0 },
        { weaponId: 'sm2_iiia', count: 24, maxCount: 24, reloadTimeSec: 0 },
        { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
      ],
      sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.96, antenna_height_m: 30 }],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'usa_csg',
    name: 'Carrier Strike Group',
    nation: 'usa',
    category: 'carrier_group',
    cost_millions: 15000,
    description:
      'Nimitz-class carrier strike group with embarked air wing. Tomahawk strike, SM-6/SM-3 ' +
      'BMD layer, Harpoon ASuW. Massive radar coverage at 500 km, 30 kt max speed.',
    template: {
      name: 'Carrier Strike Group',
      nation: 'usa',
      category: 'carrier_group',
      heading: 315,
      speed_kts: 20,
      maxSpeed_kts: 30,
      health: 100,
      hardness: 250,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'tomahawk', count: 60, maxCount: 60, reloadTimeSec: 0 },
        { weaponId: 'sm6', count: 120, maxCount: 120, reloadTimeSec: 0 },
        { weaponId: 'sm3_iia', count: 24, maxCount: 24, reloadTimeSec: 0 },
        { weaponId: 'harpoon', count: 16, maxCount: 16, reloadTimeSec: 0 },
      ],
      sensors: [
        { type: 'radar', range_km: 500, detection_prob: 0.98, antenna_height_m: 50 },
        { type: 'sonar', range_km: 50, detection_prob: 0.70 },
      ],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'usa_ssn',
    name: 'Virginia-class SSN',
    nation: 'usa',
    category: 'submarine',
    cost_millions: 3400,
    description:
      'Virginia-class nuclear attack submarine. 12 Tomahawk VLS + 4 Harpoon torpedo tubes. ' +
      'Stealthy subsurface strike platform with 80 km sonar detection range.',
    template: {
      name: 'Virginia-class SSN',
      nation: 'usa',
      category: 'submarine',
      heading: 180,
      speed_kts: 5,
      maxSpeed_kts: 25,
      health: 100,
      hardness: 120,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'tomahawk', count: 12, maxCount: 12, reloadTimeSec: 0 },
        { weaponId: 'harpoon', count: 4, maxCount: 4, reloadTimeSec: 0 },
      ],
      sensors: [{ type: 'sonar', range_km: 80, detection_prob: 0.85 }],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  AIRBASES
  // ═══════════════════════════════════════════════

  {
    id: 'usa_f35_squadron',
    name: 'F-35A Squadron (Forward Base)',
    nation: 'usa',
    category: 'airbase',
    cost_millions: 5000,
    description:
      'Forward operating base with F-35A Lightning II squadron. 96 JASSM-ER standoff cruise ' +
      'missiles. 400 km radar coverage, hardened infrastructure.',
    template: {
      name: 'F-35A Squadron',
      nation: 'usa',
      category: 'airbase',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 200,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'jassm_er', count: 96, maxCount: 96, reloadTimeSec: 0 },
      ],
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'usa_forward_base',
    name: 'Forward Operating Base',
    nation: 'usa',
    category: 'airbase',
    cost_millions: 2000,
    description:
      'Al Udeid-type forward air base. Smaller munitions stockpile (48 JASSM-ER) but full ' +
      'radar coverage. Serves as logistics hub for regional resupply.',
    template: {
      name: 'Forward Operating Base',
      nation: 'usa',
      category: 'airbase',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 200,
      logistics: 100,
      supplyStocks: [],
      weapons: [
        { weaponId: 'jassm_er', count: 48, maxCount: 48, reloadTimeSec: 0 },
      ],
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
      roe: 'weapons_tight',
    },
  },
]
