import { IconLayer, TextLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { ViewUnit } from '@/types/view'
import { clusterUnits, isCluster, type UnitCluster } from './cluster'

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

/** Flattened render item — either a solo unit or a cluster rendered as its primary */
interface RenderUnit {
  id: string
  position: { lng: number; lat: number }
  category: string
  nation: string
  status: string
  name: string
  isCluster: boolean
  count: number
  health: number
}

function toRenderUnit(item: ViewUnit | UnitCluster): RenderUnit {
  if (isCluster(item)) {
    const avgHealth = Math.round(item.units.reduce((s, u) => s + u.health, 0) / item.units.length)
    return {
      id: item.id,
      position: item.position,
      category: item.primary.category,
      nation: item.nation,
      status: item.primary.status,
      name: clusterLabel(item),
      isCluster: true,
      count: item.count,
      health: avgHealth,
    }
  }
  return {
    id: item.id,
    position: item.position,
    category: item.category,
    nation: item.nation,
    status: item.status,
    name: shortName(item.name),
    isCluster: false,
    count: 1,
    health: item.health,
  }
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
  zoom: number,
) {
  const clustered = clusterUnits(units, zoom)
  const renderItems = clustered.map(toRenderUnit)

  // Build a lookup: clusterId → UnitCluster (for click handling)
  const clusterMap = new Map<string, UnitCluster>()
  for (const item of clustered) {
    if (isCluster(item)) clusterMap.set(item.id, item)
  }

  _lastClusterMap = clusterMap

  const iconLayer = new IconLayer<RenderUnit>({
    id: 'unit-layer',
    data: renderItems,
    pickable: true,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: (d) => {
      if (d.id === targetId) return 48
      if (d.id === selectedId) return 44
      if (d.id === hoveredId) return 40
      // Clusters are slightly larger
      if (d.isCluster) return 38
      return 34
    },
    getColor: (d) => {
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
    onHover: (info) => {
      onHover(info.object?.id ?? null, info.x, info.y)
    },
    onClick: (info) => {
      const clicked = info.object
      if (!clicked) return
      if (targetingMode && selectedNation && clicked.nation !== selectedNation) {
        // For clusters in targeting mode, target the primary unit
        const cluster = clusterMap.get(clicked.id)
        onTarget(cluster ? cluster.primary.id : clicked.id)
        return
      }
      onClick(clicked.id)
    },
    updateTriggers: {
      getSize: [selectedId, hoveredId, targetId],
      getColor: [targetingMode, targetId, units.map(u => `${u.id}:${u.status}`).join(',')],
    },
  })

  // Labels: show name + count badge for clusters
  const labelLayer = new TextLayer<RenderUnit>({
    id: 'unit-labels',
    data: renderItems,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getText: (d) => d.isCluster ? `${d.name} [${d.count}]` : d.name,
    getSize: 11,
    getColor: (d) => {
      const base = NATION_COLORS[d.nation] ?? [200, 200, 200]
      return [...base, 200] as [number, number, number, number]
    },
    getPixelOffset: [0, 24],
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

  // Count badge for clusters — a bright number above the icon
  const clusterItems = renderItems.filter(d => d.isCluster)
  const badgeLayer = new TextLayer<RenderUnit>({
    id: 'cluster-badges',
    data: clusterItems,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getText: (d) => String(d.count),
    getSize: 12,
    getColor: [255, 255, 255, 240],
    getPixelOffset: [16, -16],
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontWeight: 700,
    outlineWidth: 3,
    outlineColor: [13, 17, 23, 255],
    sizeUnits: 'pixels',
    billboard: true,
    pickable: false,
    background: true,
    getBackgroundColor: (d) => {
      const base = NATION_COLORS[d.nation] ?? [100, 100, 100]
      return [...base, 200] as [number, number, number, number]
    },
    backgroundPadding: [3, 1],
  })

  // Invisible pick layer — much larger hit area (24px radius) for easy clicking
  const pickLayer = new ScatterplotLayer<RenderUnit>({
    id: 'unit-pick-layer',
    data: renderItems,
    pickable: true,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getRadius: 24,
    radiusUnits: 'pixels',
    getFillColor: [0, 0, 0, 1], // near-invisible but pickable (alpha=0 breaks deck.gl picking)
    stroked: false,
    onHover: (info) => {
      onHover(info.object?.id ?? null, info.x, info.y)
    },
    onClick: (info) => {
      const clicked = info.object
      if (!clicked) return
      if (targetingMode && selectedNation && clicked.nation !== selectedNation) {
        const cluster = clusterMap.get(clicked.id)
        onTarget(cluster ? cluster.primary.id : clicked.id)
        return
      }
      onClick(clicked.id)
    },
  })

  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return [pickLayer, iconLayer, badgeLayer]
  }

  return [pickLayer, iconLayer, labelLayer, badgeLayer]
}

let _lastClusterMap = new Map<string, UnitCluster>()

/** Get the cluster map from the last render (used by GameMap for click handling) */
export function getLastClusterMap(): Map<string, UnitCluster> {
  return _lastClusterMap
}

function clusterLabel(c: UnitCluster): string {
  // Show location name from primary unit
  const loc = c.primary.name.match(/\(([^)]+)\)/)?.[1] ?? ''
  if (loc) return loc
  return shortName(c.primary.name)
}

function shortName(name: string): string {
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
