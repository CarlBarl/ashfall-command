import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { Position } from '@/types/game'
import { haversine } from '@/engine/utils/geo'

interface RouteSegment {
  path: [number, number][]
  color: [number, number, number, number]
}

interface RouteWaypoint {
  position: [number, number]
  index: number
}

/**
 * Create deck.gl layers for the missile route planner.
 * Renders a path from launcher through waypoints to target,
 * color-coded by threat exposure (red = within enemy radar, green = safe).
 */
export function createRouteLayers(
  launcherPos: Position,
  waypoints: Position[],
  targetPos: Position,
  enemyRadars: { position: Position; range_km: number }[],
) {
  const allPoints = [launcherPos, ...waypoints, targetPos]

  // Build path segments with exposure coloring
  const segments: RouteSegment[] = []

  for (let i = 0; i < allPoints.length - 1; i++) {
    const from = allPoints[i]
    const to = allPoints[i + 1]

    // Check if midpoint of segment is within any enemy radar range
    const midLat = (from.lat + to.lat) / 2
    const midLng = (from.lng + to.lng) / 2
    const midPos: Position = { lat: midLat, lng: midLng }
    const exposed = enemyRadars.some(r =>
      haversine(midPos, r.position) <= r.range_km,
    )

    segments.push({
      path: [[from.lng, from.lat], [to.lng, to.lat]],
      color: exposed ? [255, 50, 50, 200] : [50, 255, 50, 200],
    })
  }

  const pathLayer = new PathLayer<RouteSegment>({
    id: 'route-path',
    data: segments,
    getPath: d => d.path,
    getColor: d => d.color,
    getWidth: 3,
    widthUnits: 'pixels' as const,
  })

  // Waypoint dots (only the intermediate waypoints, not launcher/target)
  const wpData: RouteWaypoint[] = waypoints.map((wp, i) => ({
    position: [wp.lng, wp.lat] as [number, number],
    index: i,
  }))

  const waypointLayer = new ScatterplotLayer<RouteWaypoint>({
    id: 'route-waypoints',
    data: wpData,
    getPosition: d => d.position,
    getRadius: 8,
    getFillColor: [255, 255, 100, 200],
    getLineColor: [255, 200, 50, 255],
    stroked: true,
    lineWidthMinPixels: 2,
    radiusUnits: 'pixels' as const,
  })

  return [pathLayer, waypointLayer]
}

/** Compute total route distance in km: launcher -> waypoints -> target */
export function computeRouteDistance(
  launcherPos: Position,
  waypoints: Position[],
  targetPos: Position,
): number {
  const allPoints = [launcherPos, ...waypoints, targetPos]
  let total = 0
  for (let i = 0; i < allPoints.length - 1; i++) {
    total += haversine(allPoints[i], allPoints[i + 1])
  }
  return total
}
