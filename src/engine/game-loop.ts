import type { GameEngine } from './game-engine'

const BASE_INTERVAL_MS = 100

export class GameLoop {
  private engine: GameEngine
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(engine: GameEngine) {
    this.engine = engine
  }

  start(): void {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.step(), BASE_INTERVAL_MS)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private step(): void {
    const speed = this.engine.state.time.speed
    if (speed === 0) return // paused

    // Burst N ticks per interval — keeps CPU budget safe
    for (let i = 0; i < speed; i++) {
      this.engine.tick()
    }
  }
}
