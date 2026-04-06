import * as Comlink from 'comlink'
import type { WorkerAPI } from '@/engine/worker'
import type { Command } from '@/types/commands'
import { useGameStore } from './game-store'

let worker: Worker | null = null
let api: Comlink.Remote<WorkerAPI> | null = null
let rafId: number | null = null
let pollCounter = 0

export function initBridge(): void {
  if (worker) return

  worker = new Worker(new URL('@/engine/worker.ts', import.meta.url), { type: 'module' })
  api = Comlink.wrap<WorkerAPI>(worker)

  // Load elevation grid (non-blocking — game can start before it finishes)
  api.loadElevation().catch(console.warn)

  const frame = async () => {
    pollCounter++

    // Poll worker every 3rd frame (~10fps for state) to save overhead
    if (pollCounter % 3 === 0 && api) {
      try {
        const vs = await api.getViewState()
        useGameStore.getState().setViewState(vs)
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

export async function getFullState(): Promise<string> {
  if (!api) throw new Error('Bridge not initialized')
  return api.getFullState()
}

export async function loadState(json: string): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.loadState(json)
}

export async function initDefaultScenario(playerNation: import('@/types/game').NationId = 'usa'): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.initDefaultScenario(playerNation)
}

export async function initFromData(
  playerNation: import('@/types/game').NationId,
  nations: Record<import('@/types/game').NationId, import('@/types/game').Nation>,
  unitList: import('@/types/game').Unit[],
  supplyLines: import('@/types/game').SupplyLine[],
  baseSupply: Record<string, import('@/types/game').WeaponStock[]>,
  startDate?: string,
  ground?: {
    groundUnits?: import('@/types/ground').GroundUnit[]
    generals?: import('@/types/ground').General[]
    armyGroups?: import('@/types/ground').ArmyGroup[]
    controlGrid?: import('@/types/ground').ControlGrid
    initialResearch?: Record<string, import('@/types/ground').ResearchState>
    tickScale?: number
  },
): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.initFromData(playerNation, nations, unitList, supplyLines, baseSupply, startDate, ground)
}

export async function isGameInitialized(): Promise<boolean> {
  if (!api) return false
  return api.isInitialized()
}

export async function loadElevation(): Promise<void> {
  if (!api) throw new Error('Bridge not initialized')
  await api.loadElevation()
}
