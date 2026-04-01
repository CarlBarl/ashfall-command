import { IconLayer, TextLayer } from '@deck.gl/layers'
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
  usa: [68, 136, 204],
  iran: [204, 68, 68],
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
  targetId: string | null,
  targetingMode: boolean,
  onHover: (id: string | null, x?: number, y?: number) => void,
  onClick: (id: string | null) => void,
  onTarget: (id: string | null) => void,
  selectedNation: string | null,
) {
  const iconLayer = new IconLayer<ViewUnit>({
    id: 'unit-layer',
    data: units.filter(u => u.status !== 'destroyed'),
    pickable: true,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: (d) => {
      if (d.id === targetId) return 48
      if (d.id === selectedId) return 44
      if (d.id === hoveredId) return 40
      return 34
    },
    getColor: (d) => {
      // In targeting mode, highlight enemies with a pulsing effect
      if (targetingMode && selectedNation && d.nation !== selectedNation) {
        return [255, 80, 80, 255] as [number, number, number, number]
      }
      if (d.id === targetId) {
        return [255, 50, 50, 255] as [number, number, number, number]
      }
      const base = NATION_COLORS[d.nation] ?? [200, 200, 200]
      const alpha = STATUS_ALPHA[d.status] ?? 255
      return [...base, alpha] as [number, number, number, number]
    },
    sizeScale: 1,
    sizeUnits: 'pixels',
    sizeMinPixels: 22,
    sizeMaxPixels: 56,
    // Larger pick radius makes hovering/clicking much easier
    extensions: [],
    onHover: (info) => {
      onHover(info.object?.id ?? null, info.x, info.y)
    },
    onClick: (info) => {
      const clicked = info.object
      if (!clicked) return
      // In targeting mode, clicking an enemy sets target
      if (targetingMode && selectedNation && clicked.nation !== selectedNation) {
        onTarget(clicked.id)
        return
      }
      onClick(clicked.id)
    },
    updateTriggers: {
      getSize: [selectedId, hoveredId, targetId],
      getColor: [targetingMode, targetId, units.map(u => `${u.id}:${u.status}`).join(',')],
    },
  })

  const visible = units.filter(u => u.status !== 'destroyed')

  const labelLayer = new TextLayer<ViewUnit>({
    id: 'unit-labels',
    data: visible,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getText: (d) => shortName(d.name),
    getSize: 11,
    getColor: (d) => {
      const base = NATION_COLORS[d.nation] ?? [200, 200, 200]
      return [...base, 200] as [number, number, number, number]
    },
    getPixelOffset: [0, 22],
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontWeight: 600,
    outlineWidth: 2,
    outlineColor: [13, 17, 23, 220],
    sizeUnits: 'pixels',
    sizeMinPixels: 9,
    sizeMaxPixels: 13,
    billboard: true,
    pickable: false,
  })

  return [iconLayer, labelLayer]
}

function shortName(name: string): string {
  // Shorten long names: "DDG-89 USS Mustin" → "DDG-89", "Patriot Battery (Qatar)" → "Patriot (QA)"
  if (name.startsWith('DDG-') || name.startsWith('CVN-') || name.startsWith('SSN-')) {
    return name.split(' ').slice(0, 2).join(' ')
  }
  if (name.includes('TEL')) return name.split(' (')[0]
  if (name.includes('Battery')) {
    const loc = name.match(/\(([^)]+)\)/)?.[1] ?? ''
    const type = name.split(' ')[0]
    return `${type} (${loc.substring(0, 3)})`
  }
  if (name.includes('Air Base')) {
    return name.replace(' Air Base', ' AB').replace(/\s*\([^)]*\)/, '')
  }
  return name.length > 16 ? name.substring(0, 14) + '..' : name
}
