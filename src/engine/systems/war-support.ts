import type { GameEvent, GameState, NationId, UnitCategory, WarStats } from '@/types/game'
import type { ObjectiveStatus } from '@/types/view'
import { weaponSpecs } from '@/data/weapons/missiles'

/**
 * War support (political will) and war termination: drains from losses, duration and
 * economic pain; capitulation at 0; ceasefire offers/acceptance; scenario objectives;
 * the GameOverReport for the debrief screen. Design: docs/plans/game-loop-v2.md §2.
 */

// ─── Tuning (design §2) ─────────────────────────────────────────
export const WAR_SUPPORT_CRITICAL_THRESHOLD = 35

const EVAL_INTERVAL_TICKS = 60
const TICKS_PER_HOUR = 3_600
const HORMUZ_LANE_ID = 'hormuz'

const UNIT_LOSS_DRAIN: Record<UnitCategory, number> = {
  carrier_group: 12,
  naval_base: 6,
  airbase: 6,
  ship: 4,
  submarine: 4,
  sam_site: 2,
  missile_battery: 1.5,
  aircraft: 1,
  minefield: 0.5,
}
const WAR_DURATION_DRAIN_PER_HOUR = 0.15
const LOW_RESERVES_FRACTION = 0.25
const LOW_RESERVES_DRAIN_PER_HOUR = 0.3
const OIL_PRICE_DRAIN_THRESHOLD = 110
const OIL_PRICE_DRAIN_PER_HOUR = 0.2
const HORMUZ_BLOCKED_DRAIN_PER_HOUR = 0.2
const KILL_GAIN = 0.5
const KILL_GAIN_CAP = 10
const CEASEFIRE_ACCEPT_MARGIN = 10
const CEASEFIRE_LOW_STOCK_FRACTION = 0.25
const CEASEFIRE_REOFFER_COOLDOWN_TICKS = 6 * TICKS_PER_HOUR
const OBJECTIVE_GOOD_THRESHOLD = 0.66
const OBJECTIVE_CONTESTED_THRESHOLD = 0.33

// ─── Module-level state — must be resettable for save/load ──────

interface WarBaselines {
  reservesAtStart: Record<string, number>
  offensiveStockAtStart: Record<string, number>
  iranBatteries: number
  usaNavalUnits: number
}

let seeded = false
let lastSeenEvent: GameEvent | null = null
let stats: WarStats = emptyStats()
let baselines: WarBaselines | null = null
let killGains: Record<string, number> = {}
let criticalEmitted: Record<string, boolean> = {}
let lastRejectionTick: Record<string, number> = {}
let cachedObjectives: ObjectiveStatus[] = []
let cachedObjectivesBucket = -1
let frozenObjectives: ObjectiveStatus[] | null = null

function emptyStats(): WarStats {
  return {
    durationTicks: 0,
    unitsLost: {},
    missilesFired: {},
    missilesIntercepted: {},
    oilPeak: 0,
    hormuzReducedTicks: 0,
    hormuzBlockedTicks: 0,
  }
}

export function resetWarSupportState(): void {
  seeded = false
  lastSeenEvent = null
  stats = emptyStats()
  baselines = null
  killGains = {}
  criticalEmitted = {}
  lastRejectionTick = {}
  cachedObjectives = []
  cachedObjectivesBucket = -1
  frozenObjectives = null
}

// ─── Event watermark over state.events ──────────────────────────

// A loaded save's warStatus already accounts for its event history; a fresh game
// (no warStatus yet) must count everything emitted since init.
function seedWatermark(state: GameState): void {
  seeded = true
  if (state.warStatus !== undefined && state.events.length > 0) {
    lastSeenEvent = state.events[state.events.length - 1]
  }
}

// The 2000-event cap only ever splices a prefix, so if the watermark object is gone
// everything older is gone with it and the whole remaining array is unseen.
function takeNewEvents(state: GameState): GameEvent[] {
  const events = state.events
  let start = 0
  if (lastSeenEvent) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i] === lastSeenEvent) {
        start = i + 1
        break
      }
    }
  }
  const fresh = events.slice(start)
  if (events.length > 0) lastSeenEvent = events[events.length - 1]
  return fresh
}

function emit(state: GameState, event: GameEvent): void {
  state.events.push(event)
  if (state.events.length > 2000) {
    state.events.splice(0, state.events.length - 2000)
  }
  state.pendingEvents.push(event)
}

// ─── Helpers ────────────────────────────────────────────────────

function clampSupport(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function isNavalCategory(category: UnitCategory): boolean {
  return category === 'ship' || category === 'submarine' || category === 'carrier_group'
}

function countOffensiveMissiles(state: GameState, nationId: string): number {
  let total = 0
  for (const unit of state.units.values()) {
    if (unit.nation !== nationId || unit.status === 'destroyed') continue
    for (const w of unit.weapons) {
      const spec = weaponSpecs[w.weaponId]
      if (spec && spec.type !== 'sam') total += w.count
    }
  }
  return total
}

function ensureBaselines(state: GameState): void {
  if (baselines) return
  const reservesAtStart: Record<string, number> = {}
  const offensiveStockAtStart: Record<string, number> = {}
  for (const nation of Object.values(state.nations)) {
    reservesAtStart[nation.id] = nation.economy.reserves_billions
    offensiveStockAtStart[nation.id] = countOffensiveMissiles(state, nation.id)
  }
  let iranBatteries = 0
  let usaNavalUnits = 0
  for (const unit of state.units.values()) {
    if (unit.status === 'destroyed') continue
    if (unit.nation === 'iran' && unit.category === 'missile_battery') iranBatteries++
    if (unit.nation === 'usa' && isNavalCategory(unit.category)) usaNavalUnits++
  }
  baselines = { reservesAtStart, offensiveStockAtStart, iranBatteries, usaNavalUnits }
}

function detectWarStarts(state: GameState): void {
  for (const nation of Object.values(state.nations)) {
    if (nation.atWar.length === 0) continue
    const ws = (state.warStatus ??= {})
    const status = (ws[nation.id] ??= { warSupport: 100 })
    if (status.warStartTick == null) {
      status.warStartTick = state.time.tick
      ensureBaselines(state)
    }
  }
}

// ─── Per-minute evaluation ──────────────────────────────────────

export function processWarSupport(state: GameState): void {
  if (!seeded) seedWatermark(state)
  detectWarStarts(state)
  if (state.time.tick % EVAL_INTERVAL_TICKS !== 0) return
  evaluate(state)
}

function evaluate(state: GameState): void {
  const tick = state.time.tick
  const newEvents = takeNewEvents(state)
  const ws = (state.warStatus ??= {})

  for (const e of newEvents) {
    switch (e.type) {
      case 'MISSILE_LAUNCHED': {
        const nation = state.units.get(e.launcherId)?.nation
        if (nation) stats.missilesFired[nation] = (stats.missilesFired[nation] ?? 0) + 1
        break
      }
      case 'MISSILE_INTERCEPTED': {
        const nation = state.units.get(e.interceptorId)?.nation
        if (nation) stats.missilesIntercepted[nation] = (stats.missilesIntercepted[nation] ?? 0) + 1
        break
      }
      case 'POINT_DEFENSE_KILL': {
        const nation = state.units.get(e.unitId)?.nation
        if (nation) stats.missilesIntercepted[nation] = (stats.missilesIntercepted[nation] ?? 0) + 1
        break
      }
      case 'UNIT_DESTROYED': {
        const unit = state.units.get(e.unitId)
        if (!unit) break
        stats.unitsLost[unit.nation] = (stats.unitsLost[unit.nation] ?? 0) + 1
        const victim = state.nations[unit.nation]
        if (!victim || victim.atWar.length === 0) break
        const status = (ws[unit.nation] ??= { warSupport: 100 })
        status.warSupport = clampSupport(status.warSupport - UNIT_LOSS_DRAIN[unit.category])
        for (const enemyId of victim.atWar) {
          const gained = killGains[enemyId] ?? 0
          const gain = Math.min(KILL_GAIN, KILL_GAIN_CAP - gained)
          if (gain <= 0) continue
          killGains[enemyId] = gained + gain
          const enemyStatus = (ws[enemyId] ??= { warSupport: 100 })
          enemyStatus.warSupport = clampSupport(enemyStatus.warSupport + gain)
        }
        break
      }
    }
  }

  const lane = state.shippingLanes.get(HORMUZ_LANE_ID)
  let anyWar = false
  for (const nation of Object.values(state.nations)) {
    if (nation.atWar.length === 0) continue
    anyWar = true
    const status = (ws[nation.id] ??= { warSupport: 100 })
    let drainPerHour = WAR_DURATION_DRAIN_PER_HOUR
    const startReserves = baselines?.reservesAtStart[nation.id]
    if (startReserves != null && startReserves > 0 &&
        nation.economy.reserves_billions < startReserves * LOW_RESERVES_FRACTION) {
      drainPerHour += LOW_RESERVES_DRAIN_PER_HOUR
    }
    if (nation.id === 'usa' && (nation.economy.oilPrice_per_barrel ?? 0) > OIL_PRICE_DRAIN_THRESHOLD) {
      drainPerHour += OIL_PRICE_DRAIN_PER_HOUR
    }
    if (nation.id === 'iran' && lane?.status === 'blocked') {
      drainPerHour += HORMUZ_BLOCKED_DRAIN_PER_HOUR
    }
    status.warSupport = clampSupport(status.warSupport - drainPerHour * (EVAL_INTERVAL_TICKS / TICKS_PER_HOUR))
  }

  if (anyWar) {
    const oil = Object.values(state.nations)[0]?.economy.oilPrice_per_barrel
    if (oil != null) stats.oilPeak = Math.max(stats.oilPeak, oil)
    if (lane?.status === 'blocked') stats.hormuzBlockedTicks += EVAL_INTERVAL_TICKS
    else if (lane?.status === 'reduced') stats.hormuzReducedTicks += EVAL_INTERVAL_TICKS
  }

  for (const nation of Object.values(state.nations)) {
    if (nation.atWar.length === 0) continue
    const status = ws[nation.id]
    if (!status) continue
    if (status.warSupport <= WAR_SUPPORT_CRITICAL_THRESHOLD) {
      if (!criticalEmitted[nation.id]) {
        criticalEmitted[nation.id] = true
        emit(state, { type: 'WAR_SUPPORT_CRITICAL', nation: nation.id, support: status.warSupport, tick })
      }
    } else {
      criticalEmitted[nation.id] = false
    }
    if (status.warSupport <= 0) {
      endWar(state, 'capitulation', nation.id, [nation.id, ...nation.atWar])
      break
    }
  }
}

// ─── War termination ────────────────────────────────────────────

function endWar(
  state: GameState,
  outcome: 'capitulation' | 'ceasefire',
  loser: NationId | undefined,
  participants: NationId[],
): void {
  const tick = state.time.tick
  const involved = [...new Set(participants)]

  if (!state.gameOver) frozenObjectives = computeObjectives(state)

  let warStart = Infinity
  for (const id of involved) {
    const start = state.warStatus?.[id]?.warStartTick
    if (start != null && start < warStart) warStart = start
  }
  const durationTicks = Number.isFinite(warStart) ? tick - warStart : 0

  for (const id of involved) {
    const nation = state.nations[id]
    if (nation) nation.atWar = nation.atWar.filter(other => !involved.includes(other))
    const status = state.warStatus?.[id]
    if (status) {
      status.ceasefireOffered = false
      status.warStartTick = undefined
    }
    delete killGains[id]
    delete criticalEmitted[id]
  }

  for (const unit of state.units.values()) {
    if (involved.includes(unit.nation)) unit.roe = 'hold_fire'
  }

  emit(state, { type: 'WAR_ENDED', outcome, loser, tick })

  if (!state.gameOver) {
    state.gameOver = {
      outcome: outcome === 'ceasefire' ? 'ceasefire' : loser === state.playerNation ? 'defeat' : 'victory',
      loser,
      endTick: tick,
      stats: freezeStats(durationTicks, involved),
    }
  }

  baselines = null
}

function freezeStats(durationTicks: number, involved: NationId[]): WarStats {
  const fill = (record: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const id of involved) out[id] = record[id] ?? 0
    for (const [key, value] of Object.entries(record)) out[key] = value
    return out
  }
  return {
    durationTicks,
    unitsLost: fill(stats.unitsLost),
    missilesFired: fill(stats.missilesFired),
    missilesIntercepted: fill(stats.missilesIntercepted),
    oilPeak: stats.oilPeak,
    hormuzReducedTicks: stats.hormuzReducedTicks,
    hormuzBlockedTicks: stats.hormuzBlockedTicks,
  }
}

/** Player (or AI) puts a ceasefire offer on the table; the other side decides */
export function offerCeasefire(state: GameState, by: NationId, target: NationId): void {
  const offerer = state.nations[by]
  const decider = state.nations[target]
  if (!offerer || !decider) return
  if (!offerer.atWar.includes(target)) return

  const tick = state.time.tick
  const lastRejection = lastRejectionTick[by]
  if (lastRejection != null && tick - lastRejection < CEASEFIRE_REOFFER_COOLDOWN_TICKS) return

  ensureBaselines(state)
  const support = getWarSupport(state)
  const stockNow = countOffensiveMissiles(state, target)
  const stockAtStart = baselines?.offensiveStockAtStart[target] ?? stockNow
  const lowStock = stockNow < stockAtStart * CEASEFIRE_LOW_STOCK_FRACTION
  const accepts = support[target] < support[by] + CEASEFIRE_ACCEPT_MARGIN || lowStock

  if (accepts) {
    endWar(state, 'ceasefire', undefined, [by, target])
  } else {
    lastRejectionTick[by] = tick
    emit(state, { type: 'CEASEFIRE_REJECTED', by: target, tick })
  }
}

/** Accept a standing offer (or mutually stand down) — ends the war between the two nations */
export function acceptCeasefire(state: GameState, by: NationId, target: NationId): void {
  const a = state.nations[by]
  const b = state.nations[target]
  if (!a || !b) return
  if (a.atWar.includes(target) || b.atWar.includes(by)) {
    endWar(state, 'ceasefire', undefined, [by, target])
    return
  }
  a.atWar = a.atWar.filter(n => n !== target)
  b.atWar = b.atWar.filter(n => n !== by)
}

/** Player gives up — immediate defeat */
export function resign(state: GameState): void {
  const player = state.playerNation
  const nation = state.nations[player]
  if (!nation) return
  endWar(state, 'capitulation', player, [player, ...nation.atWar])
}

/** Current war support per nation id (defaults to 100 before any war) */
export function getWarSupport(state: GameState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.keys(state.nations)) {
    out[id] = state.warStatus?.[id]?.warSupport ?? 100
  }
  return out
}

// ─── Objectives ─────────────────────────────────────────────────

/** Scenario objectives for the player's side (empty at peace; frozen once the war is decided) */
export function getObjectives(state: GameState): ObjectiveStatus[] {
  if (state.gameOver) return frozenObjectives ?? []
  const bucket = Math.floor(state.time.tick / EVAL_INTERVAL_TICKS)
  if (bucket !== cachedObjectivesBucket) {
    cachedObjectivesBucket = bucket
    cachedObjectives = computeObjectives(state)
  }
  return cachedObjectives
}

function computeObjectives(state: GameState): ObjectiveStatus[] {
  const player = state.playerNation
  if (player !== 'usa' && player !== 'iran') return []
  const nation = state.nations[player]
  const warStartTick = state.warStatus?.[player]?.warStartTick
  if (!nation || nation.atWar.length === 0 || warStartTick == null) return []
  ensureBaselines(state)

  const warTicks = Math.max(1, state.time.tick - warStartTick)
  let aliveIranBatteries = 0
  let aliveUsaNaval = 0
  let usaCarrierLost = false
  for (const unit of state.units.values()) {
    const destroyed = unit.status === 'destroyed'
    if (unit.nation === 'iran' && unit.category === 'missile_battery' && !destroyed) aliveIranBatteries++
    if (unit.nation === 'usa' && isNavalCategory(unit.category) && !destroyed) aliveUsaNaval++
    if (unit.nation === 'usa' && unit.category === 'carrier_group' && destroyed) usaCarrierLost = true
  }
  const initialIranBatteries = baselines?.iranBatteries ?? aliveIranBatteries
  const initialUsaNaval = baselines?.usaNavalUnits ?? aliveUsaNaval

  if (player === 'usa') {
    const openShare = clamp01(1 - stats.hormuzBlockedTicks / warTicks)
    const batteriesKilled = Math.max(0, initialIranBatteries - aliveIranBatteries)
    const batteryProgress = initialIranBatteries > 0 ? clamp01(batteriesKilled / initialIranBatteries) : 1
    return [
      objective('hormuz_open', 'Keep Hormuz open', openShare,
        `Open ${Math.round(openShare * 100)}% of the war`),
      objective('destroy_missile_force', "Destroy Iran's strategic missile force", batteryProgress,
        `${batteriesKilled}/${initialIranBatteries} batteries destroyed`),
      objective('preserve_carrier', 'Preserve the carrier group', usaCarrierLost ? 0 : 1,
        usaCarrierLost ? 'Carrier group lost' : 'Carrier group intact'),
    ]
  }

  const closedShare = clamp01((stats.hormuzBlockedTicks + stats.hormuzReducedTicks) / warTicks)
  const navalKilled = Math.max(0, initialUsaNaval - aliveUsaNaval)
  const attritionProgress = initialUsaNaval > 0 ? clamp01(navalKilled / initialUsaNaval) : 1
  const preserveProgress = initialIranBatteries > 0 ? clamp01(aliveIranBatteries / initialIranBatteries) : 1
  return [
    objective('close_strait', 'Close the Strait', closedShare,
      `Disrupted ${Math.round(closedShare * 100)}% of the war`),
    objective('attrit_us_fleet', 'Attrit the US fleet', attritionProgress,
      `${navalKilled}/${initialUsaNaval} US naval units destroyed`),
    objective('preserve_strategic', 'Preserve strategic forces', preserveProgress,
      `${aliveIranBatteries}/${initialIranBatteries} batteries surviving`),
  ]
}

function objective(id: string, label: string, progress: number, detail: string): ObjectiveStatus {
  return {
    id,
    label,
    progress,
    status: progress >= OBJECTIVE_GOOD_THRESHOLD ? 'good'
      : progress >= OBJECTIVE_CONTESTED_THRESHOLD ? 'contested'
      : 'bad',
    detail,
  }
}
