import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/game-store'
import { useMenuStore } from '@/store/menu-store'
import { audioManager } from './audio-manager'
import { soundForEvent } from './event-sounds'
import type { GameEvent } from '@/types/game'

export function useSoundEffects(): void {
  useEffect(() => {
    audioManager.attachGestureListeners(window)
    return () => audioManager.detachGestureListeners()
  }, [])

  const events = useGameStore((s) => s.viewState.events)
  // Events are one-shot batches from the worker — reference-guarded like
  // AlertFeed so StrictMode/unrelated re-renders don't replay a batch
  const lastBatchRef = useRef<GameEvent[] | null>(null)
  useEffect(() => {
    if (events.length === 0 || lastBatchRef.current === events) return
    lastBatchRef.current = events

    const { viewState } = useGameStore.getState()
    for (const e of events) {
      const name = soundForEvent(e)
      if (name) audioManager.play(name)
      if (e.type === 'UNIT_DESTROYED'
        && viewState.units.find((u) => u.id === e.unitId)?.nation === viewState.playerNation) {
        audioManager.play('klaxon')
      }
    }
  }, [events])

  const screen = useMenuStore((s) => s.screen)
  const initialized = useGameStore((s) => s.viewState.initialized)
  useEffect(() => {
    if (screen === 'playing' && initialized) audioManager.startAmbient()
    else audioManager.stopAmbient()
  }, [screen, initialized])

  useEffect(() => () => audioManager.stopAmbient(), [])
}
