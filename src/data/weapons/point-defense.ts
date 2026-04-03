import type { PointDefenseSpec } from '@/types/game'

/** Point defense system specs — gun-based CIWS and short-range missile systems */
export const pointDefenseSpecs: Record<string, PointDefenseSpec> = {
  // ═══════════════════════════════════════════════
  //  US SYSTEMS
  // ═══════════════════════════════════════════════

  phalanx_ciws: {
    id: 'phalanx_ciws',
    name: 'Phalanx CIWS Block 1B',
    range_km: 1.5,
    pk: {
      cruise_missile: 0.75,
      loitering_munition: 0.90,
      ashm: 0.70,
      ballistic_missile: 0.10,
    },
    ammoPerEngagement: 100, // ~1.3 sec burst from 4500 rpm
    cooldown_sec: 3,
    engagementType: 'gun',
  },

  cram_centurion: {
    id: 'cram_centurion',
    name: 'C-RAM Centurion',
    range_km: 2.0,
    pk: {
      cruise_missile: 0.60,
      loitering_munition: 0.85,
      ashm: 0.50,
      ballistic_missile: 0.05,
    },
    ammoPerEngagement: 100,
    cooldown_sec: 3,
    engagementType: 'gun',
  },

  // SeaRAM — RIM-116 Rolling Airframe Missile (ship self-defense)
  rim116_ram: {
    id: 'rim116_ram',
    name: 'RIM-116 RAM Block 2',
    range_km: 15,
    pk: {
      cruise_missile: 0.85,
      loitering_munition: 0.90,
      ashm: 0.90,
      ballistic_missile: 0.15,
    },
    ammoPerEngagement: 1, // 1 missile per engagement
    cooldown_sec: 2,
    engagementType: 'missile', // fire-and-forget missile, but modeled as PD
  },
}
