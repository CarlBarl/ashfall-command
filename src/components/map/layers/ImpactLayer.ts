import { ScatterplotLayer } from '@deck.gl/layers'
import type { GameEvent, Position } from '@/types/game'
import type { ViewUnit } from '@/types/view'

interface ImpactMarker {
  position: Position
  tick: number
  damage: number
}

interface InterceptMarker {
  position: Position
  tick: number
}

export function createImpactLayers(
  events: GameEvent[],
  units: ViewUnit[],
  currentTick: number,
): ScatterplotLayer[] {
  // Show impacts for the last 30 ticks
  const impacts: ImpactMarker[] = events
    .filter((e): e is Extract<GameEvent, { type: 'MISSILE_IMPACT' }> =>
      e.type === 'MISSILE_IMPACT' && currentTick - e.tick < 30,
    )
    .map(e => {
      const unit = units.find(u => u.id === e.targetId)
      return unit ? { position: unit.position, tick: e.tick, damage: e.damage } : null
    })
    .filter((x): x is ImpactMarker => x !== null)

  // Show intercepts for the last 30 ticks
  const intercepts: InterceptMarker[] = events
    .filter((e): e is Extract<GameEvent, { type: 'MISSILE_INTERCEPTED' }> =>
      e.type === 'MISSILE_INTERCEPTED' && currentTick - e.tick < 30,
    )
    .map(e => ({ position: e.position, tick: e.tick }))

  const impactLayer = new ScatterplotLayer<ImpactMarker>({
    id: 'impact-layer',
    data: impacts,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getRadius: (d) => {
      const age = currentTick - d.tick
      return (d.damage * 50) + (age * 100) // expanding circle
    },
    getFillColor: (d) => {
      const age = currentTick - d.tick
      const alpha = Math.max(0, 255 * 0.35 - age * 3)
      return [255, 140, 0, alpha] // red-orange, faint
    },
    radiusUnits: 'meters',
    radiusScale: 1,
    filled: true,
    stroked: false,
    opacity: 0.4,
    updateTriggers: {
      getRadius: currentTick,
      getFillColor: currentTick,
    },
  })

  const interceptLayer = new ScatterplotLayer<InterceptMarker>({
    id: 'intercept-layer',
    data: intercepts,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getRadius: (d) => {
      const age = currentTick - d.tick
      return 500 + (age * 120) // expanding circle
    },
    getFillColor: (d) => {
      const age = currentTick - d.tick
      const alpha = Math.max(0, 255 * 0.3 - age * 3)
      return [255, 220, 50, alpha] // yellow, faint
    },
    radiusUnits: 'meters',
    radiusScale: 1,
    filled: true,
    stroked: false,
    opacity: 0.35,
    updateTriggers: {
      getRadius: currentTick,
      getFillColor: currentTick,
    },
  })

  return [impactLayer, interceptLayer]
}
