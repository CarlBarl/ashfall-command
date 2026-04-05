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
  id: partial.id ?? `usa_${++uid}`,
})

export const usaUnits: Unit[] = [
  // ═══════════════════════════════════════════════
  //  AIRBASES
  // ═══════════════════════════════════════════════

  u({
    id: 'al_udeid', name: 'Al Udeid Air Base', nation: 'usa', category: 'airbase',
    position: { lat: 25.117, lng: 51.315 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 96, maxCount: 96, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'cram_centurion', active: true, ammo: 2000, maxAmmo: 2000 },
    ],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  u({
    id: 'al_dhafra', name: 'Al Dhafra Air Base', nation: 'usa', category: 'airbase',
    position: { lat: 24.248, lng: 54.547 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 48, maxCount: 48, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'cram_centurion', active: true, ammo: 2000, maxAmmo: 2000 },
    ],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  u({
    id: 'prince_sultan', name: 'Prince Sultan Air Base', nation: 'usa', category: 'airbase',
    position: { lat: 24.062, lng: 47.580 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 64, maxCount: 64, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'cram_centurion', active: true, ammo: 2000, maxAmmo: 2000 },
    ],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  u({
    id: 'ali_al_salem', name: 'Ali Al Salem Air Base', nation: 'usa', category: 'airbase',
    position: { lat: 29.347, lng: 47.521 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 32, maxCount: 32, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'cram_centurion', active: true, ammo: 1550, maxAmmo: 1550 },
    ],
    sensors: [{ type: 'radar', range_km: 350, detection_prob: 0.90, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  u({
    id: 'incirlik', name: 'Incirlik Air Base', nation: 'usa', category: 'airbase',
    position: { lat: 37.002, lng: 35.426 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 48, maxCount: 48, reloadTimeSec: 0 },
    ],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  u({
    id: 'diego_garcia', name: 'Diego Garcia', nation: 'usa', category: 'airbase',
    position: { lat: -7.313, lng: 72.411 }, heading: 0, speed_kts: 0, maxSpeed_kts: 0,
    health: 100, hardness: 200,
    weapons: [
      { weaponId: 'jassm_er', count: 80, maxCount: 80, reloadTimeSec: 0 },
    ],
    sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.90, antenna_height_m: 25 }],
    roe: 'weapons_tight',
    datalink_range_km: 150,
  }),

  // ═══════════════════════════════════════════════
  //  NAVAL — Carrier Strike Group
  // ═══════════════════════════════════════════════

  u({
    id: 'cvn72_lincoln', name: 'CVN-72 Abraham Lincoln CSG', nation: 'usa', category: 'carrier_group',
    position: { lat: 23.5, lng: 60.0 }, heading: 315, speed_kts: 20, maxSpeed_kts: 30,
    health: 100, hardness: 250,
    weapons: [
      { weaponId: 'tomahawk', count: 60, maxCount: 60, reloadTimeSec: 0 },
      { weaponId: 'sm6', count: 120, maxCount: 120, reloadTimeSec: 0 },
      { weaponId: 'sm3_iia', count: 24, maxCount: 24, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 16, maxCount: 16, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
      { specId: 'rim116_ram', active: true, ammo: 21, maxAmmo: 21 },
    ],
    sensors: [
      { type: 'radar', range_km: 500, detection_prob: 0.98, antenna_height_m: 50 },
      { type: 'sonar', range_km: 50, detection_prob: 0.70 },
    ],
    roe: 'weapons_tight',
    datalink_range_km: 300,
  }),

  // DDGs in Persian Gulf
  u({
    id: 'ddg_89', name: 'DDG-89 USS Mustin', nation: 'usa', category: 'ship',
    position: { lat: 26.2, lng: 52.5 }, heading: 45, speed_kts: 15, maxSpeed_kts: 30,
    health: 100, hardness: 150,
    weapons: [
      { weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 },
      { weaponId: 'sm6', count: 52, maxCount: 52, reloadTimeSec: 0 },
      { weaponId: 'sm2_iiia', count: 24, maxCount: 24, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
      { specId: 'rim116_ram', active: true, ammo: 21, maxAmmo: 21 },
    ],
    sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.96, antenna_height_m: 30 }],
    roe: 'weapons_tight',
    datalink_range_km: 300,
  }),

  u({
    id: 'ddg_112', name: 'DDG-112 USS Michael Murphy', nation: 'usa', category: 'ship',
    position: { lat: 25.8, lng: 53.0 }, heading: 90, speed_kts: 12, maxSpeed_kts: 30,
    health: 100, hardness: 150,
    weapons: [
      { weaponId: 'tomahawk', count: 20, maxCount: 20, reloadTimeSec: 0 },
      { weaponId: 'sm6', count: 52, maxCount: 52, reloadTimeSec: 0 },
      { weaponId: 'sm2_iiia', count: 24, maxCount: 24, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
      { specId: 'rim116_ram', active: true, ammo: 21, maxAmmo: 21 },
    ],
    sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.96, antenna_height_m: 30 }],
    roe: 'weapons_tight',
    datalink_range_km: 300,
  }),

  u({
    id: 'ddg_75', name: 'DDG-75 USS Donald Cook', nation: 'usa', category: 'ship',
    position: { lat: 24.5, lng: 57.0 }, heading: 270, speed_kts: 10, maxSpeed_kts: 30,
    health: 100, hardness: 150,
    weapons: [
      { weaponId: 'tomahawk', count: 45, maxCount: 45, reloadTimeSec: 0 },
      { weaponId: 'sm6', count: 42, maxCount: 42, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 8, maxCount: 8, reloadTimeSec: 0 },
    ],
    pointDefense: [
      { specId: 'phalanx_ciws', active: true, ammo: 1550, maxAmmo: 1550 },
    ],
    sensors: [{ type: 'radar', range_km: 500, detection_prob: 0.96, antenna_height_m: 30 }],
    roe: 'weapons_tight',
    datalink_range_km: 300,
  }),

  // SSN
  u({
    id: 'ssn_789', name: 'SSN-789 USS Indiana', nation: 'usa', category: 'submarine',
    position: { lat: 25.0, lng: 56.5 }, heading: 180, speed_kts: 5, maxSpeed_kts: 25,
    health: 100, hardness: 120,
    weapons: [
      { weaponId: 'tomahawk', count: 12, maxCount: 12, reloadTimeSec: 0 },
      { weaponId: 'harpoon', count: 4, maxCount: 4, reloadTimeSec: 0 },
    ],
    sensors: [{ type: 'sonar', range_km: 80, detection_prob: 0.85 }],
    roe: 'weapons_tight',
  }),

  // ═══════════════════════════════════════════════
  //  AIR DEFENSE — Patriot Batteries
  // ═══════════════════════════════════════════════

  u({
    id: 'patriot_qatar', name: 'Patriot Battery (Qatar)', nation: 'usa', category: 'sam_site',
    position: { lat: 25.3, lng: 51.5 }, heading: 0, speed_kts: 0, maxSpeed_kts: 25,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
    roe: 'weapons_free',
    readiness: 'deployed', deploy_time_sec: 1800, pack_time_sec: 900,
  }),

  u({
    id: 'patriot_bahrain', name: 'Patriot Battery (Bahrain)', nation: 'usa', category: 'sam_site',
    position: { lat: 26.2, lng: 50.5 }, heading: 0, speed_kts: 0, maxSpeed_kts: 25,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
    roe: 'weapons_free',
    readiness: 'deployed', deploy_time_sec: 1800, pack_time_sec: 900,
  }),

  u({
    id: 'patriot_kuwait', name: 'Patriot Battery (Kuwait)', nation: 'usa', category: 'sam_site',
    position: { lat: 29.2, lng: 47.7 }, heading: 0, speed_kts: 0, maxSpeed_kts: 25,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
    roe: 'weapons_free',
    readiness: 'deployed', deploy_time_sec: 1800, pack_time_sec: 900,
  }),

  u({
    id: 'patriot_saudi', name: 'Patriot Battery (Riyadh)', nation: 'usa', category: 'sam_site',
    position: { lat: 24.7, lng: 46.7 }, heading: 0, speed_kts: 0, maxSpeed_kts: 25,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'pac3_mse', count: 16, maxCount: 16, reloadTimeSec: 600 },
    ],
    sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95, antenna_height_m: 8, sector_deg: 120 }],
    roe: 'weapons_free',
    readiness: 'deployed', deploy_time_sec: 1800, pack_time_sec: 900,
  }),

  // THAAD in UAE
  u({
    id: 'thaad_uae', name: 'THAAD Battery (UAE)', nation: 'usa', category: 'sam_site',
    position: { lat: 24.4, lng: 54.5 }, heading: 0, speed_kts: 0, maxSpeed_kts: 25,
    health: 100, hardness: 100,
    weapons: [
      { weaponId: 'thaad_int', count: 48, maxCount: 48, reloadTimeSec: 900 },
    ],
    sensors: [{ type: 'radar', range_km: 1000, detection_prob: 0.98, antenna_height_m: 10, sector_deg: 120 }],
    roe: 'weapons_free',
    readiness: 'deployed', deploy_time_sec: 1200, pack_time_sec: 600,
  }),

  // ═══════════════════════════════════════════════
  //  AWACS — Airborne Early Warning
  // ═══════════════════════════════════════════════

  u({
    id: 'awacs_e3', name: 'E-3 Sentry AWACS', nation: 'usa', category: 'aircraft',
    position: { lat: 26.0, lng: 50.0 }, heading: 0, speed_kts: 300, maxSpeed_kts: 350,
    health: 100, hardness: 30,
    weapons: [],
    sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95, antenna_height_m: 10000, sector_deg: 360 }],
    roe: 'weapons_free',
    datalink_range_km: 600,
  }),
]
