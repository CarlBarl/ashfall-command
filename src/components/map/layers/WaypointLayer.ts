import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { ViewUnit } from '@/types/view'

interface WaypointPath {
  path: [number, number][]
  unitId: string
  nation: string
}

interface WaypointDot {
  position: [number, number]
  unitId: string
  waypointIndex: number
}

export function createWaypointLayers(
  units: ViewUnit[],
  selectedUnitIds: Set<string>,
  onWaypointClick?: (unitId: string, index: number) => void,
) {
  const paths: WaypointPath[] = units
    .filter(u => selectedUnitIds.has(u.id) && u.waypoints && u.waypoints.length > 0)
    .map(u => ({
      path: [
        [u.position.lng, u.position.lat] as [number, number],
        ...u.waypoints.map(w => [w.lng, w.lat] as [number, number]),
      ],
      unitId: u.id,
      nation: u.nation,
    }))

  const dots: WaypointDot[] = paths.flatMap(p =>
    p.path.slice(1).map((pos, i) => ({ position: pos, unitId: p.unitId, waypointIndex: i }))
  )

  return [
    new PathLayer<WaypointPath>({
      id: 'waypoint-paths',
      data: paths,
      getPath: d => d.path,
      getColor: [100, 200, 255, 120],
      getWidth: 2,
      widthUnits: 'pixels' as const,
    }),
    new ScatterplotLayer<WaypointDot>({
      id: 'waypoint-dots',
      data: dots,
      pickable: true,
      getPosition: d => d.position,
      getRadius: 6,
      radiusUnits: 'pixels' as const,
      getFillColor: [100, 200, 255, 200],
      stroked: true,
      getLineColor: [255, 255, 255, 150],
      lineWidthMinPixels: 1,
      onClick: (info) => {
        if (info.object && onWaypointClick) {
          onWaypointClick(info.object.unitId, info.object.waypointIndex)
        }
      },
    }),
  ]
}
