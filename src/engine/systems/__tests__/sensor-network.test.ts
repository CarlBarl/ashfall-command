import { describe, it, expect } from 'vitest'
import { buildSensorNetwork, detectThreatsNetworked, isDetectedByELINT } from '../sensor-network'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

function makeMissile(overrides: Partial<Missile> & { id: string }): Missile {
  return {
    weaponId: 'shahab3',
    launcherId: 'ir_launcher',
    targetId: 'us_target',
    nation: 'iran',
    path: [[51, 25.2], [51, 25.19]],
    timestamps: [0, 60_000],
    status: 'inflight',
    launchTime: 0,
    eta: 60_000,
    altitude_m: 20_000,
    phase: 'midcourse',
    speed_current_mach: 5,
    fuel_remaining_sec: 600,
    is_interceptor: false,
    ...overrides,
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'sam_site',
    position: { lat: 25, lng: 51 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    hardness: 100,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    sensors: [],
    roe: 'weapons_free',
    status: 'ready',
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function makeState(units: Unit[], missiles: Missile[] = []): GameState {
  const unitMap = new Map(units.map(u => [u.id, u]))
  const missileMap = new Map(missiles.map(m => [m.id, m]))
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 10, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: ['iran'] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: ['usa'] },
    },
    units: unitMap,
    missiles: missileMap,
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
  }
}

// ── Tests ───────────────────────────────────────────────────────

describe('buildSensorNetwork', () => {
  it('connects units to hubs within datalink range', () => {
    const hub = makeUnit({
      id: 'awacs',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95 }],
      datalink_range_km: 600,
    })
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25.5, lng: 51.5 }, // ~70km away
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const state = makeState([hub, sam])
    const network = buildSensorNetwork(state)

    const samConnections = network.connections.get('patriot') ?? []
    expect(samConnections).toContain('awacs')
  })

  it('does not connect units beyond datalink range', () => {
    const hub = makeUnit({
      id: 'awacs',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95 }],
      datalink_range_km: 100, // short range
    })
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 30, lng: 51 }, // ~550km away
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const state = makeState([hub, sam])
    const network = buildSensorNetwork(state)

    const samConnections = network.connections.get('patriot') ?? []
    expect(samConnections).not.toContain('awacs')
  })

  it('does not connect units across nations', () => {
    const usaHub = makeUnit({
      id: 'usa_awacs',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95 }],
      datalink_range_km: 600,
    })
    const iranSam = makeUnit({
      id: 'iran_s300',
      nation: 'iran',
      position: { lat: 25.5, lng: 51.5 },
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92 }],
    })
    const state = makeState([usaHub, iranSam])
    const network = buildSensorNetwork(state)

    const iranConnections = network.connections.get('iran_s300') ?? []
    expect(iranConnections).not.toContain('usa_awacs')
  })

  it('excludes destroyed units from network', () => {
    const hub = makeUnit({
      id: 'awacs',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 400, detection_prob: 0.95 }],
      datalink_range_km: 600,
      status: 'destroyed',
    })
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25.5, lng: 51.5 },
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const state = makeState([hub, sam])
    const network = buildSensorNetwork(state)

    const samConnections = network.connections.get('patriot') ?? []
    expect(samConnections).toHaveLength(0)
  })
})

describe('detectThreatsNetworked', () => {
  it('returns own detections with quality "own"', () => {
    // This is a basic smoke test — full detection tests require missiles in flight
    const sam = makeUnit({
      id: 'patriot',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 180, detection_prob: 0.95 }],
    })
    const state = makeState([sam])
    const network = buildSensorNetwork(state)

    const threats = detectThreatsNetworked(state, sam, network)
    // No missiles in flight → no threats
    expect(threats).toHaveLength(0)
  })

  it('resolves quality per receiver: own radar, shared hub = tracked, nation picture = detected', () => {
    // Detector sees the missile (~22km) and feeds hub_a
    const detector = makeUnit({
      id: 'detector',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.95 }],
    })
    const hubA = makeUnit({
      id: 'hub_a',
      nation: 'usa',
      position: { lat: 25, lng: 51.2 },
      sensors: [{ type: 'radar', range_km: 1, detection_prob: 0.95 }],
      datalink_range_km: 100,
    })
    // Shares hub_a with the detector, but can't see the missile itself (10km radar)
    const samA = makeUnit({
      id: 'sam_a',
      nation: 'usa',
      position: { lat: 25, lng: 51.5 },
      sensors: [{ type: 'radar', range_km: 10, detection_prob: 0.95 }],
    })
    // Far east on its own hub — no shared hub with the detector
    const hubB = makeUnit({
      id: 'hub_b',
      nation: 'usa',
      position: { lat: 25, lng: 53.1 },
      sensors: [{ type: 'radar', range_km: 1, detection_prob: 0.95 }],
      datalink_range_km: 50,
    })
    const samB = makeUnit({
      id: 'sam_b',
      nation: 'usa',
      position: { lat: 25, lng: 53 },
      sensors: [{ type: 'radar', range_km: 10, detection_prob: 0.95 }],
    })

    const missile = makeMissile({ id: 'inbound' })
    const state = makeState([detector, hubA, samA, hubB, samB], [missile])
    state.time.timestamp = 30_000 // mid-flight on the missile's [0, 60000] timestamps

    const network = buildSensorNetwork(state)

    const detThreats = detectThreatsNetworked(state, detector, network)
    expect(detThreats).toHaveLength(1)
    expect(detThreats[0].networkQuality).toBe('own')

    const aThreats = detectThreatsNetworked(state, samA, network)
    expect(aThreats).toHaveLength(1)
    expect(aThreats[0].networkQuality).toBe('tracked')

    const bThreats = detectThreatsNetworked(state, samB, network)
    expect(bThreats).toHaveLength(1)
    expect(bThreats[0].networkQuality).toBe('detected')
  })
})

describe('localDetections stash', () => {
  function makeDetectorState() {
    const detector = makeUnit({
      id: 'detector',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.95 }],
    })
    const hub = makeUnit({
      id: 'hub',
      nation: 'usa',
      position: { lat: 25, lng: 51.2 },
      sensors: [{ type: 'radar', range_km: 1, detection_prob: 0.95 }],
      datalink_range_km: 100,
    })
    const missile = makeMissile({ id: 'inbound' })
    const state = makeState([detector, hub], [missile])
    state.time.timestamp = 30_000 // mid-flight on the missile's [0, 60000] timestamps
    return { state, detector, missile }
  }

  it('buildSensorNetwork stashes per-unit local detections; non-detecting units absent', () => {
    const { state } = makeDetectorState()
    const blind = makeUnit({
      id: 'blind',
      nation: 'usa',
      position: { lat: 25, lng: 52 },
      sensors: [{ type: 'radar', range_km: 1, detection_prob: 0.95 }],
    })
    state.units.set('blind', blind)

    const network = buildSensorNetwork(state)

    expect(network.localDetections.get('detector')).toHaveLength(1)
    expect(network.localDetections.get('detector')![0].missile.id).toBe('inbound')
    expect(network.localDetections.has('blind')).toBe(false)
  })

  it('detectThreatsNetworked consumes the stash and falls back to a fresh call when absent', () => {
    const { state, detector } = makeDetectorState()
    const network = buildSensorNetwork(state)

    // Stashed own detection wins
    expect(detectThreatsNetworked(state, detector, network)[0].networkQuality).toBe('own')

    // Present-but-empty stash entry is trusted → only the hub-relayed track remains
    network.localDetections.set('detector', [])
    expect(detectThreatsNetworked(state, detector, network)[0].networkQuality).toBe('tracked')

    // Absent entry → fresh detectThreats call restores the own-quality track
    network.localDetections.delete('detector')
    expect(detectThreatsNetworked(state, detector, network)[0].networkQuality).toBe('own')
  })

  it('drops stashed own detections whose missile resolved mid-tick', () => {
    const { state, detector, missile } = makeDetectorState()
    state.units.delete('hub') // no network paths — own detections only
    const network = buildSensorNetwork(state)
    expect(network.localDetections.get('detector')).toHaveLength(1)

    missile.status = 'intercepted'
    expect(detectThreatsNetworked(state, detector, network)).toHaveLength(0)
  })
})

describe('ELINT detection', () => {
  it('detects enemy radar within 1.5x range', () => {
    // USA unit at 25,51 — Iran radar at 25.5,51.5 with 300km range
    // Distance ~70km, 1.5x range = 450km → detected
    const usaSensor = makeUnit({
      id: 'usa_elint',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.9 }],
    })
    const iranRadar = makeUnit({
      id: 'iran_s300',
      nation: 'iran',
      position: { lat: 25.5, lng: 51.5 },
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92 }],
    })
    const state = makeState([usaSensor, iranRadar])
    const network = buildSensorNetwork(state)

    // USA should detect Iran's radar via ELINT
    expect(isDetectedByELINT(network, 'usa', 'iran_s300')).toBe(true)
    // Iran should also detect USA's radar via ELINT (distance ~70km, 1.5x100=150km)
    expect(isDetectedByELINT(network, 'iran', 'usa_elint')).toBe(true)
  })

  it('does not detect enemy radar beyond 1.5x range', () => {
    // USA unit very far from Iran radar → not detected
    const usaSensor = makeUnit({
      id: 'usa_elint',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.9 }],
    })
    const iranRadar = makeUnit({
      id: 'iran_s300',
      nation: 'iran',
      position: { lat: 30, lng: 56 }, // ~700km away
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92 }],
    })
    const state = makeState([usaSensor, iranRadar])
    const network = buildSensorNetwork(state)

    // 1.5x300=450km, distance ~700km → not detected
    expect(isDetectedByELINT(network, 'usa', 'iran_s300')).toBe(false)
  })

  it('does not detect units without radar sensors', () => {
    // Iran missile battery with no radar → not detected via ELINT
    const usaSensor = makeUnit({
      id: 'usa_elint',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 100, detection_prob: 0.9 }],
    })
    const iranBattery = makeUnit({
      id: 'iran_missile',
      nation: 'iran',
      position: { lat: 25.5, lng: 51.5 }, // ~70km away, close enough
      sensors: [], // no radar
    })
    const state = makeState([usaSensor, iranBattery])
    const network = buildSensorNetwork(state)

    expect(isDetectedByELINT(network, 'usa', 'iran_missile')).toBe(false)
  })

  it('does not detect same-nation units', () => {
    const usaRadar1 = makeUnit({
      id: 'usa_radar1',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.95 }],
    })
    const usaRadar2 = makeUnit({
      id: 'usa_radar2',
      nation: 'usa',
      position: { lat: 25.1, lng: 51.1 }, // very close
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.95 }],
    })
    const state = makeState([usaRadar1, usaRadar2])
    const network = buildSensorNetwork(state)

    // Same nation — should NOT appear in ELINT detections
    expect(isDetectedByELINT(network, 'usa', 'usa_radar2')).toBe(false)
  })

  it('requires detecting unit to have sensors', () => {
    // Unit with no sensors can't detect ELINT emissions
    const usaNoSensors = makeUnit({
      id: 'usa_base',
      nation: 'usa',
      position: { lat: 25, lng: 51 },
      sensors: [], // no sensors
    })
    const iranRadar = makeUnit({
      id: 'iran_s300',
      nation: 'iran',
      position: { lat: 25.1, lng: 51.1 }, // very close
      sensors: [{ type: 'radar', range_km: 300, detection_prob: 0.92 }],
    })
    const state = makeState([usaNoSensors, iranRadar])
    const network = buildSensorNetwork(state)

    // USA has no sensor-capable units → can't detect ELINT
    expect(isDetectedByELINT(network, 'usa', 'iran_s300')).toBe(false)
  })
})
