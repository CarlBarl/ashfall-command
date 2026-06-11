import type { AgentSource } from '@/types/game'
import type { Position } from '@/types/game'

/**
 * Named HUMINT sources — design: docs/plans/intel-suite-v3.md §1.4.
 * Few sources, each a character with a distinct product. Never interchangeable.
 */
export function buildAgentRoster(): Record<string, AgentSource> {
  const agents: AgentSource[] = [
    {
      id: 'amber',
      codename: 'AMBER',
      placement: 'Port logistics clerk, Bandar Abbas',
      product: 'Naval activity: reveals ships near Bandar Abbas & Jask, sortie warnings',
      status: 'active',
      exposure: 10,
      lastTaskedTick: -999_999,
    },
    {
      id: 'opal',
      codename: 'OPAL',
      placement: 'IRGC missile-force logistics officer',
      product: 'TEL hunt: pinpoints hidden missile batteries (identified-level)',
      status: 'active',
      exposure: 20,
      lastTaskedTick: -999_999,
    },
    {
      id: 'saffron',
      codename: 'SAFFRON',
      placement: 'Ministry aide, Tehran',
      product: 'Political: exact war support + ceasefire intent readout',
      status: 'active',
      exposure: 15,
      lastTaskedTick: -999_999,
    },
    {
      id: 'garnet',
      codename: 'GARNET',
      placement: 'Coastal observer with camera, Strait of Hormuz',
      product: 'Live observer feed: tracks ships transiting the strait while active',
      status: 'active',
      exposure: 5,
      lastTaskedTick: -999_999,
    },
  ]
  return Object.fromEntries(agents.map(a => [a.id, { ...a }]))
}

/** Coverage boxes per agent (lat/lng bounds) */
export const AGENT_COVERAGE: Record<string, { south: number; west: number; north: number; east: number }> = {
  amber: { south: 25.5, west: 55.0, north: 27.8, east: 58.2 }, // Bandar Abbas + Jask
  garnet: { south: 25.8, west: 55.5, north: 27.2, east: 57.5 }, // Strait of Hormuz
}

/** AMBER/GARNET refresh cadence while active (game-minutes) */
export const AGENT_PASSIVE_INTERVAL_MIN = 30

/** Where arrested-agent fallout is centered for feed click-to-zoom flavor */
export const TEHRAN: Position = { lat: 35.69, lng: 51.39 }
