import type { GameState, GameEvent, NationId, Unit, UnitId } from '@/types/game'
import type { GameViewState, ViewUnit } from '@/types/view'
import type { Command } from '@/types/commands'
import { usaUnits } from '@/data/units/usa-orbat'
import { iranUnits } from '@/data/units/iran-orbat'
import { SeededRNG } from './utils/rng'
import { processMovement } from './systems/movement'
import { processCombat, launchMissile, launchSAM } from './systems/combat'
import { processAI } from './systems/ai'
import { processEconomy } from './systems/economy'
import { processOrders } from './systems/orders'

const TICK_MS = 1_000 // 1 tick = 1 game second (real-time at 1x)
const SCENARIO_START = new Date('2026-06-15T06:00:00Z').getTime()

export class GameEngine {
  state: GameState
  rng: SeededRNG

  constructor() {
    this.rng = new SeededRNG(42)

    const units = new Map<UnitId, Unit>()
    for (const u of [...usaUnits, ...iranUnits]) {
      units.set(u.id, { ...u })
    }

    this.state = {
      time: {
        tick: 0,
        timestamp: SCENARIO_START,
        speed: 0, // paused
        tickIntervalMs: 100,
      },
      nations: {
        usa: {
          id: 'usa',
          name: 'United States of America',
          economy: {
            gdp_billions: 28000,
            military_budget_billions: 886,
            military_budget_pct_gdp: 3.2,
            oil_revenue_billions: 0,
            sanctions_impact: 0,
            war_cost_per_day_millions: 0,
            reserves_billions: 800,
          },
          relations: { usa: 100, iran: -60 },
          atWar: [],
        },
        iran: {
          id: 'iran',
          name: 'Islamic Republic of Iran',
          economy: {
            gdp_billions: 400,
            military_budget_billions: 25,
            military_budget_pct_gdp: 6.3,
            oil_revenue_billions: 50,
            sanctions_impact: 0.3,
            war_cost_per_day_millions: 0,
            reserves_billions: 120,
          },
          relations: { usa: -60, iran: 100 },
          atWar: [],
        },
      },
      units,
      missiles: new Map(),
      engagements: new Map(),
      events: [],
      pendingEvents: [],
    }
  }

  /** Advance simulation by one tick */
  tick(): void {
    const { state } = this
    state.time.tick++
    state.time.timestamp += TICK_MS

    processMovement(state)

    // ROE enforcement + command queue before combat
    const orderCmds = processOrders(state)
    for (const cmd of orderCmds) {
      this.executeCommand(cmd)
    }

    processCombat(state, this.rng)
    processEconomy(state)

    // AI generates commands, then we execute them
    const aiCommands = processAI(state, this.rng)
    for (const cmd of aiCommands) {
      this.executeCommand(cmd)
    }
  }

  /** Execute a player command */
  executeCommand(cmd: Command): void {
    const { state } = this
    switch (cmd.type) {
      case 'SET_SPEED':
        state.time.speed = cmd.speed
        break
      case 'DECLARE_WAR': {
        const player: NationId = 'usa'
        if (!state.nations[player].atWar.includes(cmd.target)) {
          state.nations[player].atWar.push(cmd.target)
        }
        if (!state.nations[cmd.target].atWar.includes(player)) {
          state.nations[cmd.target].atWar.push(player)
        }
        this.emitEvent({
          type: 'WAR_DECLARED',
          attacker: player,
          defender: cmd.target,
          tick: state.time.tick,
        })
        break
      }
      case 'SET_ROE': {
        const unit = state.units.get(cmd.unitId)
        if (unit) unit.roe = cmd.roe
        break
      }
      case 'MOVE_UNIT': {
        const unit = state.units.get(cmd.unitId)
        if (unit) {
          unit.waypoints = cmd.waypoints
          unit.status = 'moving'
        }
        break
      }
      case 'LAUNCH_MISSILE': {
        const event = launchMissile(state, cmd.launcherId, cmd.weaponId, cmd.targetId)
        if (event) this.emitEvent(event)
        break
      }
      case 'LAUNCH_SAM': {
        launchSAM(state, cmd.launcherId, cmd.weaponId, cmd.missileId, this.rng)
        break
      }
      case 'CEASE_FIRE': {
        const player: NationId = 'usa'
        state.nations[player].atWar = state.nations[player].atWar.filter(n => n !== cmd.target)
        state.nations[cmd.target].atWar = state.nations[cmd.target].atWar.filter(n => n !== player)
        break
      }
    }
  }

  /** Get serializable snapshot for the main thread */
  getViewState(): GameViewState {
    const { state } = this
    const events = [...state.pendingEvents]
    state.pendingEvents = [] // one-shot delivery

    return {
      time: { ...state.time },
      nations: Object.values(state.nations),
      units: Array.from(state.units.values()).map(toViewUnit),
      missiles: Array.from(state.missiles.values()),
      events,
      pendingEventCount: state.events.length,
    }
  }

  private emitEvent(event: GameEvent): void {
    this.state.events.push(event)
    // Cap event history to prevent unbounded memory growth
    if (this.state.events.length > 2000) {
      this.state.events.splice(0, this.state.events.length - 2000)
    }
    this.state.pendingEvents.push(event)
  }
}

function toViewUnit(u: Unit): ViewUnit {
  return {
    id: u.id,
    name: u.name,
    nation: u.nation,
    category: u.category,
    position: { ...u.position },
    heading: u.heading,
    speed_kts: u.speed_kts,
    status: u.status,
    health: u.health,
    weapons: u.weapons.map(w => ({ ...w })),
    roe: u.roe,
    parentId: u.parentId,
    subordinateIds: [...u.subordinateIds],
  }
}
