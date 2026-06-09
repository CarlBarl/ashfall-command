import * as Comlink from 'comlink'
import type { WorkerAPI } from '@/engine/worker'
import type { Command } from '@/types/commands'
import { useGameStore } from './game-store'
import { useIntelStore } from './intel-store'
import { useStrikeStore } from './strike-store'

let worker: Worker | null = null
let api: Comlink.Remote<WorkerAPI> | null = null
let rafId: number | null = null
let pollCounter = 0
let loopGeneration = 0
// Set after any worker mutation so the next poll installs even if the tick didn't advance
let stateDirty = false

export function initBridge(): void {
  if (worker) return

  worker = new Worker(new URL('@/engine/worker.ts', import.meta.url), { type: 'module' })
  api = Comlink.wrap<WorkerAPI>(worker)

  // Load elevation grid (non-blocking — game can start before it finishes)
  api.loadElevation().catch(console.warn)

  const generation = ++loopGeneration
  const frame = async () => {
    if (generation !== loopGeneration) return
    pollCounter++

    // Poll worker every 3rd frame (~10fps for state) to save overhead
    if (pollCounter % 3 === 0 && api) {
      try {
        const vs = await api.getViewState()
        if (generation !== loopGeneration) return
        const force = stateDirty
        stateDirty = false
        useGameStore.getState().setViewState(vs, force)
      } catch {
        // Worker may not be ready yet
      }
    }

    // Interpolate visual time EVERY frame for smooth missile animation
    useGameStore.getState().updateVisualTime()

    rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)
}

export function destroyBridge(): void {
  // Generation bump stops an in-flight frame() from re-scheduling after its await
  loopGeneration++
  if (rafId !== null) cancelAnimationFrame(rafId)
  worker?.terminate()
  worker = null
  api = null
  rafId = null
}

export async function sendCommand(cmd: Command): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.executeCommand(cmd)
  stateDirty = true
}

export async function getFullState(): Promise<string> {
  if (!api) throw new Error('Bridge not initialized')
  return api.getFullState()
}

function resetClientStores(): void {
  useGameStore.setState({ eventLog: [] })
  useIntelStore.getState().reset()
  useStrikeStore.getState().reset()
}

export async function loadState(json: string): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.loadState(json)
  resetClientStores()
  stateDirty = true
}

export async function initFromData(
  playerNation: import('@/types/game').NationId,
  nations: Record<import('@/types/game').NationId, import('@/types/game').Nation>,
  unitList: import('@/types/game').Unit[],
  supplyLines: import('@/types/game').SupplyLine[],
  baseSupply: Record<string, import('@/types/game').WeaponStock[]>,
  startDate?: string,
): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.initFromData(playerNation, nations, unitList, supplyLines, baseSupply, startDate)
  resetClientStores()
  stateDirty = true
}
