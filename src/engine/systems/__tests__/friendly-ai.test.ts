import { describe, it, expect, beforeEach } from 'vitest'
import { processFriendlyAI, resetFriendlyAIState } from '../friendly-ai'
import { SeededRNG } from '../../utils/rng'
import type { GameState, Sensor, Unit, NationId, WeaponLoadout } from '@/types/game'

// ── Helpers ─────────────────────────────────────────────────────

function makeUnit(overrides: Partial<Unit> & { id: string; nation: NationId }): Unit {
  return {
    name: overrides.id,
    category: 'ship',
    position: { lat: 26, lng: 52 },
    heading: 0,
    speed_kts: 0,
    maxSpeed_kts: 0,
    health: 100,
    maxHealth: 100,
    hardness: 150,
    logistics: 0,
    supplyStocks: [],
    weapons: [],
    pointDefense: [],
    sensors: [],
    roe: 'weapons_free' as const,
    status: 'ready' as const,
    waypoints: [],
    subordinateIds: [],
    ...overrides,
  } as Unit
}

function loadout(weaponId: string, count: number): WeaponLoadout {
  return { weaponId, count, maxCount: count, reloadTimeSec: 0 }
}

// Tall mast keeps the radar horizon out of these doctrine tests
function radar(range_km: number): Sensor {
  return { type: 'radar', range_km, detection_prob: 0.9, antenna_height_m: 2000 }
}

function makeState(units: Unit[]): GameState {
  return {
    playerNation: 'usa',
    initialized: true,
    time: { tick: 1000, timestamp: 1_000_000, speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: {
        id: 'usa', name: 'USA',
        economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 },
        relations: { usa: 100, iran: -60 }, atWar: ['iran'],
      },
      iran: {
        id: 'iran', name: 'Iran',
        economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 },
        relations: { usa: -60, iran: 100 }, atWar: ['usa'],
      },
    },
    units: new Map(units.map(u => [u.id, u])),
    missiles: new Map(),
    supplyLines: new Map(),
    shippingLanes: new Map(),
    events: [],
    pendingEvents: [],
    attackCounters: {},
  }
}

/** Seed a live nation-level contact so datalink engagement is possible */
function seedContact(state: GameState, observer: NationId, target: Unit): void {
  state.visibility ??= {}
  const contacts = (state.visibility[observer as string] ??= {})
  contacts[target.id] = {
    level: 'tracked',
    lastSeenTick: state.time.tick,
    lastKnownPosition: { ...target.position },
  }
}

// Iranian ship ~55km away — inside harpoon (130km) range
const enemyShip = () => makeUnit({ id: 'ir_ship', nation: 'iran', position: { lat: 26.5, lng: 52 } })

// ── Tests ───────────────────────────────────────────────────────

describe('processFriendlyAI', () => {
  beforeEach(() => {
    resetFriendlyAIState()
  })

  it('never auto-fires strategic cruise/ballistic weapons; tactical ashm still fires', () => {
    const ship = makeUnit({
      id: 'us_ship',
      nation: 'usa',
      sensors: [radar(200)],
      weapons: [loadout('tomahawk', 30), loadout('sm6', 12), loadout('harpoon', 8)],
    })
    const state = makeState([ship, enemyShip()])

    // Several cooldown cycles of war under weapons_free
    const fired: string[] = []
    for (let t = 1000; t <= 2900; t += 100) {
      state.time.tick = t
      for (const cmd of processFriendlyAI(state, new SeededRNG(42))) {
        if (cmd.type === 'LAUNCH_MISSILE') fired.push(cmd.weaponId)
      }
    }

    expect(fired.length).toBeGreaterThanOrEqual(1)
    expect(fired.every(w => w === 'harpoon')).toBe(true)
    expect(fired).not.toContain('tomahawk')
    expect(fired).not.toContain('sm6')
  })

  it('does not auto-fire ballistic missiles or loitering munitions', () => {
    const battery = makeUnit({
      id: 'ir_battery',
      nation: 'iran',
      category: 'missile_battery',
      position: { lat: 26.5, lng: 52 },
      sensors: [radar(200)],
      weapons: [loadout('fateh110', 30), loadout('shahed_136', 40)],
    })
    const usTarget = makeUnit({ id: 'us_ship', nation: 'usa', position: { lat: 26, lng: 52 } })
    const state = makeState([battery, usTarget])

    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)
  })

  it('skips non-deployed units without burning their fire cooldown', () => {
    const battery = makeUnit({
      id: 'us_battery',
      nation: 'usa',
      category: 'missile_battery',
      readiness: 'packing',
      readinessTimer: 300,
      deploy_time_sec: 600,
      sensors: [radar(200)],
      weapons: [loadout('harpoon', 8)],
    })
    const state = makeState([battery, enemyShip()])

    state.time.tick = 1000
    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)

    // Once deployed it fires immediately — the rejected pass must not have started the cooldown
    battery.readiness = 'deployed'
    state.time.tick = 1001
    const cmds = processFriendlyAI(state, new SeededRNG(42))
    expect(cmds.length).toBeGreaterThanOrEqual(1)
  })

  it('holds fire with no track: blind ships cannot engage targets in weapon range', () => {
    const ship = makeUnit({
      id: 'us_ship',
      nation: 'usa',
      weapons: [loadout('harpoon', 8)],
    })
    const state = makeState([ship, enemyShip()])

    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)
  })

  it('engages on own radar with own quality and emits AUTO_ENGAGEMENT', () => {
    const ship = makeUnit({
      id: 'us_ship',
      nation: 'usa',
      sensors: [radar(200)],
      weapons: [loadout('harpoon', 8)],
    })
    const state = makeState([ship, enemyShip()])

    const cmds = processFriendlyAI(state, new SeededRNG(42))
    expect(cmds.length).toBeGreaterThanOrEqual(1)
    expect(cmds.every(c => c.type === 'LAUNCH_MISSILE' && c.trackQuality === 'own')).toBe(true)

    const engagement = state.events.find(e => e.type === 'AUTO_ENGAGEMENT')
    expect(engagement).toBeDefined()
    if (engagement?.type === 'AUTO_ENGAGEMENT') {
      expect(engagement.targetId).toBe('ir_ship')
      expect(engagement.quality).toBe('own')
    }
  })

  it('engages on a datalink track when the nation holds a live contact', () => {
    const ship = makeUnit({
      id: 'us_ship',
      nation: 'usa',
      datalink_range_km: 150, // hub itself → on the network
      weapons: [loadout('harpoon', 8)],
    })
    const target = enemyShip()
    const state = makeState([ship, target])
    seedContact(state, 'usa', target)

    const cmds = processFriendlyAI(state, new SeededRNG(42))
    expect(cmds.length).toBeGreaterThanOrEqual(1)
    expect(cmds.every(c => c.type === 'LAUNCH_MISSILE' && c.trackQuality === 'datalink')).toBe(true)
  })

  it('weapons_tight only engages inside the self-defense bubble', () => {
    const tightShip = makeUnit({
      id: 'us_tight',
      nation: 'usa',
      roe: 'weapons_tight',
      sensors: [radar(200)],
      weapons: [loadout('harpoon', 8)],
    })
    // ~111km away: in harpoon range, outside the 75km self-defense bubble
    const farTarget = makeUnit({ id: 'ir_far', nation: 'iran', position: { lat: 27, lng: 52 } })
    const state = makeState([tightShip, farTarget])

    expect(processFriendlyAI(state, new SeededRNG(42))).toHaveLength(0)

    // Same geometry under weapons_free fires
    tightShip.roe = 'weapons_free'
    resetFriendlyAIState()
    expect(processFriendlyAI(state, new SeededRNG(42)).length).toBeGreaterThanOrEqual(1)
  })

  it('does not pile a second salvo onto a freshly engaged target', () => {
    const a = makeUnit({
      id: 'us_a', nation: 'usa', sensors: [radar(200)], weapons: [loadout('harpoon', 8)],
    })
    const b = makeUnit({
      id: 'us_b', nation: 'usa', position: { lat: 26.1, lng: 52 }, sensors: [radar(200)], weapons: [loadout('harpoon', 8)],
    })
    const state = makeState([a, b, enemyShip()])

    const cmds = processFriendlyAI(state, new SeededRNG(42))
    const shooters = new Set(cmds.map(c => c.type === 'LAUNCH_MISSILE' ? c.launcherId : ''))
    expect(shooters.size).toBe(1)

    // After the re-engage window the second ship may add its own salvo
    state.time.tick += 200
    const later = processFriendlyAI(state, new SeededRNG(43))
    expect(later.length).toBeGreaterThanOrEqual(1)
  })
})
