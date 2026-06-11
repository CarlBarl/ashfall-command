import type {
  GameEvent,
  GameState,
  IntelProduct,
  IntelState,
  InterceptPrecedence,
  NationId,
  Position,
  Unit,
} from '@/types/game'
import type { ElevationGrid } from './elevation'
import type { SeededRNG } from '../utils/rng'
import { buildIntelAssets, HORMUZ_OSINT_BOX, PASS_SWATH_KM } from '@/data/intel/assets'
import { buildAgentRoster, AGENT_COVERAGE, AGENT_PASSIVE_INTERVAL_MIN } from '@/data/intel/agents'
import { revealContact } from './visibility'
import { getNextSalvoEstimate } from './ai'
import { haversine, destination } from '../utils/geo'

/**
 * Intel suite v3 — ISR tasking, SIGINT intercepts, HUMINT sources, counterintel.
 * Design: docs/plans/intel-suite-v3.md. All state lives in state.intel (plain
 * data → saves/loads for free). Heavy evaluation runs once per game-minute.
 */

const MINUTE = 60
const HOUR = 3600

const INTERCEPT_INTERVAL_TICKS = 20 * MINUTE
const SWEEP_INTERVAL_TICKS = 4 * HOUR
const SWEEP_PARANOIA_THRESHOLD = 50
const ENCRYPTION_PARANOIA_THRESHOLD = 70
const ENCRYPTION_BLACKOUT_TICKS = 6 * HOUR
const AGENT_TASK_COOLDOWN_TICKS = 1 * HOUR
const EXFIL_DURATION_TICKS = 6 * HOUR
const OPSEC_SWEEP_COOLDOWN_TICKS = 6 * HOUR
const CLOUD_FAIL_THRESHOLD = 70
const DECOY_COUNT = 4
const PRODUCT_CAP = 30
const GULF_PATROL_BOX = { south: 23.5, west: 47.5, north: 30.5, east: 59.5 }

export function initIntelState(state: GameState): void {
  state.intel = {
    assets: buildIntelAssets(),
    agents: buildAgentRoster(),
    products: [],
    taskings: [],
    paranoia: 10,
    leakLevel: 25,
    productCounter: 0,
  }
}

/** No module-level state — everything lives in state.intel. Kept for reset symmetry. */
export function resetIntelState(): void {}

// ---------------------------------------------------------------------------
// Tick processing
// ---------------------------------------------------------------------------

export function processIntel(state: GameState, rng: SeededRNG, grid: ElevationGrid | null): void {
  const intel = state.intel
  if (!intel) return
  const tick = state.time.tick

  // SBIRS FLASH cards ride on this tick's launch events (always-on OPIR)
  emitLaunchDetectionCards(state, intel)

  if (tick % MINUTE !== 0) return

  resolveSatelliteTaskings(state, intel, rng)
  generateIntercept(state, intel, rng)
  runAgentClock(state, intel, rng)
  runCounterintel(state, intel, rng)
  runWideAreaSensors(state, intel)
  spawnDecoysAtWar(state, intel, rng, grid)
}

// ---------------------------------------------------------------------------
// Satellite tasking (design §1.2)
// ---------------------------------------------------------------------------

export function taskSatellitePass(
  state: GameState,
  assetId: string,
  target: Position,
  cloudPct?: number,
): void {
  const intel = state.intel
  if (!intel) return
  const asset = intel.assets[assetId]
  if (!asset || asset.status !== 'active' || asset.kind === 'sigint_air') return

  // One queued tasking per asset — re-tasking replaces it
  intel.taskings = intel.taskings.filter(t => t.assetId !== assetId)
  intel.taskings.push({
    id: `task_${(intel.productCounter = (intel.productCounter ?? 0) + 1)}`,
    assetId,
    target: { ...target },
    queuedTick: state.time.tick,
    cloudPct,
  })
}

function resolveSatelliteTaskings(state: GameState, intel: IntelState, rng: SeededRNG): void {
  const tick = state.time.tick
  const done: string[] = []

  for (const tasking of intel.taskings) {
    const asset = intel.assets[tasking.assetId]
    if (!asset || asset.status !== 'active') {
      done.push(tasking.id)
      continue
    }
    const revisitTicks = asset.revisit_min * MINUTE
    if (tick - asset.lastCollectionTick < revisitTicks) continue

    asset.lastCollectionTick = tick
    done.push(tasking.id)

    const cloudPct = tasking.cloudPct ?? rng.int(0, 100)
    if (cloudPct >= CLOUD_FAIL_THRESHOLD) {
      // Failed pass: cheap retry — half the revisit clock
      asset.lastCollectionTick = tick - Math.floor(revisitTicks / 2)
      emit(state, {
        type: 'SATELLITE_PASS_FAILED',
        assetId: asset.id,
        target: tasking.target,
        cloudPct,
        tick,
      })
      continue
    }

    // Sweep the footprint
    let found = 0
    let revealedDecoys = 0
    let rampAirframes = 0
    const byCategory = new Map<string, number>()
    for (const unit of state.units.values()) {
      if (unit.nation === asset.nation || unit.status === 'destroyed') continue
      if (haversine(unit.position, tasking.target) > PASS_SWATH_KM) continue

      const existing = state.visibility?.[asset.nation as string]?.[unit.id]
      const level =
        unit.category === 'airbase' || unit.category === 'naval_base' ||
        existing?.level === 'tracked' || existing?.level === 'identified'
          ? 'identified'
          : 'tracked'
      revealContact(state, asset.nation as string, unit, level)
      found++
      byCategory.set(unit.category, (byCategory.get(unit.category) ?? 0) + 1)

      // BDA reward: ramp counts are the only legal channel for enemy squadron pools
      if (unit.airWing) {
        rampAirframes += unit.airWing.reduce((n, s) => n + s.available + s.readyAt.length, 0)
      }

      if (unit.isDecoy && !unit.decoyRevealed && (asset.niirs ?? 0) >= 7) {
        unit.decoyRevealed = true
        revealedDecoys++
        emit(state, { type: 'DECOY_REVEALED', unitId: unit.id, tick })
      }
    }

    pushProduct(intel, {
      kind: 'imint',
      tick,
      assetId: asset.id,
      target: tasking.target,
      niirs: asset.niirs,
      classification: asset.kind === 'commercial_sat' ? 'UNCLASSIFIED//COMMERCIAL' : 'TOP SECRET//TK//NOFORN',
      caption: imintCaption(byCategory, revealedDecoys, rampAirframes),
    })

    emit(state, {
      type: 'SATELLITE_PASS_COMPLETE',
      assetId: asset.id,
      target: tasking.target,
      found,
      revealedDecoys,
      tick,
    })

    if (asset.nation === 'usa') {
      intel.paranoia = clamp(intel.paranoia + (asset.kind === 'commercial_sat' ? 2 : 4))
    }
  }

  if (done.length > 0) {
    intel.taskings = intel.taskings.filter(t => !done.includes(t.id))
  }
}

function imintCaption(byCategory: Map<string, number>, revealedDecoys: number, rampAirframes: number): string {
  if (byCategory.size === 0) return 'No significant activity observed in AOI.'
  const labels: Record<string, string> = {
    missile_battery: 'probable TEL group',
    sam_site: 'SAM emitter site',
    ship: 'surface combatant',
    carrier_group: 'capital surface group',
    submarine: 'submarine (surfaced)',
    airbase: 'air operations facility',
    naval_base: 'naval facility',
    aircraft: 'aircraft on apron',
    minefield: 'suspected mine line',
  }
  const parts = Array.from(byCategory.entries()).map(([cat, n]) => `${n}× ${labels[cat] ?? cat}`)
  const rampNote = rampAirframes > 0 ? `; ~${rampAirframes} airframes on ramp` : ''
  const decoyNote = revealedDecoys > 0 ? `; ${revealedDecoys}× assessed DECOY (no thermal signature)` : ''
  return parts.join(', ') + rampNote + decoyNote + '.'
}

// ---------------------------------------------------------------------------
// SIGINT (design §1.3)
// ---------------------------------------------------------------------------

const ROUTINE_CHATTER = [
  'Logistics net: fuel convoy scheduling between Shiraz and coastal sites.',
  'IRGCN harbor net: routine patrol rotation, nothing significant.',
  'Air-defense net: calibration chatter, sectors quiet.',
  'Provincial command net: leave rotations and ration complaints.',
]

function generateIntercept(state: GameState, intel: IntelState, rng: SeededRNG): void {
  const tick = state.time.tick
  const rc135 = intel.assets['rc135']
  if (!rc135 || rc135.status !== 'active') return
  if ((intel.encryptionUpgradedUntilTick ?? 0) > tick) return

  const sigintPct = state.nations['usa']?.intelBudget?.sigint_pct ?? 30
  const interval = Math.round(INTERCEPT_INTERVAL_TICKS * (1.5 - sigintPct / 100))
  if (tick - (intel.lastIntInterceptTick ?? -interval) < interval) return
  intel.lastIntInterceptTick = tick

  let precedence: InterceptPrecedence = 'ROUTINE'
  let text = ROUTINE_CHATTER[rng.int(0, ROUTINE_CHATTER.length - 1)]
  let aboutUnitId: string | undefined

  const salvoTick = getNextSalvoEstimate('iran')
  const iranSupport = state.warStatus?.['iran']?.warSupport

  if (salvoTick !== null && salvoTick - tick <= 30 * MINUTE && salvoTick >= tick) {
    precedence = 'FLASH'
    text = 'Missile brigade ordered to combat readiness — expect fires against US installations within the hour.'
  } else {
    const hidden = findHiddenEmitter(state)
    if (hidden) {
      precedence = 'IMMEDIATE'
      aboutUnitId = hidden.id
      revealContact(state, 'usa', hidden, 'detected')
      text = `Geolocated C2 transmission: ${hidden.category === 'sam_site' ? 'air-defense battery' : 'missile unit'} operating vicinity ${hidden.position.lat.toFixed(1)}N ${hidden.position.lng.toFixed(1)}E.`
    } else if (iranSupport !== undefined && iranSupport < 45) {
      precedence = 'PRIORITY'
      text = 'Leadership net: cohesion failing — open argument over continuing the war.'
    }
  }

  emit(state, { type: 'INTERCEPT_DECRYPTED', precedence, text, aboutUnitId, tick })
  pushProduct(intel, {
    kind: 'sigint',
    tick,
    precedence,
    classification: 'TOP SECRET//SI',
    caption: text,
  })
  intel.paranoia = clamp(intel.paranoia + 2)
}

function findHiddenEmitter(state: GameState): Unit | null {
  for (const unit of state.units.values()) {
    if (unit.nation !== 'iran' || unit.status === 'destroyed') continue
    if (unit.category !== 'missile_battery' && unit.category !== 'sam_site') continue
    const contact = state.visibility?.['usa']?.[unit.id]
    if (!contact || contact.level === 'unseen') return unit
  }
  return null
}

/** SBIRS: every Iranian launch this tick gets a FLASH OPIR card (cheap flavor + product) */
function emitLaunchDetectionCards(state: GameState, intel: IntelState): void {
  const tick = state.time.tick
  const sbirs = intel.assets['sbirs']
  if (!sbirs || sbirs.status !== 'active') return
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i]
    if (e.tick !== tick) break
    if (e.type !== 'MISSILE_LAUNCHED') continue
    const launcher = state.units.get(e.launcherId)
    if (!launcher || launcher.nation !== 'iran') continue
    pushProduct(intel, {
      kind: 'sigint',
      tick,
      precedence: 'FLASH',
      classification: 'TOP SECRET//TK',
      caption: `OPIR LAUNCH DETECTION: booster plume ${launcher.position.lat.toFixed(2)}N ${launcher.position.lng.toFixed(2)}E — ${e.weaponName}. Launch point passed to targeting.`,
    })
  }
}

// ---------------------------------------------------------------------------
// HUMINT (design §1.4)
// ---------------------------------------------------------------------------

export function taskAgent(state: GameState, _rng: SeededRNG, agentId: string): void {
  const intel = state.intel
  if (!intel) return
  const agent = intel.agents[agentId]
  if (!agent) return
  if (agent.status === 'arrested' || agent.status === 'exfiltrated' || agent.status === 'exfiltrating') return
  const tick = state.time.tick
  if (tick - agent.lastTaskedTick < AGENT_TASK_COOLDOWN_TICKS) return

  agent.status = 'active'
  agent.lastTaskedTick = tick
  agent.exposure = clamp(agent.exposure + 15 + intel.paranoia / 5)
  intel.paranoia = clamp(intel.paranoia + 1)

  let text = ''
  switch (agent.id) {
    case 'amber': {
      const n = revealBox(state, 'usa', AGENT_COVERAGE['amber'], 'tracked', ['ship', 'submarine'])
      text = n > 0
        ? `Port movement log copied: ${n} hulls active in the Bandar Abbas–Jask complex. Berths and sortie states attached.`
        : 'Port quiet — no significant sorties on the log.'
      break
    }
    case 'opal': {
      let revealed = 0
      let decoys = 0
      for (const unit of state.units.values()) {
        if (revealed >= 2) break
        if (unit.nation !== 'iran' || unit.status === 'destroyed') continue
        if (unit.category !== 'missile_battery') continue
        const contact = state.visibility?.['usa']?.[unit.id]
        if (contact && (contact.level === 'tracked' || contact.level === 'identified')) continue
        if (unit.isDecoy) {
          if (!unit.decoyRevealed) {
            unit.decoyRevealed = true
            decoys++
            emit(state, { type: 'DECOY_REVEALED', unitId: unit.id, tick })
          }
          continue
        }
        revealContact(state, 'usa', unit, 'identified')
        revealed++
      }
      text = revealed > 0
        ? `Dispersal annex photographed: ${revealed} launcher group(s) located with grid coordinates.`
        : 'No new launcher movement in the annex this cycle.'
      if (decoys > 0) text += ` Flags ${decoys} site(s) as inflatable decoys.`
      break
    }
    case 'saffron': {
      const support = state.warStatus?.['iran']?.warSupport
      const offered = state.warStatus?.['iran']?.ceasefireOffered
      text = support !== undefined
        ? `Cabinet read: war support at ${Math.round(support)}%. ${offered ? 'Ceasefire feelers ALREADY authorized.' : support < 45 ? 'Ceasefire faction gaining ground.' : 'Leadership committed to continuing.'}`
        : 'Cabinet read: leadership posture stable, no war council convened.'
      break
    }
    case 'garnet': {
      const n = revealBox(state, 'usa', AGENT_COVERAGE['garnet'], 'tracked', ['ship', 'submarine'])
      text = n > 0
        ? `Strait watch: ${n} contacts logged transiting the narrows, photos timestamped.`
        : 'Strait watch: channel quiet this cycle.'
      break
    }
  }

  emit(state, { type: 'AGENT_REPORT', agentId: agent.id, codename: agent.codename, text, tick })
  pushProduct(intel, {
    kind: 'humint',
    tick,
    agentId: agent.id,
    classification: 'SECRET//HCS',
    caption: `${agent.codename}: ${text}`,
  })
}

export function restAgent(state: GameState, agentId: string): void {
  const agent = state.intel?.agents[agentId]
  if (!agent) return
  if (agent.status === 'active') agent.status = 'resting'
}

export function exfiltrateAgent(state: GameState, agentId: string): void {
  const agent = state.intel?.agents[agentId]
  if (!agent) return
  if (agent.status !== 'active' && agent.status !== 'resting') return
  agent.status = 'exfiltrating'
  agent.exfilCompleteTick = state.time.tick + EXFIL_DURATION_TICKS
}

function runAgentClock(state: GameState, intel: IntelState, _rng: SeededRNG): void {
  const tick = state.time.tick

  for (const agent of Object.values(intel.agents)) {
    // Exfil completion
    if (agent.status === 'exfiltrating' && (agent.exfilCompleteTick ?? 0) <= tick) {
      agent.status = 'exfiltrated'
      emit(state, { type: 'AGENT_EXFILTRATED', agentId: agent.id, codename: agent.codename, tick })
    }
    // Resting exposure decay (1 per game-hour)
    if (agent.status === 'resting' && tick % HOUR === 0) {
      agent.exposure = Math.max(0, agent.exposure - 1)
    }
  }

  // Passive coverage: AMBER + GARNET keep a coarse eye on their boxes
  if (tick % (AGENT_PASSIVE_INTERVAL_MIN * MINUTE) === 0) {
    for (const id of ['amber', 'garnet'] as const) {
      const agent = intel.agents[id]
      if (agent?.status === 'active') {
        revealBox(state, 'usa', AGENT_COVERAGE[id], 'detected', ['ship', 'submarine'])
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Counterintel — Iranian sweeps, encryption, the player's leak level (design §1.5)
// ---------------------------------------------------------------------------

function runCounterintel(state: GameState, intel: IntelState, rng: SeededRNG): void {
  const tick = state.time.tick
  const atWar = (state.nations['iran']?.atWar.length ?? 0) > 0

  // Encryption upgrade at high paranoia (war only)
  if (atWar && intel.paranoia >= ENCRYPTION_PARANOIA_THRESHOLD && (intel.encryptionUpgradedUntilTick ?? 0) <= tick) {
    intel.encryptionUpgradedUntilTick = tick + ENCRYPTION_BLACKOUT_TICKS
    intel.paranoia = 40
    emit(state, { type: 'ENCRYPTION_UPGRADED', untilTick: intel.encryptionUpgradedUntilTick, tick })
  }

  // Spy sweeps
  if (intel.paranoia >= SWEEP_PARANOIA_THRESHOLD && tick - (intel.lastSweepTick ?? -SWEEP_INTERVAL_TICKS) >= SWEEP_INTERVAL_TICKS) {
    intel.lastSweepTick = tick
    let arrests = 0
    for (const agent of Object.values(intel.agents)) {
      if (agent.status !== 'active' && agent.status !== 'resting' && agent.status !== 'exfiltrating') continue
      let chance = agent.exposure / 200 + intel.paranoia / 400
      if (agent.status === 'exfiltrating') chance /= 2
      if (rng.chance(chance)) {
        agent.status = 'arrested'
        arrests++
        intel.leakLevel = clamp(intel.leakLevel + 10)
        adjustWarSupport(state, 'usa', -3)
        adjustWarSupport(state, 'iran', +2)
        emit(state, { type: 'AGENT_ARRESTED', agentId: agent.id, codename: agent.codename, tick })
      }
    }
    emit(state, { type: 'SPY_SWEEP', arrests, tick })
  }

  // Leak level drift
  if (tick % HOUR === 0) {
    const carrier = findPlayerCarrier(state)
    if (carrier && inBox(carrier.position, HORMUZ_OSINT_BOX)) {
      intel.leakLevel = clamp(intel.leakLevel + 1)
    } else if (tick % (2 * HOUR) === 0) {
      intel.leakLevel = Math.max(10, intel.leakLevel - 1)
    }
  }
}

/** Player strike → possible Iranian foreknowledge. Roll once per launch command. */
export function maybeLeakStrike(state: GameState, rng: SeededRNG, targetId: string): boolean {
  const intel = state.intel
  if (!intel || intel.leakLevel < 60) return false
  if (!rng.chance(intel.leakLevel / 200)) return false

  const tick = state.time.tick
  intel.paranoia = clamp(intel.paranoia + 2)
  emit(state, { type: 'STRIKE_LEAKED', targetId, tick })

  // Mobile land targets scoot — the contact the player fired on goes stale
  const target = state.units.get(targetId)
  if (target && target.status !== 'destroyed' &&
      (target.category === 'missile_battery' || target.category === 'sam_site') &&
      target.maxSpeed_kts > 0) {
    const brng = rng.int(0, 359)
    target.position = destination(target.position, brng, 15)
    const contact = state.visibility?.['usa']?.[targetId]
    if (contact) contact.level = 'detected'
  }
  return true
}

export function opsecSweep(state: GameState): void {
  const intel = state.intel
  if (!intel) return
  const tick = state.time.tick
  if (tick - (intel.lastOpsecSweepTick ?? -OPSEC_SWEEP_COOLDOWN_TICKS) < OPSEC_SWEEP_COOLDOWN_TICKS) return
  intel.lastOpsecSweepTick = tick
  intel.leakLevel = Math.max(10, intel.leakLevel - 25)
  emit(state, { type: 'OPSEC_SWEEP_COMPLETE', newLeakLevel: intel.leakLevel, tick })
}

// ---------------------------------------------------------------------------
// Wide-area sensors + Iran's coarse carrier picture (design §1.1, §1.5)
// ---------------------------------------------------------------------------

function runWideAreaSensors(state: GameState, intel: IntelState): void {
  const tick = state.time.tick

  // MQ-4C Triton: coarse maritime sweep of the Gulf box
  const triton = intel.assets['mq4c']
  if (triton?.status === 'active' && tick - triton.lastCollectionTick >= triton.revisit_min * MINUTE) {
    triton.lastCollectionTick = tick
    revealBox(state, 'usa', GULF_PATROL_BOX, 'detected', ['ship', 'submarine', 'carrier_group'])
  }

  // Iran's eyes on the carrier: picket boats (detected) / Mohajer-10 (tracked)
  if (tick - (intel.lastCarrierOsintTick ?? 0) >= 30 * MINUTE) {
    intel.lastCarrierOsintTick = tick
    const carrier = findPlayerCarrier(state)
    if (carrier && inBox(carrier.position, HORMUZ_OSINT_BOX)) {
      const mohajer = intel.assets['mohajer10']
      const level = (mohajer?.status === 'active' || intel.leakLevel >= 60) ? 'tracked' : 'detected'
      revealContact(state, 'iran', carrier, level)
    }
  }
}

// ---------------------------------------------------------------------------
// Decoys (design §1.7)
// ---------------------------------------------------------------------------

function spawnDecoysAtWar(state: GameState, intel: IntelState, rng: SeededRNG, grid: ElevationGrid | null): void {
  if (intel.decoysSpawned) return
  if ((state.nations['iran']?.atWar.length ?? 0) === 0) return
  intel.decoysSpawned = true

  const batteries = Array.from(state.units.values()).filter(
    u => u.nation === 'iran' && u.category === 'missile_battery' && u.status !== 'destroyed' && !u.isDecoy,
  )
  if (batteries.length === 0) return

  for (let i = 0; i < DECOY_COUNT; i++) {
    const anchor = batteries[rng.int(0, batteries.length - 1)]
    let pos: Position | null = null
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = destination(anchor.position, rng.int(0, 359), 5 + rng.int(0, 10))
      if (!grid || !grid.isWater(candidate.lat, candidate.lng)) {
        pos = candidate
        break
      }
    }
    if (!pos) continue

    const decoy: Unit = {
      id: `decoy_${i + 1}`,
      name: 'Missile TEL group',
      nation: 'iran',
      category: 'missile_battery',
      position: pos,
      heading: rng.int(0, 359),
      speed_kts: 0,
      maxSpeed_kts: 30,
      status: 'ready',
      health: 40,
      maxHealth: 40,
      hardness: 80,
      logistics: 0,
      supplyStocks: [],
      weapons: [],
      pointDefense: [],
      sensors: [],
      waypoints: [],
      roe: 'hold_fire',
      subordinateIds: [],
      isDecoy: true,
    }
    state.units.set(decoy.id, decoy)
  }
}

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

export function paranoiaBand(paranoia: number): 'LOW' | 'ELEVATED' | 'HIGH' | 'SEVERE' {
  if (paranoia < 30) return 'LOW'
  if (paranoia < 55) return 'ELEVATED'
  if (paranoia < 75) return 'HIGH'
  return 'SEVERE'
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function revealBox(
  state: GameState,
  observer: NationId,
  box: { south: number; west: number; north: number; east: number },
  level: 'detected' | 'tracked' | 'identified',
  categories: string[],
): number {
  let n = 0
  for (const unit of state.units.values()) {
    if (unit.nation === observer || unit.status === 'destroyed') continue
    if (!categories.includes(unit.category)) continue
    if (!inBox(unit.position, box)) continue
    revealContact(state, observer as string, unit, level)
    n++
  }
  return n
}

function inBox(p: Position, box: { south: number; west: number; north: number; east: number }): boolean {
  return p.lat >= box.south && p.lat <= box.north && p.lng >= box.west && p.lng <= box.east
}

function findPlayerCarrier(state: GameState): Unit | null {
  for (const unit of state.units.values()) {
    if (unit.nation === state.playerNation && unit.category === 'carrier_group' && unit.status !== 'destroyed') {
      return unit
    }
  }
  return null
}

function pushProduct(intel: IntelState, p: Omit<IntelProduct, 'id'>): void {
  intel.productCounter = (intel.productCounter ?? 0) + 1
  intel.products.unshift({ ...p, id: `prod_${intel.productCounter}` })
  if (intel.products.length > PRODUCT_CAP) intel.products.length = PRODUCT_CAP
}

function adjustWarSupport(state: GameState, nation: NationId, delta: number): void {
  if (state.gameOver) return
  const ws = state.warStatus?.[nation]
  if (ws) ws.warSupport = Math.max(0, Math.min(100, ws.warSupport + delta))
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

function emit(state: GameState, event: GameEvent): void {
  state.events.push(event)
  if (state.events.length > 2000) state.events.splice(0, state.events.length - 2000)
  state.pendingEvents.push(event)
}
