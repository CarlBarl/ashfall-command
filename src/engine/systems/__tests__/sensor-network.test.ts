import { describe, it, expect } from 'vitest'
import { buildSensorNetwork, detectThreatsNetworked, isDetectedByELINT } from '../sensor-network'
import type { GameState, Unit, Missile, NationId } from '@/types/game'

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
    engagements: new Map(),
    supplyLines: new Map(),
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
