import * as Comlink from 'comlink'
import { GameEngine } from './game-engine'
import { GameLoop } from './game-loop'
import { ElevationGrid } from './systems/elevation'
import type { GameViewState } from '@/types/view'
import type { Command } from '@/types/commands'
import type { NationId, Nation, Unit, SupplyLine, WeaponStock } from '@/types/game'

const engine = new GameEngine()
const loop = new GameLoop(engine)
loop.start()

const api = {
  /** Initialize from custom data (scenario/free mode) */
  initFromData(
    playerNation: NationId,
    nations: Record<string, Nation>,
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
    return engine.getFullStateJson()
  },

  loadState(json: string): void {
    engine.loadState(json)
  },

  async loadElevation(): Promise<void> {
    const resp = await fetch('/data/theater-elevation.bin')
    const buf = await resp.arrayBuffer()
    engine.setElevationGrid(new ElevationGrid(buf))
  },
}

export type WorkerAPI = typeof api

Comlink.expose(api)
