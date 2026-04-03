import { TripsLayer } from '@deck.gl/geo-layers'
import { IconLayer } from '@deck.gl/layers'
import type { Missile, NationId } from '@/types/game'
import { weaponSpecs } from '@/data/weapons/missiles'

const TRAIL_COLORS: Record<string, [number, number, number]> = {
  usa: [60, 130, 210],
  iran: [210, 60, 60],
}

const HEAD_COLORS: Record<string, [number, number, number, number]> = {
  usa: [140, 200, 255, 255],
  iran: [255, 140, 120, 255],
}

const INTERCEPTOR_COLOR: [number, number, number, number] = [200, 200, 200, 220]

const ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {
  cruise:    { x: 0,  y: 0, width: 64, height: 64, mask: true },
  ballistic: { x: 64, y: 0, width: 64, height: 64, mask: true },
}

interface MissileHead {
  id: string
  position: [number, number]
  nation: NationId
  type: 'cruise' | 'ballistic'
  bearing: number
  isInterceptor: boolean
  altitude_km: number
  phase: string
}

/** Interpolate missile position along its path at the given game time */
function getMissilePosition(m: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = m
  if (timestamps.length < 2) return null

  if (currentTime <= timestamps[0]) return path[0]
  if (currentTime >= timestamps[timestamps.length - 1]) return path[path.length - 1]

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }
  return null
}

/** Compute bearing (degrees clockwise from north) from the last two path segments */
function getMissileBearing(m: Missile, currentTime: number): number {
  const { timestamps, path } = m
  if (path.length < 2) return 0

  // Find the current segment index
  let idx = path.length - 2
  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      idx = i
      break
    }
  }

  const [lng1, lat1] = path[idx]
  const [lng2, lat2] = path[Math.min(idx + 1, path.length - 1)]

  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1r = lat1 * Math.PI / 180
  const lat2r = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2r)
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function createMissileLayers(
  missiles: Missile[],
  currentTime: number,
  onHover?: (id: string | null, x?: number, y?: number) => void,
) {
  const inflight = missiles.filter(m => m.status === 'inflight')

  // Compute head positions + bearings
  const heads: MissileHead[] = []
  for (const m of inflight) {
    const pos = getMissilePosition(m, currentTime)
    if (!pos) continue
    const spec = weaponSpecs[m.weaponId]
    const isBallistic = spec?.type === 'ballistic_missile'
    heads.push({
      id: m.id,
      position: pos,
      nation: m.nation,
      type: isBallistic ? 'ballistic' : 'cruise',
      bearing: getMissileBearing(m, currentTime),
      isInterceptor: m.is_interceptor,
      altitude_km: m.altitude_km,
      phase: m.phase,
    })
  }

  return [
    // Single thin trail — fading, no double-layer laser effect
    new TripsLayer<Missile>({
      id: 'missile-trail',
      data: inflight,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (d) => d.is_interceptor
        ? [160, 160, 160] as [number, number, number]
        : TRAIL_COLORS[d.nation] ?? [180, 180, 180],
      currentTime,
      trailLength: 300_000, // 5 game minutes
      fadeTrail: true,
      widthMinPixels: 1,
      widthMaxPixels: 2,
      jointRounded: true,
      capRounded: true,
      opacity: 0.5,
    }),

    // Directional arrow heads — rotated by bearing, pickable
    new IconLayer<MissileHead>({
      id: 'missile-heads',
      data: heads,
      pickable: true,
      iconAtlas: '/sprites/missile-atlas.svg',
      iconMapping: ICON_MAPPING,
      getIcon: (d) => d.type,
      getPosition: (d) => d.position,
      getSize: (d) => {
        if (d.isInterceptor) return 14
        return d.type === 'ballistic' ? 20 : 16
      },
      getColor: (d) => d.isInterceptor
        ? INTERCEPTOR_COLOR
        : HEAD_COLORS[d.nation] ?? [255, 255, 255, 255],
      getAngle: (d) => -d.bearing, // deck.gl rotates counter-clockwise; bearing is clockwise
      sizeUnits: 'pixels',
      sizeMinPixels: 10,
      sizeMaxPixels: 24,
      billboard: true,
      onHover: (info) => {
        onHover?.(info.object?.id ?? null, info.x, info.y)
      },
      updateTriggers: {
        getPosition: currentTime,
        getAngle: currentTime,
      },
    }),
  ]
}
