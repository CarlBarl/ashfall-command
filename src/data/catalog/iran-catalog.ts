import type { UnitCatalogEntry } from '@/types/scenario'

/**
 * Iranian unit catalog for Free Mode.
 * Costs are approximate acquisition/production costs in millions USD.
 * Templates match weapon loadouts from iran-orbat.ts.
 */
export const iranCatalog: UnitCatalogEntry[] = [
  // ═══════════════════════════════════════════════
  //  AIR DEFENSE — Long Range
  // ═══════════════════════════════════════════════

  {
    id: 'iran_s300',
    name: 'S-300PMU-2 Battery',
    nation: 'iran',
    category: 'sam_site',
    cost_millions: 500,
    description:
      'Russian-supplied S-300PMU-2 Favorit long-range SAM system. 32 48N6E2 interceptors, ' +
      '300 km radar detection range. Backbone of Iranian strategic air defense.',
    template: {
      name: 'S-300PMU-2',
      nation: 'iran',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 100,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 's300_48n6e2', count: 32, maxCount: 32, reloadTimeSec: 720 },
      ],
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92, antenna_height_m: 12 }],
      roe: 'weapons_free',
    },
  },

  {
    id: 'iran_bavar373',
    name: 'Bavar-373 Battery',
    nation: 'iran',
    category: 'sam_site',
    cost_millions: 400,
    description:
      'Indigenous long-range SAM. 24 interceptors, 350 km radar. Iranian-produced ' +
      'counterpart to S-300, guarding strategic sites around Tehran and Isfahan.',
    template: {
      name: 'Bavar-373',
      nation: 'iran',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 100,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'bavar373_int', count: 24, maxCount: 24, reloadTimeSec: 600 },
      ],
      sensors: [{ type: 'radar', range_km: 350, detection_prob: 0.90, antenna_height_m: 12 }],
      roe: 'weapons_free',
    },
  },

  // ═══════════════════════════════════════════════
  //  AIR DEFENSE — Medium Range
  // ═══════════════════════════════════════════════

  {
    id: 'iran_khordad',
    name: '3rd Khordad Battery',
    nation: 'iran',
    category: 'sam_site',
    cost_millions: 200,
    description:
      'Indigenous medium-range SAM with Sayyad-3 interceptors. 12 missiles, 150 km radar. ' +
      'Mobile system used for point defense of key installations.',
    template: {
      name: '3rd Khordad',
      nation: 'iran',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'khordad15_int', count: 12, maxCount: 12, reloadTimeSec: 480 },
      ],
      sensors: [{ type: 'radar', range_km: 150, detection_prob: 0.85, antenna_height_m: 8 }],
      roe: 'weapons_free',
    },
  },

  // ═══════════════════════════════════════════════
  //  AIR DEFENSE — Short Range
  // ═══════════════════════════════════════════════

  {
    id: 'iran_tor',
    name: 'Tor-M1 Battery',
    nation: 'iran',
    category: 'sam_site',
    cost_millions: 100,
    description:
      'Russian Tor-M1 short-range SAM for point defense. 8 missiles, 25 km radar. ' +
      'Effective against cruise missiles and low-flying aircraft within its limited envelope.',
    template: {
      name: 'Tor-M1',
      nation: 'iran',
      category: 'sam_site',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 60,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'tor_m1_int', count: 8, maxCount: 8, reloadTimeSec: 300 },
      ],
      sensors: [{ type: 'radar', range_km: 25, detection_prob: 0.88, antenna_height_m: 5 }],
      roe: 'weapons_free',
    },
  },

  // ═══════════════════════════════════════════════
  //  BALLISTIC MISSILES
  // ═══════════════════════════════════════════════

  {
    id: 'iran_shahab3',
    name: 'Shahab-3 TEL',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 30,
    description:
      'Shahab-3 medium-range ballistic missile on TEL. 6 missiles, 1300 km range. ' +
      'Liquid-fueled MRBM — long reload time but significant strategic reach.',
    template: {
      name: 'Shahab-3 TEL',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 40,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'shahab3', count: 6, maxCount: 6, reloadTimeSec: 3600 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'iran_sejjil2',
    name: 'Sejjil-2 TEL',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 50,
    description:
      'Sejjil-2 solid-fueled MRBM. 4 missiles, 2000 km range. Faster launch prep than ' +
      'liquid-fueled Shahab, lower CEP (500m) with GPS augmentation.',
    template: {
      name: 'Sejjil-2 TEL',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 40,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'sejjil2', count: 4, maxCount: 4, reloadTimeSec: 3600 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'iran_fateh110',
    name: 'Fateh-110 Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 20,
    description:
      'Fateh-110 short-range ballistic missile battery. 12 missiles, 300 km range, 100m CEP. ' +
      'Solid-fuel, GPS-guided — workhorse of IRGC tactical strike capability.',
    template: {
      name: 'Fateh-110 Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 40,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'fateh110', count: 12, maxCount: 12, reloadTimeSec: 1800 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'iran_zolfaghar',
    name: 'Zolfaghar Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 25,
    description:
      'Zolfaghar medium-range ballistic missile. 8 missiles, 700 km range. ' +
      'Extended-range Fateh derivative targeting Gulf state bases from western Iran.',
    template: {
      name: 'Zolfaghar Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 40,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'zolfaghar', count: 8, maxCount: 8, reloadTimeSec: 2400 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  CRUISE MISSILES
  // ═══════════════════════════════════════════════

  {
    id: 'iran_soumar',
    name: 'Soumar GLCM Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 40,
    description:
      'Soumar/Hoveyzeh ground-launched cruise missile. 6 missiles, 1350 km range. ' +
      'Strategic land-attack capability derived from Soviet Kh-55 design.',
    template: {
      name: 'Soumar GLCM Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'soumar', count: 6, maxCount: 6, reloadTimeSec: 2400 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  DRONES / OWA
  // ═══════════════════════════════════════════════

  {
    id: 'iran_shahed136',
    name: 'Shahed-136 Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 10,
    description:
      'Shahed-136/131 one-way attack drone battery. 80 loitering munitions, 900-2500 km range, ' +
      'Mach 0.15. Cheap saturation weapon — overwhelming in numbers.',
    template: {
      name: 'Shahed-136 Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'shahed_136', count: 50, maxCount: 50, reloadTimeSec: 0 },
        { weaponId: 'shahed_131', count: 30, maxCount: 30, reloadTimeSec: 0 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  {
    id: 'iran_shahed238',
    name: 'Shahed-238 Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 25,
    description:
      'Shahed-238 jet-powered one-way attack drone. Faster than Shahed-136. ' +
      'Turbojet propulsion with improved guidance and larger warhead.',
    template: {
      name: 'Shahed-238 Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'shahed_238', count: 30, maxCount: 30, reloadTimeSec: 0 },
        { weaponId: 'shahed_136', count: 20, maxCount: 20, reloadTimeSec: 0 },
      ],
      sensors: [],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  COASTAL / ANTI-SHIP
  // ═══════════════════════════════════════════════

  {
    id: 'iran_coastal',
    name: 'Coastal Defense Battery',
    nation: 'iran',
    category: 'missile_battery',
    cost_millions: 30,
    description:
      'Strait of Hormuz coastal defense battery with Noor ASCMs and Khalij Fars ASBMs. ' +
      'Controls chokepoints with radar-guided anti-ship capability.',
    template: {
      name: 'Coastal Defense Battery',
      nation: 'iran',
      category: 'missile_battery',
      heading: 180,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 100,
      logistics: 0,
      supplyStocks: [],
      weapons: [
        { weaponId: 'noor', count: 12, maxCount: 12, reloadTimeSec: 1200 },
        { weaponId: 'khalij_fars', count: 4, maxCount: 4, reloadTimeSec: 2400 },
      ],
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.80, antenna_height_m: 10 }],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  NAVAL
  // ═══════════════════════════════════════════════

  {
    id: 'iran_ghadir',
    name: 'Ghadir-class Submarine',
    nation: 'iran',
    category: 'submarine',
    cost_millions: 100,
    description:
      'Ghadir-class midget submarine. No torpedo tubes in game model but provides sonar ' +
      'coverage in the Strait of Hormuz. Slow (11 kt max), limited detection range.',
    template: {
      name: 'Ghadir-class Sub',
      nation: 'iran',
      category: 'submarine',
      heading: 200,
      speed_kts: 3,
      maxSpeed_kts: 11,
      health: 100,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [],
      sensors: [{ type: 'sonar', range_km: 15, detection_prob: 0.60 }],
      roe: 'weapons_tight',
    },
  },

  // ═══════════════════════════════════════════════
  //  AIRBASES
  // ═══════════════════════════════════════════════

  {
    id: 'iran_airbase',
    name: 'IRIAF Airbase',
    nation: 'iran',
    category: 'airbase',
    cost_millions: 500,
    description:
      'Iranian Air Force tactical fighter base. Hardened facilities with 300 km radar ' +
      'coverage. Limited offensive capability but serves as logistics and C2 node.',
    template: {
      name: 'IRIAF Airbase',
      nation: 'iran',
      category: 'airbase',
      heading: 0,
      speed_kts: 0,
      maxSpeed_kts: 0,
      health: 100,
      hardness: 200,
      logistics: 0,
      supplyStocks: [],
      weapons: [],
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85, antenna_height_m: 20 }],
      roe: 'weapons_tight',
    },
  },
]
