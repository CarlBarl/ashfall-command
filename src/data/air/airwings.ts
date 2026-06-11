import type { SquadronState, UnitId } from '@/types/game'

/**
 * Air wings per host unit — design: docs/plans/air-war-v5.md §1.
 * CVW-9 composition matches the real 2026 Lincoln deployment; Iranian numbers
 * reflect the June-2025 reality (low readiness, parked airframes).
 * `available` is set at init time (total minus maintenance) by initAirWings.
 */
const sq = (id: string, name: string, airframe: SquadronState['airframe'], total: number): SquadronState => ({
  id,
  name,
  airframe,
  total,
  available: total,
  readyAt: [],
})

export const AIR_WINGS: Record<UnitId, SquadronState[]> = {
  // ── USA: CVW-9 aboard CVN-72 Abraham Lincoln ──
  cvn72_lincoln: [
    sq('vfa14', 'VFA-14 Tophatters', 'fa18e', 12),
    sq('vfa41', 'VFA-41 Black Aces', 'fa18e', 12),
    sq('vfa97', 'VFA-97 Warhawks', 'f35c', 10),
    sq('vaq133', 'VAQ-133 Wizards', 'ea18g', 6),
    sq('vaw116', 'VAW-116 Sun Kings', 'e2d', 5),
  ],
  // Land-based USAF detachments
  al_udeid: [
    sq('efs_udeid', '94th EFS (F-15E det.)', 'fa18e', 8),
  ],
  al_dhafra: [
    sq('efs_dhafra', '380th AEW (F-35A det.)', 'f35c', 6),
  ],

  // ── Iran: IRIAF (scramble-only readiness) ──
  isfahan_ab: [
    sq('tfb8_f14', '81st TFS Tomcats', 'f14', 12),
  ],
  mehrabad: [
    sq('tfb1_su35', 'Su-35SE Group', 'su35', 8),
    sq('tfb1_mig29', '11th TFS Fulcrums', 'mig29', 10),
  ],
  tabriz_ab: [
    sq('tfb2_mig29', '23rd TFS Fulcrums', 'mig29', 8),
  ],
  bushehr_ab: [
    sq('tfb6_su24', '72nd TFS Fencers', 'su24', 10),
  ],
}
