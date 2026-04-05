import type { Unit } from '@/types/game'

let uid = 0
const u = (partial: Omit<Unit, 'id' | 'status' | 'waypoints' | 'subordinateIds' | 'logistics' | 'supplyStocks' | 'maxHealth' | 'pointDefense'> & { id?: string; logistics?: number; supplyStocks?: Unit['supplyStocks']; maxHealth?: number; pointDefense?: Unit['pointDefense'] }): Unit => ({
  status: 'ready',
  waypoints: [],
  subordinateIds: [],
  logistics: 0,
  supplyStocks: [],
  maxHealth: 100,
  pointDefense: [],
  ...partial,
  id: partial.id ?? `iran_${++uid}`,
})

export const iranUnits: Unit[] = [
  // ═══════════════════════════════════════════════
  //  SAM SITES — Long Range
  // ═══════════════════════════════════════════════

  u({
    id: 's300_isfahan', name: 'S-300PMU-2 (Isfahan)', nation: 'iran', category: 'sam_site',
    position: { lat: 32.66, lng: 51.68 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 's300_48n6e2', count: 32, maxCount: 32, reloadTimeSec: 720 },
    ],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92, antenna_height_m: 12, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  u({
    id: 's300_bushehr', name: 'S-300PMU-2 (Bushehr)', nation: 'iran', category: 'sam_site',
    position: { lat: 28.97, lng: 50.83 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 's300_48n6e2', count: 32, maxCount: 32, reloadTimeSec: 720 },
    ],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92, antenna_height_m: 12, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  u({
    id: 's300_natanz', name: 'S-300PMU-2 (Natanz)', nation: 'iran', category: 'sam_site',
    position: { lat: 33.73, lng: 51.73 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 's300_48n6e2', count: 32, maxCount: 32, reloadTimeSec: 720 },
    ],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92, antenna_height_m: 12, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  u({
    id: 'bavar_tehran', name: 'Bavar-373 (Tehran)', nation: 'iran', category: 'sam_site',
    position: { lat: 35.69, lng: 51.39 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'bavar373_int', count: 24, maxCount: 24, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 350, detection_prob: 0.90, antenna_height_m: 12, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  u({
    id: 'bavar_esfahan', name: 'Bavar-373 (Isfahan #2)', nation: 'iran', category: 'sam_site',
    position: { lat: 32.50, lng: 51.80 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'bavar373_int', count: 24, maxCount: 24, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 350, detection_prob: 0.90, antenna_height_m: 12, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  // Medium Range SAMs
  u({
    id: 'khordad_tehran', name: '3rd Khordad (Tehran)', nation: 'iran', category: 'sam_site',
    position: { lat: 35.75, lng: 51.25 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'khordad15_int', count: 12, maxCount: 12, reloadTimeSec: 480 },
    ],
    sensors: [{ type: 'radar', range_km: 150, detection_prob: 0.85, antenna_height_m: 8, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  u({
    id: 'khordad_bandar', name: '3rd Khordad (Bandar Abbas)', nation: 'iran', category: 'sam_site',
    position: { lat: 27.18, lng: 56.27 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'khordad15_int', count: 12, maxCount: 12, reloadTimeSec: 480 },
    ],
    sensors: [{ type: 'radar', range_km: 150, detection_prob: 0.85, antenna_height_m: 8, sector_deg: 90 }],
    roe: 'weapons_free',
  }),

  // Short Range — Tor-M1
  u({
    id: 'tor_isfahan', name: 'Tor-M1 (Isfahan)', nation: 'iran', category: 'sam_site',
    position: { lat: 32.70, lng: 51.65 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'tor_m1_int', count: 8, maxCount: 8, reloadTimeSec: 300 },
    ],
    sensors: [{ type: 'radar', range_km: 25, detection_prob: 0.88, antenna_height_m: 5 }],
    roe: 'weapons_free',
  }),

  u({
    id: 'tor_bushehr', name: 'Tor-M1 (Bushehr)', nation: 'iran', category: 'sam_site',
    position: { lat: 28.95, lng: 50.85 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'tor_m1_int', count: 8, maxCount: 8, reloadTimeSec: 300 },
    ],
    sensors: [{ type: 'radar', range_km: 25, detection_prob: 0.88, antenna_height_m: 5 }],
    roe: 'weapons_free',
  }),

  // ═══════════════════════════════════════════════
  //  MISSILE BATTERIES — IRGC Aerospace Force
  // ═══════════════════════════════════════════════

  u({
    id: 'shahab_tabriz', name: 'Shahab-3 TEL (Tabriz)', nation: 'iran', category: 'missile_battery',
    position: { lat: 38.08, lng: 46.29 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'shahab3', count: 6, maxCount: 6, reloadTimeSec: 3600 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'shahab_khorramabad', name: 'Shahab-3 TEL (Khorramabad)', nation: 'iran', category: 'missile_battery',
    position: { lat: 33.49, lng: 48.35 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'shahab3', count: 6, maxCount: 6, reloadTimeSec: 3600 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'sejjil_semnan', name: 'Sejjil-2 TEL (Semnan)', nation: 'iran', category: 'missile_battery',
    position: { lat: 35.58, lng: 53.39 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'sejjil2', count: 4, maxCount: 4, reloadTimeSec: 3600 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'fateh_dezful', name: 'Fateh-110 Battery (Dezful)', nation: 'iran', category: 'missile_battery',
    position: { lat: 32.38, lng: 48.40 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'fateh110', count: 12, maxCount: 12, reloadTimeSec: 1800 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'fateh_shiraz', name: 'Fateh-110 Battery (Shiraz)', nation: 'iran', category: 'missile_battery',
    position: { lat: 29.59, lng: 52.59 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'fateh110', count: 12, maxCount: 12, reloadTimeSec: 1800 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'zolfaghar_kermanshah', name: 'Zolfaghar Battery (Kermanshah)', nation: 'iran', category: 'missile_battery',
    position: { lat: 34.31, lng: 47.07 }, heading: 0, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'zolfaghar', count: 8, maxCount: 8, reloadTimeSec: 2400 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'soumar_base', name: 'Soumar GLCM Battery', nation: 'iran', category: 'missile_battery',
    position: { lat: 34.10, lng: 50.90 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 80,
    weapons: [
      { weaponId: 'soumar', count: 6, maxCount: 6, reloadTimeSec: 2400 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  // ═══════════════════════════════════════════════
  //  NAVY — IRIN & IRGC-N
  // ═══════════════════════════════════════════════

  u({
    id: 'ghadir_sub1', name: 'Ghadir-class Sub (Bandar Abbas)', nation: 'iran', category: 'submarine',
    position: { lat: 26.8, lng: 56.3 }, heading: 200, speed_kts: 3, maxSpeed_kts: 11,
    health: 100, hardness: 80,
    weapons: [],
    sensors: [{ type: 'sonar', range_km: 15, detection_prob: 0.60 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'ghadir_sub2', name: 'Ghadir-class Sub (Jask)', nation: 'iran', category: 'submarine',
    position: { lat: 25.6, lng: 57.8 }, heading: 180, speed_kts: 3, maxSpeed_kts: 11,
    health: 100, hardness: 80,
    weapons: [],
    sensors: [{ type: 'sonar', range_km: 15, detection_prob: 0.60 }],
    roe: 'weapons_tight',
  }),

  // Coastal defense
  u({
    id: 'hormuz_coastal', name: 'Hormuz Coastal Battery', nation: 'iran', category: 'missile_battery',
    position: { lat: 26.55, lng: 56.20 }, heading: 180, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'noor', count: 12, maxCount: 12, reloadTimeSec: 1200 },
      { weaponId: 'khalij_fars', count: 4, maxCount: 4, reloadTimeSec: 2400 },
    ],
    sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.80, antenna_height_m: 10 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'qeshm_coastal', name: 'Qeshm Island Battery', nation: 'iran', category: 'missile_battery',
    position: { lat: 26.87, lng: 55.88 }, heading: 200, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'noor', count: 8, maxCount: 8, reloadTimeSec: 1200 },
    ],
    sensors: [{ type: 'radar', range_km: 80, detection_prob: 0.75, antenna_height_m: 10 }],
    roe: 'weapons_tight',
  }),

  // Fast attack craft
  u({
    id: 'fac_group1', name: 'IRGC FAC Group (Hormuz)', nation: 'iran', category: 'ship',
    position: { lat: 26.7, lng: 56.0 }, heading: 270, speed_kts: 8, maxSpeed_kts: 45,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'noor', count: 4, maxCount: 4, reloadTimeSec: 0 },
    ],
    sensors: [{ type: 'radar', range_km: 40, detection_prob: 0.70, antenna_height_m: 8 }],
    roe: 'weapons_tight',
  }),

  // ═══════════════════════════════════════════════
  //  AIRBASES — IRIAF
  // ═══════════════════════════════════════════════

  u({
    id: 'mehrabad', name: 'Mehrabad Air Base (Tehran)', nation: 'iran', category: 'airbase',
    position: { lat: 35.69, lng: 51.31 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85, antenna_height_m: 20 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'isfahan_ab', name: 'Isfahan Air Base (8th TFB)', nation: 'iran', category: 'airbase',
    position: { lat: 32.75, lng: 51.86 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85, antenna_height_m: 20 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'bushehr_ab', name: 'Bushehr Air Base', nation: 'iran', category: 'airbase',
    position: { lat: 28.95, lng: 50.83 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 250, detection_prob: 0.80, antenna_height_m: 20 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'bandar_abbas_ab', name: 'Bandar Abbas Air Base', nation: 'iran', category: 'airbase',
    position: { lat: 27.22, lng: 56.38 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 250, detection_prob: 0.80, antenna_height_m: 20 }],
    roe: 'weapons_tight',
  }),

  u({
    id: 'tabriz_ab', name: 'Tabriz Air Base (2nd TFB)', nation: 'iran', category: 'airbase',
    position: { lat: 38.13, lng: 46.24 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.85, antenna_height_m: 20 }],
    roe: 'weapons_tight',
  }),

  // ═══════════════════════════════════════════════
  //  DRONE LAUNCHERS — IRGC Shahed OWA Drones
  // ═══════════════════════════════════════════════

  // Shahed-136 rack launchers — primary saturation weapon
  // 5-drone racks, multiple TELs per battery, dispersed around western Iran
  u({
    id: 'shahed_kermanshah', name: 'Shahed-136 Battery (Kermanshah)', nation: 'iran', category: 'missile_battery',
    position: { lat: 34.35, lng: 47.15 }, heading: 270, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'shahed_136', count: 50, maxCount: 50, reloadTimeSec: 0 },
      { weaponId: 'shahed_131', count: 30, maxCount: 30, reloadTimeSec: 0 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'shahed_dezful', name: 'Shahed-136 Battery (Dezful)', nation: 'iran', category: 'missile_battery',
    position: { lat: 32.40, lng: 48.35 }, heading: 240, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'shahed_136', count: 50, maxCount: 50, reloadTimeSec: 0 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  u({
    id: 'shahed_isfahan', name: 'Shahed-136 Battery (Isfahan)', nation: 'iran', category: 'missile_battery',
    position: { lat: 32.60, lng: 51.75 }, heading: 210, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'shahed_136', count: 40, maxCount: 40, reloadTimeSec: 0 },
      { weaponId: 'shahed_238', count: 20, maxCount: 20, reloadTimeSec: 0 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),

  // Shahed-238 jet-powered — faster, harder to intercept
  u({
    id: 'shahed_shiraz', name: 'Shahed-238 Battery (Shiraz)', nation: 'iran', category: 'missile_battery',
    position: { lat: 29.55, lng: 52.55 }, heading: 200, speed_kts: 0, maxSpeed_kts: 40,
    health: 100, hardness: 60,
    weapons: [
      { weaponId: 'shahed_238', count: 30, maxCount: 30, reloadTimeSec: 0 },
      { weaponId: 'shahed_136', count: 20, maxCount: 20, reloadTimeSec: 0 },
    ],
    sensors: [],
    roe: 'weapons_tight',
  }),
]
