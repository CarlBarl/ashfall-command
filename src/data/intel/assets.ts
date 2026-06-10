import type { IntelAsset } from '@/types/game'

/**
 * Fixed ISR asset roster — design: docs/plans/intel-suite-v3.md §1.1.
 * revisit_min is in GAME minutes. niirs >= 7 reveals decoys on a pass.
 */
export function buildIntelAssets(): Record<string, IntelAsset> {
  const assets: IntelAsset[] = [
    // ── USA ──
    {
      id: 'kh11',
      nation: 'usa',
      name: 'KH-11 CRYSTAL',
      kind: 'optical_sat',
      status: 'active',
      revisit_min: 240,
      lastCollectionTick: 0,
      niirs: 8,
    },
    {
      id: 'commercial',
      nation: 'usa',
      name: 'Commercial EO layer',
      kind: 'commercial_sat',
      status: 'active',
      revisit_min: 90,
      lastCollectionTick: 0,
      niirs: 5,
    },
    {
      id: 'rc135',
      nation: 'usa',
      name: 'RC-135 RIVET JOINT',
      kind: 'sigint_air',
      status: 'active',
      revisit_min: 0,
      lastCollectionTick: 0,
    },
    {
      id: 'mq4c',
      nation: 'usa',
      name: 'MQ-4C TRITON',
      kind: 'maritime_patrol',
      status: 'active',
      revisit_min: 30,
      lastCollectionTick: 0,
    },
    {
      id: 'sbirs',
      nation: 'usa',
      name: 'SBIRS OPIR',
      kind: 'launch_detection',
      status: 'active',
      revisit_min: 0,
      lastCollectionTick: 0,
    },
    // ── Iran ──
    {
      id: 'noor',
      nation: 'iran',
      name: 'Noor-3',
      kind: 'optical_sat',
      status: 'active',
      revisit_min: 480,
      lastCollectionTick: 0,
      niirs: 2,
    },
    {
      id: 'mohajer10',
      nation: 'iran',
      name: 'Mohajer-10 orbit',
      kind: 'recon_drone',
      status: 'active',
      revisit_min: 60,
      lastCollectionTick: 0,
    },
    {
      id: 'fastboats',
      nation: 'iran',
      name: 'IRGCN picket boats',
      kind: 'fast_boats',
      status: 'active',
      revisit_min: 30,
      lastCollectionTick: 0,
    },
  ]
  return Object.fromEntries(assets.map(a => [a.id, { ...a }]))
}

/** Hormuz approaches box — IRGC picket/OSINT coverage of the carrier (design §1.5) */
export const HORMUZ_OSINT_BOX = { south: 24.5, west: 53.5, north: 27.8, east: 58.5 }

/** Satellite pass footprint half-width (km) */
export const PASS_SWATH_KM = 60
