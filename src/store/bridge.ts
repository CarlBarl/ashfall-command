import * as Comlink from 'comlink'
import type { WorkerAPI } from '@/engine/worker'
import type { Command } from '@/types/commands'
import { useGameStore } from './game-store'

let worker: Worker | null = null
let api: Comlink.Remote<WorkerAPI> | null = null
let rafId: number | null = null

export function initBridge(): void {
  if (worker) return

  worker = new Worker(new URL('@/engine/worker.ts', import.meta.url), { type: 'module' })
  api = Comlink.wrap<WorkerAPI>(worker)

  // Start polling at ~30fps
  const poll = async () => {
    if (!api) return
    try {
      const vs = await api.getViewState()
      useGameStore.getState().setViewState(vs)
    } catch {
      // Worker may not be ready yet
    }
    rafId = requestAnimationFrame(poll)
  }
  rafId = requestAnimationFrame(poll)
}

export function destroyBridge(): void {
  if (rafId !== null) cancelAnimationFrame(rafId)
  worker?.terminate()
  worker = null
  api = null
  rafId = null
}

export async function sendCommand(cmd: Command): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.executeCommand(cmd)
}
