import type { ADSystemSpec } from '@/types/game'

export const adSystems: Record<string, ADSystemSpec> = {
  // US Systems
  patriot_pac3: {
    id: 'patriot_pac3',
    name: 'MIM-104 Patriot PAC-3',
    radar_range_km: 180,
    engagement_range_km: 60,
    max_altitude_m: 40000, // published max; was 24km
    fire_channels: 9,
    reload_time_sec: 600,
    interceptorId: 'pac3_mse',
  },
  thaad: {
    id: 'thaad',
    name: 'THAAD',
    radar_range_km: 1000,
    engagement_range_km: 200,
    max_altitude_m: 150000,
    fire_channels: 8,
    reload_time_sec: 900,
    interceptorId: 'thaad_int',
  },
  aegis_bmd: {
    id: 'aegis_bmd',
    name: 'Aegis BMD (SM-3)',
    radar_range_km: 370, // SPY-1D organic range for BM targets
    engagement_range_km: 1200, // SM-3 IIA per CSIS; was 700
    max_altitude_m: 500000,
    fire_channels: 18,
    reload_time_sec: 0, // VLS cells, no reload in combat
    interceptorId: 'sm3_iia',
  },
  aegis_aaw: {
    id: 'aegis_aaw',
    name: 'Aegis AAW (SM-6)',
    radar_range_km: 370, // SPY-1D organic range
    engagement_range_km: 370, // per CSIS; was 460
    max_altitude_m: 33000,
    fire_channels: 18,
    reload_time_sec: 0,
    interceptorId: 'sm6',
  },
  aegis_sm2: {
    id: 'aegis_sm2',
    name: 'Aegis (SM-2)',
    radar_range_km: 370,
    engagement_range_km: 167,
    max_altitude_m: 24000,
    fire_channels: 12,
    reload_time_sec: 0,
    interceptorId: 'sm2_iiia',
  },

  // Iranian Systems
  s300pmu2: {
    id: 's300pmu2',
    name: 'S-300PMU-2 Favorit',
    radar_range_km: 300,
    engagement_range_km: 195,
    max_altitude_m: 27000,
    fire_channels: 6,
    reload_time_sec: 720,
    interceptorId: 's300_48n6e2',
  },
  bavar373: {
    id: 'bavar373',
    name: 'Bavar-373',
    radar_range_km: 350,
    engagement_range_km: 200,
    max_altitude_m: 27000,
    fire_channels: 6,
    reload_time_sec: 600,
    interceptorId: 'bavar373_int',
  },
  khordad15: {
    id: 'khordad15',
    name: '3rd Khordad (Khordad-15)',
    radar_range_km: 150,
    engagement_range_km: 120,
    max_altitude_m: 27000,
    fire_channels: 4,
    reload_time_sec: 480,
    interceptorId: 'khordad15_int',
  },
  tor_m1: {
    id: 'tor_m1',
    name: 'Tor-M1',
    radar_range_km: 25,
    engagement_range_km: 12, // per CSIS — must match interceptor range_km
    max_altitude_m: 6000,
    fire_channels: 2,
    reload_time_sec: 300,
    interceptorId: 'tor_m1_int',
  },
}
