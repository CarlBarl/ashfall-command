import { ScatterplotLayer } from '@deck.gl/layers'
import type { GameEvent, Position } from '@/types/game'
import type { ViewUnit } from '@/types/view'

interface ImpactMarker {
  position: Position
  tick: number
  damage: number
}

export function createImpactLayer(
  events: GameEvent[],
  units: ViewUnit[],
  currentTick: number,
) {
  // Show impacts for the last 30 ticks (30 game minutes)
  const impacts: ImpactMarker[] = events
    .filter((e): e is Extract<GameEvent, { type: 'MISSILE_IMPACT' }> =>
      e.type === 'MISSILE_IMPACT' && currentTick - e.tick < 30,
    )
    .map(e => {
      const unit = units.find(u => u.id === e.targetId)
      return unit ? { position: unit.position, tick: e.tick, damage: e.damage } : null
    })
    .filter((x): x is ImpactMarker => x !== null)

  return new ScatterplotLayer<ImpactMarker>({
    id: 'impact-layer',
    data: impacts,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getRadius: (d) => {
      const age = currentTick - d.tick
      return (d.damage * 50) + (age * 100) // expanding circle
    },
    getFillColor: (d) => {
      const age = currentTick - d.tick
      const alpha = Math.max(0, 255 - age * 8)
      return [255, 140, 0, alpha]
    },
    radiusUnits: 'meters',
    radiusScale: 1,
    filled: true,
    stroked: false,
    opacity: 0.6,
    updateTriggers: {
      getRadius: currentTick,
      getFillColor: currentTick,
    },
  })
}
