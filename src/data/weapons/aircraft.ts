import type { AircraftSpec } from '@/types/game'

export const aircraftSpecs: Record<string, AircraftSpec> = {
  // US Aircraft
  f35a: {
    id: 'f35a',
    name: 'F-35A Lightning II',
    combat_radius_km: 1240, // per USAF/Lockheed Martin
    max_speed_mach: 1.6,
    ceiling_ft: 50000,
    loadout: ['jassm_er', 'jassm_er'],
    readiness_rate: 0.55,
  },
  fa18ef: {
    id: 'fa18ef',
    name: 'F/A-18E/F Super Hornet',
    combat_radius_km: 740,
    max_speed_mach: 1.8,
    ceiling_ft: 50000,
    loadout: ['harpoon', 'jassm_er'],
    readiness_rate: 0.70,
  },
  f15e: {
    id: 'f15e',
    name: 'F-15E Strike Eagle',
    combat_radius_km: 1270,
    max_speed_mach: 2.5,
    ceiling_ft: 60000,
    loadout: ['jassm_er', 'jassm_er'],
    readiness_rate: 0.70,
  },
  b2: {
    id: 'b2',
    name: 'B-2A Spirit',
    combat_radius_km: 5600,
    max_speed_mach: 0.95,
    ceiling_ft: 50000,
    loadout: ['jassm_er', 'jassm_er', 'jassm_er', 'jassm_er'],
    readiness_rate: 0.40,
  },

  // Iranian Aircraft
  f14a: {
    id: 'f14a',
    name: 'F-14A Tomcat (IRIAF)',
    combat_radius_km: 926,
    max_speed_mach: 2.34,
    ceiling_ft: 53000,
    loadout: [],
    readiness_rate: 0.30,
  },
  mig29: {
    id: 'mig29',
    name: 'MiG-29A Fulcrum',
    combat_radius_km: 710,
    max_speed_mach: 2.25,
    ceiling_ft: 59000,
    loadout: [],
    readiness_rate: 0.45,
  },
  su24: {
    id: 'su24',
    name: 'Su-24M Fencer',
    combat_radius_km: 615,
    max_speed_mach: 1.35,
    ceiling_ft: 36000,
    loadout: [],
    readiness_rate: 0.35,
  },
}
