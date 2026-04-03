import * as Comlink from 'comlink'
import { GameEngine } from './game-engine'
import { GameLoop } from './game-loop'
import type { GameViewState } from '@/types/view'
import type { Command } from '@/types/commands'
import type { NationId, Nation, Unit, SupplyLine, WeaponStock } from '@/types/game'

const engine = new GameEngine()
const loop = new GameLoop(engine)
loop.start()

const api = {
  /** Initialize the default scenario (backward compatible) */
  initDefaultScenario(playerNation: NationId = 'usa'): void {
    engine.initDefaultScenario(playerNation)
  },

  /** Initialize from custom data (scenario/free mode) */
  initFromData(
    playerNation: NationId,
    nations: Record<NationId, Nation>,
    unitList: Unit[],
    supplyLines: SupplyLine[],
    baseSupply: Record<string, WeaponStock[]>,
    startDate?: string,
  ): void {
    engine.initFromData(playerNation, nations, unitList, supplyLines, baseSupply, startDate)
  },

  /** Whether the game state is initialized */
  isInitialized(): boolean {
    return engine.state.initialized
  },

  getViewState(): GameViewState {
    return engine.getViewState()
  },

  executeCommand(cmd: Command): void {
    engine.executeCommand(cmd)
  },

  /** For save/load */
  getFullState(): string {
    const s = engine.state
    return JSON.stringify({
      playerNation: s.playerNation,
      time: s.time,
      nations: s.nations,
      units: Array.from(s.units.entries()),
      missiles: Array.from(s.missiles.entries()),
      engagements: Array.from(s.engagements.entries()),
      supplyLines: Array.from(s.supplyLines.entries()),
      events: s.events,
    })
  },

  loadState(json: string): void {
    engine.loadState(json)
  },
}

export type WorkerAPI = typeof api

Comlink.expose(api)
