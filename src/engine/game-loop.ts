import type { GameEngine } from './game-engine'

const BASE_INTERVAL_MS = 100
/** Max time (ms) the loop can spend ticking per interval before yielding */
const TIME_BUDGET_MS = 80

export class GameLoop {
  private engine: GameEngine
  private intervalId: ReturnType<typeof setInterval> | null = null
  private accumulator = 0

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

    if (speed < 1) {
      // Fractional speed: accumulate until we have a full tick
      this.accumulator += speed
      while (this.accumulator >= 1) {
        this.engine.tick()
        this.accumulator -= 1
      }
    } else {
      // Burst ticks with a time budget so we never block the thread
      const target = Math.round(speed)
      const start = performance.now()
      for (let i = 0; i < target; i++) {
        this.engine.tick()
        // Check budget every 10 ticks to avoid overhead from perf.now()
        if (i % 10 === 9 && performance.now() - start > TIME_BUDGET_MS) break
      }
    }
  }
}
