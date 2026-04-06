import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { ViewGroundUnit } from '@/types/view'

const NATION_COLORS: Record<string, [number, number, number]> = {
  germany: [120, 120, 120],
  poland: [204, 102, 51],
  usa: [68, 136, 204],
  iran: [204, 68, 68],
}

const TYPE_SYMBOLS: Record<string, string> = {
  infantry: 'X',
  panzer: '\u25C6',       // diamond
  motorized: 'M',
  cavalry: 'C',
  mountain: '\u25B2',     // triangle
  fortress: 'F',
}

export function createGroundUnitLayers(
  groundUnits: ViewGroundUnit[],
): object[] {
  if (!groundUnits.length) return []

  // Unit dot
  const dotLayer = new ScatterplotLayer({
    id: 'ground-unit-dots',
    data: groundUnits,
    getPosition: (d: ViewGroundUnit) => [d.position.lng, d.position.lat],
    getRadius: (d: ViewGroundUnit) => 3000 + (d.strength / 100) * 4000,
    getFillColor: (d: ViewGroundUnit) => {
      const base = NATION_COLORS[d.nation] ?? [136, 136, 136]
      const alpha = Math.max(80, Math.round((d.strength / 100) * 255))
      return [...base, alpha] as [number, number, number, number]
    },
    getLineColor: (d: ViewGroundUnit) => {
      const base = NATION_COLORS[d.nation] ?? [136, 136, 136]
      return [...base, 255] as [number, number, number, number]
    },
    stroked: true,
    lineWidthMinPixels: 1.5,
    radiusMinPixels: 5,
    radiusMaxPixels: 14,
    pickable: true,
    updateTriggers: {
      getRadius: groundUnits.map(u => u.strength),
      getFillColor: groundUnits.map(u => `${u.nation}-${u.strength}`),
    },
  })

  // Type symbol
  const symbolLayer = new TextLayer({
    id: 'ground-unit-symbols',
    data: groundUnits,
    getPosition: (d: ViewGroundUnit) => [d.position.lng, d.position.lat],
    getText: (d: ViewGroundUnit) => TYPE_SYMBOLS[d.type] ?? '?',
    getSize: 12,
    getColor: [255, 255, 255, 220],
    fontFamily: 'monospace',
    fontWeight: '700',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    billboard: true,
  })

  // Name label (offset below)
  const nameLayer = new TextLayer({
    id: 'ground-unit-names',
    data: groundUnits,
    getPosition: (d: ViewGroundUnit) => [d.position.lng, d.position.lat],
    getText: (d: ViewGroundUnit) => d.name.length > 12 ? d.name.slice(0, 11) + '\u2026' : d.name,
    getSize: 10,
    getColor: (d: ViewGroundUnit) => {
      const base = NATION_COLORS[d.nation] ?? [136, 136, 136]
      return [...base, 200] as [number, number, number, number]
    },
    fontFamily: 'monospace',
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'top',
    getPixelOffset: [0, 12],
    billboard: true,
  })

  return [dotLayer, symbolLayer, nameLayer]
}
