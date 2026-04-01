import { IconLayer } from '@deck.gl/layers'
import type { ViewUnit } from '@/types/view'

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

const NATION_COLORS: Record<string, [number, number, number]> = {
  usa: [68, 136, 204],   // --usa-primary
  iran: [204, 68, 68],   // --iran-primary
}

const STATUS_ALPHA: Record<string, number> = {
  ready: 255,
  engaged: 255,
  moving: 230,
  damaged: 180,
  destroyed: 80,
  reloading: 200,
}

export function createUnitLayer(
  units: ViewUnit[],
  selectedId: string | null,
  hoveredId: string | null,
  onHover: (id: string | null) => void,
  onClick: (id: string | null) => void,
) {
  return new IconLayer<ViewUnit>({
    id: 'unit-layer',
    data: units.filter(u => u.status !== 'destroyed'),
    pickable: true,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: (d) => {
      if (d.id === selectedId) return 40
      if (d.id === hoveredId) return 34
      return 28
    },
    getColor: (d) => {
      const base = NATION_COLORS[d.nation] ?? [200, 200, 200]
      const alpha = STATUS_ALPHA[d.status] ?? 255
      return [...base, alpha] as [number, number, number, number]
    },
    sizeScale: 1,
    sizeUnits: 'pixels',
    sizeMinPixels: 16,
    sizeMaxPixels: 48,
    onHover: (info) => {
      onHover(info.object?.id ?? null)
    },
    onClick: (info) => {
      onClick(info.object?.id ?? null)
    },
    updateTriggers: {
      getSize: [selectedId, hoveredId],
      getColor: units.map(u => `${u.id}:${u.status}`).join(','),
    },
  })
}
