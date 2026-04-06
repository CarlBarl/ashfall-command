import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { ViewGroundUnit } from '@/types/view'

/** NATO symbol colors by division type */
const TYPE_COLORS: Record<string, [number, number, number]> = {
  infantry: [140, 180, 140],
  armor: [180, 160, 100],
  mechanized: [160, 170, 120],
  artillery: [180, 120, 120],
  airborne: [120, 160, 200],
  mountain: [140, 160, 140],
}

const NATION_COLORS: Record<string, [number, number, number]> = {
  germany: [106, 133, 168],
  poland: [168, 128, 96],
}

/**
 * Create deck.gl layers for ground unit division markers on the map.
 * Each division renders as a colored dot with a short name label.
 */
export function createGroundUnitLayers(
  groundUnits: ViewGroundUnit[],
  zoom: number,
): (ScatterplotLayer | TextLayer)[] {
  if (groundUnits.length === 0) return []

  const alive = groundUnits.filter(u => u.status !== 'destroyed')
  if (alive.length === 0) return []

  // Scale marker size by zoom
  const markerSize = Math.max(4, Math.min(12, (zoom - 4) * 3))

  return [
    // Outer glow — nation color
    new ScatterplotLayer<ViewGroundUnit>({
      id: 'ground-unit-glow',
      data: alive,
      pickable: false,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: markerSize + 3,
      getFillColor: (d) => [...(NATION_COLORS[d.nation] ?? [100, 150, 100]), 50],
      radiusUnits: 'pixels',
    }),

    // Core dot — type color, opacity by strength
    new ScatterplotLayer<ViewGroundUnit>({
      id: 'ground-unit-core',
      data: alive,
      pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: markerSize,
      getFillColor: (d) => {
        const c = TYPE_COLORS[d.type] ?? [140, 160, 140]
        const alpha = Math.max(80, Math.round(d.strength * 2.55))
        return [c[0], c[1], c[2], alpha]
      },
      getLineColor: (d) => {
        const c = NATION_COLORS[d.nation] ?? [100, 150, 100]
        return [...c, 200]
      },
      getLineWidth: 1,
      stroked: true,
      lineWidthUnits: 'pixels',
      radiusUnits: 'pixels',
      updateTriggers: {
        getFillColor: alive.map(u => `${u.id}-${u.strength}`),
      },
    }),

    // Name labels — only at higher zoom levels
    ...(zoom >= 6 ? [
      new TextLayer<ViewGroundUnit>({
        id: 'ground-unit-labels',
        data: alive,
        getPosition: (d) => [d.lng, d.lat],
        getText: (d) => d.name.replace(/\s*(Division|Brigade|Regiment)\s*/gi, '').substring(0, 12),
        getSize: 10,
        getColor: [200, 200, 190, 200],
        getPixelOffset: [0, markerSize + 8],
        fontFamily: 'monospace',
        fontWeight: 600,
        outlineWidth: 2,
        outlineColor: [10, 14, 20, 200],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'top',
        billboard: false,
      }),
    ] : []),

    // Stance indicator at higher zoom
    ...(zoom >= 7 ? [
      new TextLayer<ViewGroundUnit>({
        id: 'ground-unit-stance',
        data: alive,
        getPosition: (d) => [d.lng, d.lat],
        getText: (d) => d.stance === 'attack' ? 'ATK' : d.stance === 'defend' ? 'DEF' : d.stance === 'fortify' ? 'FRT' : d.stance === 'retreat' ? 'RET' : 'RSV',
        getSize: 8,
        getColor: (d) => {
          if (d.stance === 'attack') return [255, 160, 80, 180]
          if (d.stance === 'defend') return [80, 180, 255, 180]
          if (d.stance === 'retreat') return [255, 80, 80, 180]
          return [140, 140, 140, 140]
        },
        getPixelOffset: [0, -(markerSize + 6)],
        fontFamily: 'monospace',
        fontWeight: 700,
        outlineWidth: 2,
        outlineColor: [10, 14, 20, 200],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        billboard: false,
        updateTriggers: {
          getText: alive.map(u => u.stance),
          getColor: alive.map(u => u.stance),
        },
      }),
    ] : []),
  ]
}
