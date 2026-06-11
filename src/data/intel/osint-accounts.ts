/**
 * Diegetic OSINT account roster — design: docs/plans/intel-suite-v3.md §2.
 * The feed generator (src/intel/osint-feed.ts) is a pure consumer of snapshot
 * events; each account transforms events it "covers" with its own delay,
 * precision and error rate. All handles fictional.
 */

export interface OsintAccount {
  handle: string
  displayName: string
  archetype:
    | 'plane_spotter'
    | 'aggregator'
    | 'oil_analyst'
    | 'imagery_analyst'
    | 'regime_mouthpiece'
    | 'webcam_watcher'
    | 'leak_channel'
    | 'joke_indicator'
  /** Game-seconds delay range from true event to post */
  delayRangeSec: [number, number]
  /** 0-1 chance a given post is wrong/garbled (wrong name, inflated claim) */
  errorRate: number
  /** Feed accent color */
  color: string
}

export const OSINT_ACCOUNTS: OsintAccount[] = [
  {
    handle: '@GulfPlaneWatch',
    displayName: 'Gulf Plane Watch',
    archetype: 'plane_spotter',
    delayRangeSec: [60, 180],
    errorRate: 0.02,
    color: '#7fb3d5',
  },
  {
    handle: '@CENTCOM_Watch',
    displayName: 'CENTCOM Watch',
    archetype: 'aggregator',
    delayRangeSec: [120, 360],
    errorRate: 0.15,
    color: '#e8d27a',
  },
  {
    handle: '@TankerTrackerz',
    displayName: 'Tanker Trackerz',
    archetype: 'oil_analyst',
    delayRangeSec: [43_200, 86_400],
    errorRate: 0.05,
    color: '#8fbf8f',
  },
  {
    handle: '@OrbitalRecon',
    displayName: 'Orbital Recon',
    archetype: 'imagery_analyst',
    delayRangeSec: [21_600, 43_200],
    errorRate: 0.05,
    color: '#b39ddb',
  },
  {
    handle: '@IRGC_Media',
    displayName: 'IRGC Media Desk',
    archetype: 'regime_mouthpiece',
    delayRangeSec: [300, 900],
    errorRate: 0.5,
    color: '#d98880',
  },
  {
    handle: '@StraitSpotter',
    displayName: 'Strait Spotter',
    archetype: 'webcam_watcher',
    delayRangeSec: [120, 480],
    errorRate: 0.08,
    color: '#76c7c0',
  },
  {
    handle: '@SignalDesk',
    displayName: 'Signal Desk',
    archetype: 'leak_channel',
    delayRangeSec: [0, 0], // posts BEFORE the event when it fires (warning channel)
    errorRate: 0.2,
    color: '#f0a35e',
  },
  {
    handle: '@PizzaIndexGulf',
    displayName: 'Gulf Pizza Index',
    archetype: 'joke_indicator',
    delayRangeSec: [0, 0],
    errorRate: 0.4,
    color: '#c8a2c8',
  },
]
