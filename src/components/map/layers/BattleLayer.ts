import { ScatterplotLayer } from '@deck.gl/layers'
import type { BattleIndicator } from '@/types/ground'

/** Battle marker color — orange-red for active combat */
const BATTLE_COLOR: [number, number, number] = [255, 68, 68]

/**
 * Create deck.gl ScatterplotLayer(s) for battle indicators on the map.
 * Each battle renders as a red circle sized proportional to its intensity.
 *
 * @param battles - Active battle indicators from the game view state
 * @returns Array of ScatterplotLayers to add to the deck.gl overlay
 */
export function createBattleLayers(battles: BattleIndicator[]): ScatterplotLayer[] {
  if (battles.length === 0) return []

  return [
    // Outer glow — larger, more transparent ring for ambient effect
    new ScatterplotLayer<BattleIndicator>({
      id: 'battle-glow',
      data: battles,
      pickable: false,
      getPosition: (d) => [d.position.lng, d.position.lat],
      getRadius: (d) => 3000 + d.intensity * 150,
      getFillColor: [...BATTLE_COLOR, 60],
      radiusUnits: 'meters',
      radiusMinPixels: 8,
      radiusMaxPixels: 60,
      updateTriggers: {
        getRadius: battles.map((b) => b.intensity),
      },
    }),

    // Inner core — solid battle marker
    new ScatterplotLayer<BattleIndicator>({
      id: 'battle-core',
      data: battles,
      pickable: true,
      getPosition: (d) => [d.position.lng, d.position.lat],
      getRadius: (d) => 2000 + d.intensity * 100,
      getFillColor: [...BATTLE_COLOR, 153], // ~0.6 opacity
      radiusUnits: 'meters',
      radiusMinPixels: 4,
      radiusMaxPixels: 40,
      updateTriggers: {
        getRadius: battles.map((b) => b.intensity),
      },
    }),
  ]
}
