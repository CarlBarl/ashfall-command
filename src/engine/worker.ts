import * as Comlink from 'comlink'
import { GameEngine } from './game-engine'
import { GameLoop } from './game-loop'
import type { GameViewState } from '@/types/view'
import type { Command } from '@/types/commands'

const engine = new GameEngine()
const loop = new GameLoop(engine)
loop.start()

const api = {
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
      time: s.time,
      nations: s.nations,
      units: Array.from(s.units.entries()),
      missiles: Array.from(s.missiles.entries()),
      engagements: Array.from(s.engagements.entries()),
      events: s.events,
    })
  },

  loadState(json: string): void {
    engine.loadState(json)
  },
}

export type WorkerAPI = typeof api

Comlink.expose(api)
