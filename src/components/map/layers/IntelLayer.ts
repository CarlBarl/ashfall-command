import { IconLayer, TextLayer } from '@deck.gl/layers'
import type { EstimatedUnit } from '@/store/intel-store'

const ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {
  airbase:         { x: 0,   y: 0,   width: 64, height: 64, mask: true },
  naval_base:      { x: 64,  y: 0,   width: 64, height: 64, mask: true },
  sam_site:        { x: 128, y: 0,   width: 64, height: 64, mask: true },
  missile_battery: { x: 192, y: 0,   width: 64, height: 64, mask: true },
  aircraft:        { x: 0,   y: 64,  width: 64, height: 64, mask: true },
  ship:            { x: 64,  y: 64,  width: 64, height: 64, mask: true },
  submarine:       { x: 128, y: 64,  width: 64, height: 64, mask: true },
  carrier_group:   { x: 192, y: 64,  width: 64, height: 64, mask: true },
}

export function createIntelUnitLayers(estimatedUnits: EstimatedUnit[]) {
  const iconLayer = new IconLayer<EstimatedUnit>({
    id: 'intel-estimate-icons',
    data: estimatedUnits,
    pickable: true,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: 30,
    getColor: [255, 200, 50, 130],
    sizeScale: 1,
    sizeUnits: 'pixels',
    sizeMinPixels: 18,
    sizeMaxPixels: 40,
  })

  const labelLayer = new TextLayer<EstimatedUnit>({
    id: 'intel-estimate-labels',
    data: estimatedUnits,
    getText: (d) => `? ${d.name}`,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getColor: [255, 200, 50, 160],
    getSize: 10,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'top',
    getPixelOffset: [0, 20],
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontWeight: 600,
    outlineWidth: 2,
    outlineColor: [13, 17, 23, 220],
    sizeUnits: 'pixels',
    sizeMinPixels: 8,
    sizeMaxPixels: 12,
    billboard: true,
    pickable: false,
  })

  return [iconLayer, labelLayer]
}
